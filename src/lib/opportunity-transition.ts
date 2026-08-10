/**
 * 영업 기회 단계 전이 **규칙** — 순수 함수 (F-112 · F-113).
 *
 * 규칙과 DB 쓰기를 분리한다. 여기에는 "이 전이가 허용되는가"만 두고, 실제 update·활동 이력
 * 기록은 `@/lib/opportunity-stage`(server-only) 가 트랜잭션 안에서 수행한다.
 * 분리 이유는 두 가지다.
 *  ① 칸반 카드(클라이언트)가 드롭 전에 확인 문구를 띄우려면 같은 규칙을 읽어야 한다.
 *     server-only 모듈은 클라이언트 번들에 들어갈 수 없다.
 *  ② DB 없이 `tsx` 로 전이 조합을 전수 검증할 수 있다 (`pnpm test:opportunity-transition`).
 *
 * 규칙의 단일 기준은 이 파일이다. 라우트·컴포넌트가 단계 조건을 따로 판단하지 않는다.
 */

import {
  OPEN_OPPORTUNITY_STAGES,
  OPPORTUNITY_STAGE_LABELS,
  isClosedOpportunityStage,
  type DocumentType,
  type OpportunityStage,
} from "./constants";

/** 진행 순서. 자동 전이는 이 순서를 앞으로만 이동한다. */
const STAGE_PROGRESSION: readonly OpportunityStage[] = OPEN_OPPORTUNITY_STAGES;

/** 마감 단계(WON·LOST)인지 — 판별 기준은 constants 하나뿐이다 (표시 모듈과 공유) */
export const isClosedStage = isClosedOpportunityStage;

/** 진행 순서상 위치. 마감 단계는 -1. */
function progressionRank(stage: OpportunityStage): number {
  return STAGE_PROGRESSION.indexOf(stage);
}

/**
 * 문서 발송으로 자동 전이할 단계 (F-113).
 * 견적서 → 제안, 계약서 → 검토/협상. NDA·제안서는 PRD 에 규정이 없어 전이하지 않는다.
 */
export const DOCUMENT_SEND_STAGE: Partial<Record<DocumentType, OpportunityStage>> = {
  QUOTE: "PROPOSAL",
  CONTRACT: "NEGOTIATION",
};

/** 발송한 문서 종류에 대응하는 전이 단계. 전이 대상이 아니면 null. */
export function stageForSentDocument(type: DocumentType): OpportunityStage | null {
  return DOCUMENT_SEND_STAGE[type] ?? null;
}

/**
 * 자동 전이 허용 여부 — 뒤로 가거나(강등) 마감된 기회를 되살리지 않는다 (구현 계획 §8.1).
 *
 * 재발송으로 단계가 내려가면 담당자가 모르는 사이에 파이프라인 통계가 흔들린다. 그래서
 * 시스템이 트리거하는 전이(F-113)는 ① 이미 지난 단계로 내리지 않고, ② 마감(WON·LOST)된
 * 기회는 건드리지 않는다. 사람이 고른 전이(칸반 드래그 F-112)는 이 제약을 받지 않는다.
 */
export function canAutoAdvance(from: OpportunityStage, to: OpportunityStage): boolean {
  if (isClosedStage(from)) return false;
  const toRank = progressionRank(to);
  if (toRank < 0) return false; // 자동 전이로 기회를 마감시키지 않는다
  return toRank > progressionRank(from);
}

/** 전이하지 않은 이유 */
export type StageSkipReason =
  /** 이미 같은 단계 */
  | "same-stage"
  /** 수주·실주로 마감된 기회 */
  | "already-closed"
  /** 자동 전이가 단계를 되돌리려 함 (보수적으로 무시) */
  | "no-downgrade"
  /** 전이 규칙이 없는 트리거 (예: NDA·제안서 발송) */
  | "not-applicable";

/** 전이 판정 결과 */
export type TransitionDecision =
  | { allowed: true }
  | { allowed: false; reason: StageSkipReason };

/**
 * 전이 허용 여부 판정 (`@/lib/opportunity-stage` 와 칸반이 공유하는 단일 기준).
 *
 * `allowDowngrade` 가 true 면 사람이 명시적으로 고른 전이라 어느 단계로든 이동한다
 * (되돌리기·마감 해제 포함). false 면 자동 전이라 `canAutoAdvance()` 를 만족해야 한다.
 */
export function decideTransition(
  from: OpportunityStage,
  to: OpportunityStage,
  options: { allowDowngrade: boolean },
): TransitionDecision {
  if (from === to) return { allowed: false, reason: "same-stage" };
  if (options.allowDowngrade) return { allowed: true };
  if (canAutoAdvance(from, to)) return { allowed: true };
  return {
    allowed: false,
    reason: isClosedStage(from) ? "already-closed" : "no-downgrade",
  };
}

/**
 * 마감(수주·실주)된 기회를 진행 단계로 되돌리는 전이인지.
 *
 * 허용은 하지만(사람이 고른 전이) 되돌리는 순간 확정일·실주 사유가 지워지므로
 * 화면에서 확인을 받아야 한다 (정책 STATE_BACK_NAV_CONFIRM).
 */
export function isStageReversal(
  from: OpportunityStage,
  to: OpportunityStage,
): boolean {
  return isClosedStage(from) && !isClosedStage(to);
}

/**
 * 단계 변경 전에 사용자에게 알려야 할 부작용 (없으면 null).
 * 칸반·목록이 같은 문구를 쓰도록 규칙 옆에 둔다 (정책 COPY-TONE).
 */
export function stageChangeWarning(
  from: OpportunityStage,
  to: OpportunityStage,
): string | null {
  if (!isStageReversal(from, to)) return null;
  return `‘${OPPORTUNITY_STAGE_LABELS[from]}’(으)로 마감된 기회를 ‘${OPPORTUNITY_STAGE_LABELS[to]}’ 단계로 되돌립니다. 마감 확정일과 실주 사유가 지워지며, 되돌린 기록은 이력에 남습니다.`;
}
