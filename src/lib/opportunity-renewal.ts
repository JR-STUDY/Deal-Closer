/**
 * 갱신 기회 **규칙** — 순수 함수 (F-115 · F-306).
 *
 * 수주로 끝난 거래는 대개 다음 해에 다시 온다. 그 다음 건을 **새 기회**로 세우고
 * 이전 건과 이어 두는 것이 갱신이다 — `Opportunity.previousOpportunityId` 체인이
 * 그 연결이고, 스키마에 이미 있다(새 컬럼을 만들지 않는다).
 *
 * ## 왜 별도 모듈인가
 *
 * `@/lib/opportunity-transition` 은 **한 기회의 단계가 어디로 갈 수 있는가**를 다룬다.
 * 갱신은 단계 전이가 아니라 **기회를 하나 더 만드는** 일이고, 원본의 단계는 그대로
 * `WON` 에 남는다. 두 규칙을 한 파일에 섞으면 "전이 규칙"이라는 이름이 거짓이 된다.
 *
 * ## 왜 순수 모듈인가
 *
 * 판정을 **화면과 서버가 같이** 해야 한다. 화면은 버튼을 보일지 정하고, 서버는 요청을
 * 받을지 정한다 — **화면에서만 막은 것은 막은 것이 아니다**. server-only 를 import 하지
 * 않으므로 상세 화면(클라이언트)·라우트·`tsx` 테스트가 같은 함수를 쓴다
 * (`pnpm test:opportunity-renewal`).
 *
 * ## 갱신 전용 필드는 만들지 않는다
 *
 * 주기·갱신 여부 같은 컬럼 대신 **`expectedCloseDate` 하나만** 쓴다. 새 기회의 마감일은
 * 사용자가 폼에서 정하고, 이 모듈은 **제안값**만 계산한다(원본 마감일 + 1년, 이미 지난
 * 날이면 다음 해로 밀어 낸다). 제안이므로 사용자가 고쳐도 되고, 규칙이 값을 **강제하지
 * 않는다** — 강제하면 갱신 주기가 1년이 아닌 계약에서 매번 고쳐야 한다.
 *
 * 예상 금액은 **복제하지 않는다** (기회-6). `expectedAmount` 는 확정 문서에서 파생되는
 * 값이라 새 기회는 확정 문서 없음 → 0 으로 시작하고, 쓰기는 `@/lib/opportunity-amount`
 * 한 곳뿐이다. 이전 건의 금액을 베껴 두면 문서 없는 기회가 금액을 주장하게 된다.
 */

import { OPPORTUNITY_STAGE_LABELS, type OpportunityStage } from "./constants";
import { OPPORTUNITY_NAME_MAX } from "./opportunity";

// ────────────────────────────── 만들 수 있는가 ──────────────────────────────

/** 갱신 판정에 필요한 원본 기회의 사실 (조회 결과에서 이 둘만 뽑아 넘긴다) */
export type RenewalSource = {
  stage: OpportunityStage;
  /**
   * 이미 다음 기회가 붙어 있는지.
   * `previousOpportunityId` 가 `@unique` 라 한 기회의 다음 기회는 **최대 1건**이다 —
   * 둘째를 만들려 들면 DB 제약에 걸리므로 판정으로 미리 막는다.
   */
  hasNextOpportunity: boolean;
};

/** 갱신 기회를 만들 수 없는 이유 */
export type RenewalBlockReason =
  /** 아직 진행 중인 기회 (초기·제안·검토/협상) */
  | "open"
  /** 실주로 마감된 기회 */
  | "lost"
  /** 이미 다음 기회가 있다 (체인은 1:1) */
  | "already-renewed";

export type RenewalDecision =
  | { allowed: true }
  | { allowed: false; reason: RenewalBlockReason };

/**
 * 갱신 기회를 만들 수 있는지 (화면·서버 공용 단일 기준).
 *
 * **수주(WON)로 마감된 기회만** 갱신한다. 진행 중인 건은 이번 거래가 아직 끝나지 않아
 * "다음"이 없고, 실주한 건은 이어 갈 계약 자체가 없다(그 거래처의 새 건은 갱신이 아니라
 * 새 기회다 — 체인으로 묶으면 이력이 "실주에서 이어졌다"고 잘못 말한다).
 *
 * 순서가 중요하다 — **단계를 먼저 본다.** 진행 중인 기회에 "이미 갱신했다"고 답하면
 * 왜 못 만드는지 엉뚱하게 안내된다.
 */
export function decideRenewal(source: RenewalSource): RenewalDecision {
  if (source.stage === "LOST") return { allowed: false, reason: "lost" };
  if (source.stage !== "WON") return { allowed: false, reason: "open" };
  if (source.hasNextOpportunity) {
    return { allowed: false, reason: "already-renewed" };
  }
  return { allowed: true };
}

/** `decideRenewal` 이 허용했는지만 알면 되는 자리(버튼 노출 판정)를 위한 축약 */
export function canRenewOpportunity(source: RenewalSource): boolean {
  return decideRenewal(source).allowed;
}

/**
 * 막힌 이유의 안내 문구 (정책 COPY-TONE).
 * 화면 안내와 서버 오류 응답이 **같은 문장**을 쓴다 — 다르면 사용자가 두 가지 설명을 받는다.
 */
export function renewalBlockMessage(reason: RenewalBlockReason): string {
  switch (reason) {
    case "open":
      // 라벨(`수주`)이 상수라 조사는 `로` 로 고정된다 — `(으)로` 로 도망가지 않는다
      return `아직 진행 중인 기회입니다. ‘${OPPORTUNITY_STAGE_LABELS.WON}’ 로 마감하신 뒤에 갱신 기회를 만들 수 있습니다.`;
    case "lost":
      return `‘${OPPORTUNITY_STAGE_LABELS.LOST}’ 로 마감된 기회는 갱신할 수 없습니다. 새 기회로 등록해주세요.`;
    case "already-renewed":
      return "이 기회에는 이미 갱신 기회가 있습니다. 한 기회에서 이어지는 다음 기회는 하나입니다.";
  }
}

// ────────────────────────────── 새 기회의 이름 ──────────────────────────────

/** 파생 이름의 꼬리표 — 화면 문구와 테스트가 같은 값을 본다 */
export const RENEWAL_NAME_SUFFIX = "갱신";

/** ` (갱신)` 또는 ` (갱신 3)` 꼬리표. 회차가 없으면 1회차로 본다. */
const RENEWAL_SUFFIX_RE = new RegExp(
  `\\s*\\(${RENEWAL_NAME_SUFFIX}(?:\\s+(\\d+))?\\)$`,
);

/**
 * 원본 기회명에서 갱신 기회의 **제안 이름**을 만든다.
 *
 * `인프라 증설 1차` → `인프라 증설 1차 (갱신)` → `인프라 증설 1차 (갱신 2)` → …
 * 꼬리표를 **덧붙이지 않고 회차를 올린다** — 갱신의 갱신을 만들 때마다 쌓이면
 * `A (갱신) (갱신) (갱신)` 이 되어 몇 번째인지 세어야 한다.
 *
 * 길이는 `OPPORTUNITY_NAME_MAX` 를 넘지 않게 **앞부분을 잘라** 맞춘다. 넘치면
 * `parseOpportunityInput()` 이 거부하는데, 사용자가 쓰지도 않은 이름 때문에 저장이
 * 막히는 것은 설명할 수 없다(잘린 이름은 폼에서 고칠 수 있다).
 */
export function renewalName(name: string): string {
  const trimmed = name.trim();
  const matched = RENEWAL_SUFFIX_RE.exec(trimmed);

  const base = matched ? trimmed.slice(0, matched.index).trim() : trimmed;
  const round = matched ? Number(matched[1] ?? "1") + 1 : 1;
  const suffix =
    round <= 1
      ? ` (${RENEWAL_NAME_SUFFIX})`
      : ` (${RENEWAL_NAME_SUFFIX} ${round})`;

  // 잘라야 한다면 **꼬리표는 남기고 이름만** 줄인다 — 몇 회차인지가 이름 끝자보다 중요하다
  const room = OPPORTUNITY_NAME_MAX - suffix.length;
  const head = base.length > room ? base.slice(0, Math.max(room, 0)).trim() : base;
  return `${head}${suffix}`;
}

// ────────────────────────────── 새 기회의 마감일 ──────────────────────────────

/** 그 달의 마지막 날 (윤년 포함) */
function daysInMonth(year: number, monthIndex: number): number {
  return new Date(year, monthIndex + 1, 0).getDate();
}

/** 로컬 자정으로 깎는다 — 날짜끼리 비교할 때 시각이 섞이면 하루가 밀린다 */
function atLocalMidnight(date: Date): Date {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate());
}

/**
 * 년 단위로 더한다. 2월 29일처럼 다음 해에 없는 날은 **그 달의 마지막 날**로 맞춘다 —
 * `new Date(y+1, 1, 29)` 는 3월 1일로 넘어가 마감월이 바뀐다.
 */
function addYears(date: Date, years: number): Date {
  const year = date.getFullYear() + years;
  const month = date.getMonth();
  const day = Math.min(date.getDate(), daysInMonth(year, month));
  return new Date(year, month, day);
}

/**
 * 갱신 기회의 예상 마감일 **제안값** (기본 1년 주기).
 *
 * 원본 마감일이 있으면 1년을 더하고, 그래도 오늘보다 뒤가 아니면 지난 계약이라
 * **오늘 이후가 될 때까지 해를 밀어 낸다** — 과거 날짜가 미리 채워지면 새 기회가
 * 만들어지는 순간 이미 마감이 지난 것으로 보인다. 마감일이 미정이었다면 오늘 + 1년이다.
 *
 * 이것은 **제안**이다. 저장되는 값은 폼에서 사용자가 확인한 값이다.
 */
export function suggestedRenewalCloseDate(
  previousCloseDate: Date | null,
  today: Date,
): Date {
  const base = atLocalMidnight(today);
  if (!previousCloseDate) return addYears(base, 1);

  let candidate = addYears(atLocalMidnight(previousCloseDate), 1);
  // 몇 해가 지난 계약도 한 번에 따라잡는다 (연 단위라 반복 횟수는 지난 해 수만큼이다)
  while (candidate.getTime() <= base.getTime()) {
    candidate = addYears(candidate, 1);
  }
  return candidate;
}
