/**
 * `src/lib/opportunity-progress.ts` 검증 (네트워크·DB 없이 순수 함수만).
 * 실행: pnpm test:opportunity-progress
 *
 * 5단계 × (지나온 · 현재 · 남은) 조합과 마감 갈래(WON·LOST)를 전수 확인한다.
 */

import assert from "node:assert/strict";
import {
  OPPORTUNITY_STAGES,
  OPEN_OPPORTUNITY_STAGES,
  CLOSED_OPPORTUNITY_STAGES,
  OPPORTUNITY_STAGE_LABELS,
  type OpportunityStage,
} from "../src/lib/constants";
import {
  opportunityProgress,
  stageGuidance,
  type StageNodeStatus,
} from "../src/lib/opportunity-progress";

type Expected = {
  /** 초기 · 제안 · 검토/협상 순 */
  track: StageNodeStatus[];
  /** 수주 · 실주 순 */
  branches: StageNodeStatus[];
  isClosed: boolean;
};

/** 5단계 전수 기대표 (지나온=done / 현재=current / 남은=upcoming) */
const MATRIX: Record<OpportunityStage, Expected> = {
  INITIAL: {
    track: ["current", "upcoming", "upcoming"],
    branches: ["upcoming", "upcoming"],
    isClosed: false,
  },
  PROPOSAL: {
    track: ["done", "current", "upcoming"],
    branches: ["upcoming", "upcoming"],
    isClosed: false,
  },
  NEGOTIATION: {
    track: ["done", "done", "current"],
    branches: ["upcoming", "upcoming"],
    isClosed: false,
  },
  // 마감 기회는 진행 트랙을 모두 지나온 것으로 보고, 강조를 갈래로 옮긴다.
  WON: {
    track: ["done", "done", "done"],
    branches: ["current", "upcoming"],
    isClosed: true,
  },
  LOST: {
    track: ["done", "done", "done"],
    branches: ["upcoming", "current"],
    isClosed: true,
  },
};

let checks = 0;
function check(actual: unknown, expected: unknown, message: string) {
  assert.deepEqual(actual, expected, message);
  checks += 1;
}

// ── 5단계 전수: 트랙·갈래 상태 ──
for (const stage of OPPORTUNITY_STAGES) {
  const expected = MATRIX[stage];
  const progress = opportunityProgress(stage);

  check(progress.current, stage, `${stage}: current`);
  check(progress.isClosed, expected.isClosed, `${stage}: isClosed`);
  check(
    progress.track.map((node) => node.status),
    expected.track,
    `${stage}: 진행 트랙 상태`,
  );
  check(
    progress.branches.map((node) => node.status),
    expected.branches,
    `${stage}: 마감 갈래 상태`,
  );

  // 단계 목록은 상수에서 파생돼야 한다 (하드코딩 금지)
  check(
    progress.track.map((node) => node.stage),
    [...OPEN_OPPORTUNITY_STAGES],
    `${stage}: 트랙 순서는 OPEN_OPPORTUNITY_STAGES 를 따른다`,
  );
  check(
    progress.branches.map((node) => node.stage),
    [...CLOSED_OPPORTUNITY_STAGES],
    `${stage}: 갈래 순서는 CLOSED_OPPORTUNITY_STAGES 를 따른다`,
  );

  // 라벨은 상수의 한국어 라벨을 그대로 쓴다
  check(
    [...progress.track, ...progress.branches].map((node) => node.label),
    OPPORTUNITY_STAGES.map((s) => OPPORTUNITY_STAGE_LABELS[s]),
    `${stage}: 노드 라벨`,
  );

  // 어떤 단계에서든 "현재"는 정확히 하나뿐이다
  const currents = [...progress.track, ...progress.branches].filter(
    (node) => node.status === "current",
  );
  check(currents.length, 1, `${stage}: 현재 노드는 하나뿐`);
  check(currents[0].stage, stage, `${stage}: 현재 노드는 곧 현재 단계`);

  // 안내 문구는 비어 있지 않고 존댓말로 끝난다 (COPY-TONE)
  const guidance = stageGuidance(stage);
  check(guidance.length > 0, true, `${stage}: 안내 문구 존재`);
  check(guidance.endsWith("다."), true, `${stage}: 안내 문구 존댓말 종결`);

  // 노드 개수는 상수 길이와 일치한다
  check(
    progress.track.length + progress.branches.length,
    OPPORTUNITY_STAGES.length,
    `${stage}: 노드 총 개수`,
  );
}

// ── 진행 단계는 다음 행동을, 마감 단계는 마감 사실을 안내한다 ──
check(
  stageGuidance("INITIAL").includes("견적서"),
  true,
  "초기 안내는 견적서 발송을 알린다",
);
check(
  stageGuidance("PROPOSAL").includes("계약서"),
  true,
  "제안 안내는 계약서 발송을 알린다",
);
check(
  stageGuidance("NEGOTIATION").includes("수주 또는 실주"),
  true,
  "검토/협상 안내는 마감 갈래를 알린다",
);
check(stageGuidance("WON").includes("수주로 마감"), true, "수주 마감 안내");
check(stageGuidance("LOST").includes("실주로 마감"), true, "실주 마감 안내");

console.log(`opportunity-progress: ${checks}건 검증 통과`);
