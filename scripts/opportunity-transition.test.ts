/**
 * `src/lib/opportunity-transition.ts` 검증 (네트워크·DB 없이 순수 함수만).
 * 실행: pnpm test:opportunity-transition
 *
 * 검증 범위 (F-112 · F-113)
 *  ① 5단계 × 5단계 = 25 조합의 자동 전이 판정 (전진만 · 마감 기회 불가 · 자동 마감 불가)
 *  ② 같은 25 조합의 수동 전이 판정 (사람이 고른 단계는 되돌리기까지 허용)
 *  ③ 문서 종류별 목표 단계 (견적서 → 제안 / 계약서 → 검토·협상 / 그 외 없음)
 *  ④ 발송 시나리오 5단계 × 4종류 = 20 조합의 결과 단계 (이미 지난 단계는 무시)
 *  ⑤ 되돌리기 판정과 경고 문구
 */

import assert from "node:assert/strict";
import {
  DOCUMENT_TYPES,
  OPEN_OPPORTUNITY_STAGES,
  OPPORTUNITY_STAGES,
  OPPORTUNITY_STAGE_LABELS,
  type DocumentType,
  type OpportunityStage,
} from "../src/lib/constants";
import {
  DOCUMENT_SEND_STAGE,
  canAutoAdvance,
  decideTransition,
  isClosedStage,
  isStageReversal,
  stageChangeWarning,
  stageForSentDocument,
  type StageSkipReason,
} from "../src/lib/opportunity-transition";

let checks = 0;
function check(actual: unknown, expected: unknown, message: string) {
  assert.deepEqual(actual, expected, message);
  checks += 1;
}

/** 진행 순서상 위치 (마감 단계는 -1) — 기대값을 독립적으로 계산한다 */
function rank(stage: OpportunityStage): number {
  return (OPEN_OPPORTUNITY_STAGES as readonly OpportunityStage[]).indexOf(stage);
}

/** 자동 전이의 기대 결과 (구현과 별개로 규칙을 다시 적어 서로 대조한다) */
function expectedAuto(
  from: OpportunityStage,
  to: OpportunityStage,
): { allowed: true } | { allowed: false; reason: StageSkipReason } {
  if (from === to) return { allowed: false, reason: "same-stage" };
  if (isClosedStage(from)) return { allowed: false, reason: "already-closed" };
  // 자동 전이로 기회를 마감시키지 않는다 → 목표가 마감 단계면 거부
  if (rank(to) < 0) return { allowed: false, reason: "no-downgrade" };
  if (rank(to) > rank(from)) return { allowed: true };
  return { allowed: false, reason: "no-downgrade" };
}

// ── ① 자동 전이 25 조합 ──
for (const from of OPPORTUNITY_STAGES) {
  for (const to of OPPORTUNITY_STAGES) {
    check(
      decideTransition(from, to, { allowDowngrade: false }),
      expectedAuto(from, to),
      `자동 전이 ${from} → ${to}`,
    );
    // canAutoAdvance 는 decideTransition 과 같은 판정이어야 한다 (같은 단계는 예외)
    if (from !== to) {
      check(
        canAutoAdvance(from, to),
        expectedAuto(from, to).allowed,
        `canAutoAdvance ${from} → ${to}`,
      );
    }
  }
}

// ── ② 수동 전이 25 조합 — 같은 단계만 건너뛰고 나머지는 전부 허용 ──
for (const from of OPPORTUNITY_STAGES) {
  for (const to of OPPORTUNITY_STAGES) {
    check(
      decideTransition(from, to, { allowDowngrade: true }),
      from === to ? { allowed: false, reason: "same-stage" } : { allowed: true },
      `수동 전이 ${from} → ${to}`,
    );
  }
}

// ── 전진만 규칙을 대표 사례로 다시 못박는다 ──
check(canAutoAdvance("INITIAL", "PROPOSAL"), true, "초기 → 제안은 전진");
check(canAutoAdvance("INITIAL", "NEGOTIATION"), true, "초기 → 검토/협상은 전진");
check(
  canAutoAdvance("NEGOTIATION", "PROPOSAL"),
  false,
  "검토/협상 → 제안은 이미 지난 단계라 무시",
);
check(canAutoAdvance("WON", "PROPOSAL"), false, "마감된 기회는 자동 전이 없음");
check(canAutoAdvance("LOST", "NEGOTIATION"), false, "실주 기회는 자동 전이 없음");
check(
  canAutoAdvance("NEGOTIATION", "WON"),
  false,
  "자동 전이가 기회를 마감시키지 않는다",
);

// ── ③ 문서 종류별 목표 단계 ──
const EXPECTED_SEND_STAGE: Record<DocumentType, OpportunityStage | null> = {
  QUOTE: "PROPOSAL",
  CONTRACT: "NEGOTIATION",
  NDA: null,
  PROPOSAL: null,
};
for (const type of DOCUMENT_TYPES) {
  check(
    stageForSentDocument(type),
    EXPECTED_SEND_STAGE[type],
    `${type} 발송 목표 단계`,
  );
}
check(
  Object.keys(DOCUMENT_SEND_STAGE).sort(),
  ["CONTRACT", "QUOTE"],
  "전이 규칙이 있는 문서 종류는 견적서·계약서뿐",
);

// ── ④ 발송 시나리오 20 조합 — 발송 후 남는 단계 ──
function stageAfterSend(
  from: OpportunityStage,
  type: DocumentType,
): OpportunityStage {
  const to = stageForSentDocument(type);
  if (!to) return from; // 전이 규칙 없음 (NDA·제안서)
  return decideTransition(from, to, { allowDowngrade: false }).allowed
    ? to
    : from;
}

const SEND_MATRIX: Record<
  DocumentType,
  Record<OpportunityStage, OpportunityStage>
> = {
  QUOTE: {
    INITIAL: "PROPOSAL",
    PROPOSAL: "PROPOSAL", // 같은 단계 → 그대로
    NEGOTIATION: "NEGOTIATION", // 이미 지난 단계 → 되돌리지 않는다
    WON: "WON", // 마감 기회는 건드리지 않는다
    LOST: "LOST",
  },
  CONTRACT: {
    INITIAL: "NEGOTIATION",
    PROPOSAL: "NEGOTIATION",
    NEGOTIATION: "NEGOTIATION",
    WON: "WON",
    LOST: "LOST",
  },
  NDA: {
    INITIAL: "INITIAL",
    PROPOSAL: "PROPOSAL",
    NEGOTIATION: "NEGOTIATION",
    WON: "WON",
    LOST: "LOST",
  },
  PROPOSAL: {
    INITIAL: "INITIAL",
    PROPOSAL: "PROPOSAL",
    NEGOTIATION: "NEGOTIATION",
    WON: "WON",
    LOST: "LOST",
  },
};

for (const type of DOCUMENT_TYPES) {
  for (const from of OPPORTUNITY_STAGES) {
    check(
      stageAfterSend(from, type),
      SEND_MATRIX[type][from],
      `${type} 발송: ${from} 에서 시작`,
    );
  }
}

// ── ⑤ 되돌리기 판정 · 경고 문구 ──
for (const from of OPPORTUNITY_STAGES) {
  for (const to of OPPORTUNITY_STAGES) {
    const expected = isClosedStage(from) && !isClosedStage(to);
    check(isStageReversal(from, to), expected, `되돌리기 판정 ${from} → ${to}`);
    check(
      stageChangeWarning(from, to) !== null,
      expected,
      `경고 문구 유무 ${from} → ${to}`,
    );
  }
}

const wonToProposal = stageChangeWarning("WON", "PROPOSAL");
check(wonToProposal !== null, true, "수주 → 제안은 경고가 있다");
check(
  wonToProposal?.includes(OPPORTUNITY_STAGE_LABELS.WON),
  true,
  "경고 문구에 원래 단계 라벨이 들어간다",
);
check(
  wonToProposal?.includes(OPPORTUNITY_STAGE_LABELS.PROPOSAL),
  true,
  "경고 문구에 옮길 단계 라벨이 들어간다",
);
check(
  wonToProposal?.endsWith("다."),
  true,
  "경고 문구는 존댓말로 끝난다 (COPY-TONE)",
);
check(
  stageChangeWarning("WON", "LOST"),
  null,
  "마감끼리 옮기는 것은 되돌리기가 아니다",
);

console.log(`opportunity-transition: ${checks}건 검증 통과`);
