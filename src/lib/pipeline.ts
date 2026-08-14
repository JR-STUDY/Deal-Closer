/**
 * 파이프라인 집계 — 단계별 합계(F-402) · 가중 예상 매출(F-404) · 기간 필터(F-406) ·
 * 캘린더 월 요약(F-302).
 *
 * DB 에 접근하지 않는 순수 함수만 둔다. 호출측(서버 컴포넌트·API 라우트)이 조회한
 * 기회 배열을 넘기면 계산 결과만 돌려준다. 대시보드와 캘린더가 같은 계산을 공유하도록
 * 여기 한 곳에 모은다 (구현 계획 §4-③).
 *
 * server-only 를 import 하지 않으므로 서버와 클라이언트에서 모두 사용한다.
 * 금액은 모두 원(KRW) 단위 정수다 (정책 FORM_CURRENCY_KRW).
 */

import {
  OPEN_OPPORTUNITY_STAGES,
  OPPORTUNITY_STAGES,
  isOpportunityStage,
  type OpportunityStage,
} from "./constants";

/**
 * 집계에 필요한 최소 필드. Prisma 의 `Opportunity` row 를 그대로 넘길 수 있다
 * (구조적 타이핑이므로 추가 필드가 있어도 된다).
 * `stage` 는 DB 가 String 컬럼이라 넓게 받고 내부에서 좁힌다 —
 * 알 수 없는 값은 집계에서 제외한다.
 */
export type PipelineOpportunity = {
  stage: string;
  /**
   * 예상 금액 (KRW 정수).
   *
   * **확정 문서에서 파생된 값**이다 (기회-6) — 담당자가 손으로 넣은 숫자가 아니라
   * `@/lib/opportunity-amount` 가 확정 문서의 금액을 복제해 둔 것이고, 확정 문서가 없는
   * 기회는 0 이다. 집계 방식 자체는 그대로다(합계는 여전히 단순 합) — 다만 합계가 줄었다면
   * 계산이 틀린 게 아니라 **근거 문서가 없는 기회가 있다**는 뜻이므로, 화면은 0원 기회를
   * "확정 문서 없음" 으로 안내해 문서를 붙이도록 유도한다.
   */
  expectedAmount: number;
  /** 예상 마감일. null 이면 기간·월 집계 대상에서 빠진다. */
  expectedCloseDate: Date | null;
};

/** 집계 공통 옵션 */
export type PipelineFilterOptions = {
  /** true 면 진행 중 단계(INITIAL·PROPOSAL·NEGOTIATION)만 집계한다. 기본 false. */
  openOnly?: boolean;
};

/** 진행 중(마감되지 않은) 단계인지 */
export function isOpenStage(stage: OpportunityStage): boolean {
  return (OPEN_OPPORTUNITY_STAGES as readonly OpportunityStage[]).includes(stage);
}

/**
 * 집계 대상이면 좁혀진 단계를, 아니면 null 을 돌려준다.
 * 알 수 없는 stage 값과 openOnly 일 때의 마감 기회를 걸러내는 공통 관문이다.
 */
function countableStage(
  opportunity: PipelineOpportunity,
  options: PipelineFilterOptions,
): OpportunityStage | null {
  const { stage } = opportunity;
  if (!isOpportunityStage(stage)) return null;
  if (options.openOnly && !isOpenStage(stage)) return null;
  return stage;
}

// ────────────────────────── 단계별 집계 (F-402) ──────────────────────────

export type StageSummary = {
  stage: OpportunityStage;
  /** 해당 단계의 기회 수 */
  count: number;
  /** 해당 단계의 예상 금액 합계 (KRW 정수) */
  amount: number;
};

export type PipelineSummary = {
  /** 단계 축 순서대로. 기회가 없는 단계도 count·amount 0 으로 포함한다. */
  stages: StageSummary[];
  totalCount: number;
  totalAmount: number;
};

/**
 * 단계별 기회 수와 예상 금액 합계를 낸다 (F-402).
 * 화면이 빈 단계 칸도 그려야 하므로 0건인 단계도 항목으로 남긴다.
 */
export function summarizeByStage(
  opportunities: readonly PipelineOpportunity[],
  options: PipelineFilterOptions = {},
): PipelineSummary {
  const axis: readonly OpportunityStage[] = options.openOnly
    ? OPEN_OPPORTUNITY_STAGES
    : OPPORTUNITY_STAGES;

  const stages: StageSummary[] = axis.map((stage) => ({ stage, count: 0, amount: 0 }));
  const byStage = new Map<OpportunityStage, StageSummary>(
    stages.map((summary) => [summary.stage, summary]),
  );

  let totalCount = 0;
  let totalAmount = 0;

  for (const opportunity of opportunities) {
    const stage = countableStage(opportunity, options);
    if (!stage) continue;
    const summary = byStage.get(stage);
    if (!summary) continue;
    summary.count += 1;
    summary.amount += opportunity.expectedAmount;
    totalCount += 1;
    totalAmount += opportunity.expectedAmount;
  }

  return { stages, totalCount, totalAmount };
}

// ─────────────────────── 가중 예상 매출 (F-404) ───────────────────────

/**
 * 단계별 수주 확률 테이블 (0~1).
 *
 * TODO(F-404): PRD 에 단계별 확률 수치가 없다 (구현 계획 §8.2 "F-404 단계별 확률").
 * 여기서 기본값을 임의로 정하면 대시보드의 예측 매출이 근거 없는 숫자가 되므로,
 * 수치가 확정될 때까지 호출측이 명시적으로 넘기게 한다. 확정되면 이 파일에 기본
 * 테이블 상수를 추가할지, 조직별 설정으로 둘지 함께 결정한다.
 */
export type StageProbabilities = Readonly<Record<OpportunityStage, number>>;

/**
 * 가중 예상 매출 = Σ(예상 금액 × 단계 확률) (F-404).
 * 진행 중 기회만 보려면 `{ openOnly: true }` 를 넘기고, 전체를 볼 때는 확률 테이블의
 * WON·LOST 값(보통 1·0)으로 처리한다.
 *
 * 확률이 없거나 유한하지 않은 단계는 0 으로 본다. 결과는 원 단위 정수로 반올림한다.
 */
export function weightedForecast(
  opportunities: readonly PipelineOpportunity[],
  probabilities: StageProbabilities,
  options: PipelineFilterOptions = {},
): number {
  let sum = 0;
  for (const opportunity of opportunities) {
    const stage = countableStage(opportunity, options);
    if (!stage) continue;
    const probability = probabilities[stage];
    if (!Number.isFinite(probability)) continue;
    sum += opportunity.expectedAmount * probability;
  }
  return Math.round(sum);
}

// ─────────────────────────── 기간 필터 (F-406) ───────────────────────────

export const PERIOD_UNITS = ["week", "month", "quarter"] as const;
export type PeriodUnit = (typeof PERIOD_UNITS)[number];

export const PERIOD_UNIT_LABELS: Record<PeriodUnit, string> = {
  week: "주간",
  month: "월간",
  quarter: "분기",
};

/** 주 시작 요일 (0=일 … 6=토). 업무 주간 기준이라 월요일로 둔다. */
export const WEEK_START_DAY = 1;

/** 기간 구간. `start` 이상 `end` 미만 (end 는 배타) — 경계 날짜의 중복 집계를 막는다. */
export type DateRange = { start: Date; end: Date };

/**
 * 기준일이 속한 주/월/분기 구간을 만든다 (F-406).
 * 모두 로컬 타임존 기준이며, 표시 포맷(`@/lib/format`)과 기준을 맞춘 것이다.
 */
export function periodRange(unit: PeriodUnit, reference: Date): DateRange {
  const year = reference.getFullYear();
  const month = reference.getMonth();

  if (unit === "month") {
    return { start: new Date(year, month, 1), end: new Date(year, month + 1, 1) };
  }

  if (unit === "quarter") {
    const firstMonth = Math.floor(month / 3) * 3;
    return {
      start: new Date(year, firstMonth, 1),
      end: new Date(year, firstMonth + 3, 1),
    };
  }

  // week — 기준일이 속한 주의 시작 요일 00:00 부터 7일간
  const dayOfMonth = reference.getDate();
  const offset = (reference.getDay() - WEEK_START_DAY + 7) % 7;
  const start = new Date(year, month, dayOfMonth - offset);
  return {
    start,
    end: new Date(start.getFullYear(), start.getMonth(), start.getDate() + 7),
  };
}

/** 특정 연·월(month 는 1~12)의 구간 */
export function monthRange(year: number, month: number): DateRange {
  return { start: new Date(year, month - 1, 1), end: new Date(year, month, 1) };
}

/** 날짜가 구간에 속하는지 (start 이상 end 미만) */
export function isWithinRange(date: Date, range: DateRange): boolean {
  return date >= range.start && date < range.end;
}

/**
 * 예상 마감일이 구간에 속하는 기회만 남긴다 (F-406).
 * 마감일이 없는 기회는 제외한다 — 기간 집계에 넣을 근거가 없다.
 */
export function filterByCloseDate<T extends PipelineOpportunity>(
  opportunities: readonly T[],
  range: DateRange,
): T[] {
  return opportunities.filter(
    (opportunity) =>
      opportunity.expectedCloseDate !== null &&
      isWithinRange(opportunity.expectedCloseDate, range),
  );
}

// ───────────────────── 캘린더 월 요약 (F-302) ─────────────────────

export type MonthlyClosingSummary = {
  year: number;
  /** 1~12 */
  month: number;
  /** 그 달에 마감 예정인 기회 수 */
  count: number;
  /** 그 달 마감 예정 기회의 예상 매출 합계 (KRW 정수) */
  expectedAmount: number;
};

/**
 * 캘린더 상단 요약바용 월별 마감 집계 (F-302).
 * 월을 이동할 때마다 그 달 기회로 다시 계산한다.
 */
export function summarizeMonthlyClosing(
  opportunities: readonly PipelineOpportunity[],
  year: number,
  month: number,
  options: PipelineFilterOptions = {},
): MonthlyClosingSummary {
  const inMonth = filterByCloseDate(opportunities, monthRange(year, month));

  let count = 0;
  let expectedAmount = 0;
  for (const opportunity of inMonth) {
    if (!countableStage(opportunity, options)) continue;
    count += 1;
    expectedAmount += opportunity.expectedAmount;
  }

  return { year, month, count, expectedAmount };
}
