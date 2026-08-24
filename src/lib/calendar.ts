/**
 * 월 캘린더 — 달 그리드 계산 · 일정 배치 · 월 합계 **순수 함수** (F-302).
 *
 * 대시보드의 캘린더 카드가 쓰는 계산을 한 곳에 모은다
 * (`@/lib/pagination`·`@/lib/opportunity-progress` 와 같은 선례 — 화면은 그리기만 하고
 * 규칙은 이 모듈이 단독으로 정한다).
 *
 * 캘린더에 올리는 일정은 **영업 기회의 예상 마감일(`Opportunity.expectedCloseDate`)** 하나다.
 * 갱신 예정일 같은 별도 필드는 만들지 않았다 — 마감일이 곧 "그날 무슨 일이 있는가" 이고,
 * 출처가 둘이면 어느 날짜가 진짜인지 화면에서 알 수 없다.
 *
 * 월 구간·기간 판정은 **`@/lib/pipeline` 의 순수 함수를 재사용**한다(`monthRange`·
 * `isWithinRange`·`WEEK_START_DAY`). 같은 "그 달" 을 두 모듈이 각자 계산하면 파이프라인
 * 요약과 캘린더 합계가 하루 차이로 갈린다. 대시보드 페이지가 `pipeline` 을 직접 부르는 것이
 * 아니라 이 모듈을 지난다 — 대시보드 상단 KPI(문서 기준 누적 매출)와 캘린더 합계(기회 기준)는
 * 여전히 **다른 숫자**이고, 같게 맞추려 들지 않는다.
 *
 * 날짜는 모두 **로컬 자정 기준**으로 다룬다 (`@/lib/format` 의 표시 기준과 같다).
 * `toISOString()` 으로 날짜 칸을 정하지 않는다 — UTC 로 밀려 하루 어긋난 칸에 일정이 붙는다.
 *
 * server-only 를 import 하지 않으므로 서버 컴포넌트·클라이언트·`tsx` 테스트에서 모두 쓴다.
 */

import {
  OPPORTUNITY_STAGE_LABELS,
  isClosedOpportunityStage,
  isOpportunityStage,
  type OpportunityStage,
} from "./constants";
import { WEEK_START_DAY, isWithinRange, monthRange, type DateRange } from "./pipeline";

/** 보고 있는 달을 담는 쿼리 키 (`?month=YYYY-MM`) */
export const MONTH_PARAM = "month";

/**
 * 전용 캘린더 페이지 주소.
 *
 * 대시보드 카드의 `전체 보기`, 사이드바의 하위 항목, 그 페이지 자신의 월 이동 링크가
 * **같은 문자열**을 봐야 한다 — 세 곳에 손으로 적어 두면 주소를 옮길 때 하나가 남는다.
 * `영업 기회` 묶음 아래인 이유는 캘린더가 보여주는 것이 기회의 마감일이기 때문이다.
 */
export const CALENDAR_HREF = "/opportunities/calendar";

/** 캘린더가 보여줄 달. `month` 는 1~12 다 (Date 의 0-based 와 섞이지 않게 사람 기준으로 둔다). */
export type CalendarMonth = { year: number; month: number };

/** 한 칸에 그대로 보여줄 일정 수. 넘치는 만큼은 `+N건` 으로 접는다. */
export const DAY_EVENT_LIMIT = 2;

/**
 * 컴팩트 캘린더(대시보드 카드)의 한 칸에 보여줄 **표식** 수.
 *
 * 컴팩트 칸은 기회명 대신 결말 아이콘만 놓으므로 같은 폭에 더 많이 들어간다.
 * 밀도마다 상한을 **하나씩 정해 둔다** — 화면이 `slice` 를 직접 하면 어떤 날은 2개,
 * 어떤 날은 3개가 보이는 상태가 생긴다.
 */
export const COMPACT_DAY_EVENT_LIMIT = 3;

/** 그리드 한 주의 칸 수 */
const DAYS_PER_WEEK = 7;

/**
 * 요일 머리글 — 주 시작 요일(`WEEK_START_DAY`)부터 돌린 순서다.
 * 배열을 손으로 적어 두면 주 시작 요일을 바꿀 때 머리글만 예전 순서로 남는다.
 */
const WEEK_DAY_NAMES = ["일", "월", "화", "수", "목", "금", "토"] as const;

/**
 * 요일 머리글 한 칸 — 라벨과 **요일 번호**를 함께 든다.
 *
 * 번호를 같이 주는 이유: 토·일을 색으로 구분하려면 화면이 "이 칸이 무슨 요일인가"를 알아야
 * 하는데, 열 순번은 `WEEK_START_DAY` 가 바뀌면 요일과 어긋난다. 라벨 문자열("토")로 판단하는
 * 방법도 있지만 그러면 낱말을 바꾸는 순간 색이 조용히 사라진다.
 */
export type WeekDayHead = { label: string; weekday: number };

export const WEEK_DAYS: readonly WeekDayHead[] = Array.from(
  { length: DAYS_PER_WEEK },
  (_, index) => {
    const weekday = (WEEK_START_DAY + index) % DAYS_PER_WEEK;
    return { label: WEEK_DAY_NAMES[weekday], weekday };
  },
);

/** 요일 머리글 문자열만 — 기존 소비처·테스트가 쓰는 형태를 그대로 유지한다 */
export const WEEK_DAY_LABELS: readonly string[] = WEEK_DAYS.map(
  (head) => head.label,
);

/**
 * 주말 구분 — 색 표기의 **단일 기준**이다 (평일은 null).
 * 머리글과 날짜 숫자가 각자 판단하면 한쪽만 고쳤을 때 열과 셀의 색이 어긋난다.
 */
export function weekendKind(weekday: number): "sunday" | "saturday" | null {
  if (weekday === 0) return "sunday";
  if (weekday === 6) return "saturday";
  return null;
}

// ─────────────────────────── 달 · 쿼리 파라미터 ───────────────────────────

/** 그 날짜가 속한 달 (로컬 기준) */
export function monthOf(date: Date): CalendarMonth {
  return { year: date.getFullYear(), month: date.getMonth() + 1 };
}

/** 두 달이 같은지 */
export function isSameMonth(a: CalendarMonth, b: CalendarMonth): boolean {
  return a.year === b.year && a.month === b.month;
}

/** `?month=` 에 실을 문자열 (`2026-08`) */
export function formatMonthParam({ year, month }: CalendarMonth): string {
  return `${year}-${String(month).padStart(2, "0")}`;
}

/** 화면에 적을 달 이름 (`2026년 8월`) */
export function monthLabel({ year, month }: CalendarMonth): string {
  return `${year}년 ${month}월`;
}

/**
 * `?month=` 값을 달로 좁힌다.
 *
 * 형식이 아니거나 범위를 벗어난 값(13월·0월·1899년)은 **이번 달**로 본다 —
 * 주소를 손으로 고쳐도 화면이 깨지지 않는 것이 우선이다
 * (`parsePageParam` 이 잘못된 page 를 1로 떨어뜨리는 것과 같은 판단).
 */
export function parseMonthParam(
  raw: string | null | undefined,
  today: Date = new Date(),
): CalendarMonth {
  const trimmed = raw?.trim() ?? "";
  const matched = /^(\d{4})-(\d{2})$/.exec(trimmed);
  if (!matched) return monthOf(today);

  const year = Number(matched[1]);
  const month = Number(matched[2]);
  if (year < 1970 || year > 9999) return monthOf(today);
  if (month < 1 || month > 12) return monthOf(today);
  return { year, month };
}

/**
 * 달을 앞뒤로 옮긴다 (`-1` 이전 달 · `+1` 다음 달).
 * 연 경계는 `Date` 가 정규화하게 맡긴다 — 12월 +1 = 다음 해 1월.
 */
export function shiftMonth({ year, month }: CalendarMonth, delta: number): CalendarMonth {
  return monthOf(new Date(year, month - 1 + Math.trunc(delta), 1));
}

/**
 * 달 이동 주소. 검색·필터 파라미터를 유지하고 **이번 달이면 `month` 를 지운다** —
 * 기본 상태의 주소가 지저분해지지 않는다 (`pageHref` 가 1페이지를 지우는 것과 같은 이유).
 */
export function monthHref(
  basePath: string,
  query: Readonly<Record<string, string>>,
  target: CalendarMonth,
  today: Date = new Date(),
): string {
  const sp = new URLSearchParams();
  for (const [key, value] of Object.entries(query)) {
    if (key === MONTH_PARAM) continue;
    const trimmed = value?.trim() ?? "";
    if (trimmed) sp.set(key, trimmed);
  }
  if (!isSameMonth(target, monthOf(today))) {
    sp.set(MONTH_PARAM, formatMonthParam(target));
  }
  const qs = sp.toString();
  return qs ? `${basePath}?${qs}` : basePath;
}

// ─────────────────────────── 달 그리드 ───────────────────────────

/** 날짜 칸을 가리키는 키 (`2026-08-01`) — 로컬 기준이라 UTC 로 밀리지 않는다 */
export function dayKey(date: Date): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

/**
 * 그리드가 덮는 구간 — 앞뒤 달에서 끌어온 칸까지 포함한다 (`start` 이상 `end` 미만).
 *
 * 조회 범위로 그대로 쓴다. 그 달만 조회하면 **월 경계를 넘는 칸이 항상 비어** 보여,
 * 8월 31일(금)과 9월 1일(토)이 같은 주에 있는데도 9월 일정이 사라진다.
 */
export function gridRange(target: CalendarMonth): DateRange {
  const { start } = monthRange(target.year, target.month);
  const lead = (start.getDay() - WEEK_START_DAY + DAYS_PER_WEEK) % DAYS_PER_WEEK;
  const gridStart = new Date(start.getFullYear(), start.getMonth(), 1 - lead);
  const weeks = gridWeekCount(target);
  return {
    start: gridStart,
    end: new Date(
      gridStart.getFullYear(),
      gridStart.getMonth(),
      gridStart.getDate() + weeks * DAYS_PER_WEEK,
    ),
  };
}

/**
 * 그 달을 그리는 데 필요한 주 수 (4~6).
 * 칸 수를 42로 고정하지 않는다 — 2월처럼 짧은 달에 빈 주가 한 줄 남는다.
 */
function gridWeekCount(target: CalendarMonth): number {
  const { start, end } = monthRange(target.year, target.month);
  const lead = (start.getDay() - WEEK_START_DAY + DAYS_PER_WEEK) % DAYS_PER_WEEK;
  const daysInMonth = Math.round((end.getTime() - start.getTime()) / 86_400_000);
  return Math.ceil((lead + daysInMonth) / DAYS_PER_WEEK);
}

// ─────────────────────────── 일정 (기회 마감 예정) ───────────────────────────

/**
 * 캘린더에 올릴 기회의 최소 필드. Prisma row 를 그대로 넘길 수 있다(구조적 타이핑).
 * `stage` 는 DB 가 String 컬럼이라 넓게 받고 안에서 좁힌다.
 */
export type CalendarOpportunity = {
  id: string;
  name: string;
  stage: string;
  /** 예상 금액 (KRW 정수) — 확정 문서에서 파생된 값이다 (기회-6) */
  expectedAmount: number;
  /** 예상 마감일. null 이면 어느 칸에도 놓지 않는다 — 놓을 근거가 없다. */
  expectedCloseDate: Date | null;
};

/**
 * 일정의 결말 — 진행 중 / 수주 / 실주.
 *
 * 색만으로 구분하지 않기 위해(ACC_*) 화면이 **모양과 라벨**을 붙일 근거로 쓴다.
 * 단계(`stage`) 그대로가 아니라 셋으로 줄이는 이유는 캘린더 칸이 좁아 초기·제안·검토/협상을
 * 따로 구분해 봐야 읽히지 않고, 이 화면에서 알고 싶은 것은 "끝났는지, 끝났으면 어느 쪽인지"다.
 */
export const CALENDAR_OUTCOMES = ["open", "won", "lost"] as const;
export type CalendarOutcome = (typeof CALENDAR_OUTCOMES)[number];

/** 결말 라벨 — 마감 쪽은 단계 라벨에서 파생시킨다(표기가 바뀌면 함께 바뀐다) */
export const CALENDAR_OUTCOME_LABELS: Record<CalendarOutcome, string> = {
  open: "진행 중",
  won: OPPORTUNITY_STAGE_LABELS.WON,
  lost: OPPORTUNITY_STAGE_LABELS.LOST,
};

/** 단계 → 결말. 정의 밖 단계는 판정할 수 없어 null 이다(일정에서 뺀다). */
export function outcomeOfStage(stage: string): CalendarOutcome | null {
  if (!isOpportunityStage(stage)) return null;
  if (!isClosedOpportunityStage(stage)) return "open";
  return stage === "WON" ? "won" : "lost";
}

/** 캘린더 칸에 놓인 일정 한 건 */
export type CalendarEvent = {
  id: string;
  name: string;
  /** 예상 금액 (KRW 정수) */
  amount: number;
  stage: OpportunityStage;
  outcome: CalendarOutcome;
  /** 기회 상세 주소 */
  href: string;
};

/** 기회 상세 주소 — 화면이 문자열을 조립하지 않도록 여기서 만든다 */
export function opportunityHref(id: string): string {
  return `/opportunities/${id}`;
}

/** 날짜 칸 하나 */
export type CalendarDay = {
  /** 로컬 자정 */
  date: Date;
  /** `dayKey` 와 같은 문자열 — React key·테스트 비교에 쓴다 */
  key: string;
  /** 1~31 */
  day: number;
  /** 보고 있는 달의 날짜인지. false 면 앞뒤 달에서 끌어온 칸이다. */
  inMonth: boolean;
  /** 오늘인지 */
  isToday: boolean;
  /** 그날 마감 예정인 기회 (금액 큰 순) */
  events: CalendarEvent[];
};

export type CalendarGrid = {
  target: CalendarMonth;
  /** 주 단위로 묶은 날짜 칸 (각 주는 7칸) */
  weeks: CalendarDay[][];
  /** 이 그리드가 덮는 구간 — 조회 범위와 같다 */
  range: DateRange;
};

/**
 * 기회를 날짜 칸에 배치한 달 그리드를 만든다.
 *
 * - 마감일이 없는 기회는 어느 칸에도 놓지 않는다.
 * - 정의 밖 단계(잘못된 문자열)도 놓지 않는다 — 결말을 판정할 수 없다.
 * - 그리드 구간 밖(앞뒤 달의 그리드에 없는 날) 기회는 무시한다.
 * - 한 칸 안의 순서는 **금액 내림차순 → 기회명 → id** 다. 금액이 큰 건을 먼저 보이게 하고,
 *   같은 값이 여럿일 때 순서가 흔들리지 않도록 마지막 기준을 못박는다
 *   (목록 정렬에 `{ id: asc }` 를 붙이는 것과 같은 이유).
 */
export function calendarGrid({
  target,
  opportunities,
  today = new Date(),
}: {
  target: CalendarMonth;
  opportunities: readonly CalendarOpportunity[];
  today?: Date;
}): CalendarGrid {
  const range = gridRange(target);
  const byDay = new Map<string, CalendarEvent[]>();

  for (const opportunity of opportunities) {
    const closeDate = opportunity.expectedCloseDate;
    if (!closeDate) continue;
    if (!isWithinRange(closeDate, range)) continue;
    const outcome = outcomeOfStage(opportunity.stage);
    if (!outcome || !isOpportunityStage(opportunity.stage)) continue;

    const key = dayKey(closeDate);
    const events = byDay.get(key) ?? [];
    events.push({
      id: opportunity.id,
      name: opportunity.name,
      amount: opportunity.expectedAmount,
      stage: opportunity.stage,
      outcome,
      href: opportunityHref(opportunity.id),
    });
    byDay.set(key, events);
  }

  for (const events of byDay.values()) {
    events.sort(
      (a, b) =>
        b.amount - a.amount || a.name.localeCompare(b.name, "ko") || a.id.localeCompare(b.id),
    );
  }

  const todayKey = dayKey(today);
  const weeks: CalendarDay[][] = [];
  const cursor = new Date(range.start);

  while (cursor < range.end) {
    const week: CalendarDay[] = [];
    for (let index = 0; index < DAYS_PER_WEEK; index += 1) {
      const date = new Date(cursor.getFullYear(), cursor.getMonth(), cursor.getDate() + index);
      const key = dayKey(date);
      week.push({
        date,
        key,
        day: date.getDate(),
        inMonth: date.getFullYear() === target.year && date.getMonth() + 1 === target.month,
        isToday: key === todayKey,
        events: byDay.get(key) ?? [],
      });
    }
    weeks.push(week);
    cursor.setDate(cursor.getDate() + DAYS_PER_WEEK);
  }

  return { target, weeks, range };
}

/**
 * 칸이 넘칠 때 보여줄 만큼만 남기고 나머지 수를 알린다 (`+N건`).
 * 화면이 `slice` 를 직접 하지 않게 규칙을 여기 둔다 — 접는 기준이 칸마다 달라지면
 * 어떤 날은 2건, 어떤 날은 3건이 보인다.
 */
export function foldDayEvents(
  events: readonly CalendarEvent[],
  limit: number = DAY_EVENT_LIMIT,
): { visible: CalendarEvent[]; hiddenCount: number } {
  const safeLimit = Math.max(1, Math.trunc(limit));
  if (events.length <= safeLimit) return { visible: [...events], hiddenCount: 0 };
  return {
    visible: events.slice(0, safeLimit),
    hiddenCount: events.length - safeLimit,
  };
}

// ─────────────────────────── 월 합계 (매출 예상) ───────────────────────────

/**
 * 그 달의 매출 요약.
 *
 * 화면이 큰 글씨로 내는 두 숫자는 **확정 금액**(그 달 수주 합)과 **전체 기회 금액**
 * (그 달에 마감 예정인 기회 전부의 합 — **실주까지 포함**)이다.
 * "된 돈"과 "그 달에 걸려 있던 판의 크기"는 서로 다른 사실이라 **한 숫자로 합치지 않는다**.
 *
 * 예전에는 `예상 매출`(진행 중 합)과 `확정 매출`(수주 합) 둘이었다. 진행 중만 세면 그 달에
 * 실제로 다룬 규모가 실주한 만큼 조용히 빠져 나가, 달을 넘길 때마다 총량이 줄어드는 것처럼
 * 보였다 — 실주는 없어진 일이 아니라 **끝난 일**이다. 진행 중 합은 사라지지 않았고
 * (`expectedAmount`) 전체 타일의 보조 줄에 남는다.
 *
 * 세 결말의 금액과 건수를 **각각** 들고 있는다 — 화면이 뺄셈으로 되짚지 않게 한다
 * (`total - confirmed` 로는 진행 중과 실주를 가릴 수 없다).
 *
 * 기준은 **그 달(1일 00:00 이상 다음 달 1일 00:00 미만)** 이라, 그리드에 함께 그려지는
 * 앞뒤 달 칸의 일정은 합계에 들어가지 않는다.
 */
export type MonthRevenue = {
  target: CalendarMonth;
  /** 진행 중 기회의 예상 금액 합계 (KRW 정수) */
  expectedAmount: number;
  expectedCount: number;
  /** 수주한 기회의 금액 합계 (KRW 정수) */
  confirmedAmount: number;
  confirmedCount: number;
  /** 실주한 기회의 금액 합계 (KRW 정수) — 전체 금액에 포함된다 */
  lostAmount: number;
  lostCount: number;
  /** 진행 중 + 수주 + 실주 금액 합계 (KRW 정수) */
  totalAmount: number;
  /** 그 달에 마감 예정인 기회 건수 (결말과 무관하게 전부) */
  totalCount: number;
};

export function monthRevenue(
  opportunities: readonly CalendarOpportunity[],
  target: CalendarMonth,
): MonthRevenue {
  const range = monthRange(target.year, target.month);
  const summary: MonthRevenue = {
    target,
    expectedAmount: 0,
    expectedCount: 0,
    confirmedAmount: 0,
    confirmedCount: 0,
    lostAmount: 0,
    lostCount: 0,
    totalAmount: 0,
    totalCount: 0,
  };

  for (const opportunity of opportunities) {
    const closeDate = opportunity.expectedCloseDate;
    if (!closeDate) continue;
    if (!isWithinRange(closeDate, range)) continue;
    const outcome = outcomeOfStage(opportunity.stage);
    if (!outcome) continue;

    // 전체는 결말과 무관하게 먼저 더한다 — 결말별 분기에서 한 줄을 빠뜨리면
    // 전체 금액이 조용히 작아진다(실주를 빼먹은 것이 예전 판의 문제였다).
    summary.totalAmount += opportunity.expectedAmount;
    summary.totalCount += 1;

    if (outcome === "open") {
      summary.expectedAmount += opportunity.expectedAmount;
      summary.expectedCount += 1;
    } else if (outcome === "won") {
      summary.confirmedAmount += opportunity.expectedAmount;
      summary.confirmedCount += 1;
    } else {
      summary.lostAmount += opportunity.expectedAmount;
      summary.lostCount += 1;
    }
  }

  return summary;
}
