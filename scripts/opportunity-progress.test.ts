/**
 * `src/lib/opportunity-progress.ts` 검증 (네트워크·DB 없이 순수 함수만).
 * 실행: pnpm test:opportunity-progress
 *
 * 5단계 × (지나온 · 현재 · 남은) 조합과 마감 결과 노드(수주 · 실주)를 전수 확인한다.
 * 진행 중에는 마감 결과를 **아예 노출하지 않는다**는 규칙(기회-11)이 이 파일의 핵심 기대값이다.
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
  /** 마감 결과 노드의 단계. 진행 중이면 null (노드 자체가 없다). */
  outcomeStage: OpportunityStage | null;
  /** 마감 결과 노드의 상태. 진행 중이면 null. */
  outcomeStatus: StageNodeStatus | null;
  isClosed: boolean;
};

/** 5단계 전수 기대표 (지나온=done / 현재=current / 남은=upcoming) */
const MATRIX: Record<OpportunityStage, Expected> = {
  // 진행 중 3단계는 마감 결과를 미리 보여주지 않는다 → outcome 이 없다.
  INITIAL: {
    track: ["current", "upcoming", "upcoming"],
    outcomeStage: null,
    outcomeStatus: null,
    isClosed: false,
  },
  PROPOSAL: {
    track: ["done", "current", "upcoming"],
    outcomeStage: null,
    outcomeStatus: null,
    isClosed: false,
  },
  NEGOTIATION: {
    track: ["done", "done", "current"],
    outcomeStage: null,
    outcomeStatus: null,
    isClosed: false,
  },
  // 마감 기회는 진행 트랙을 모두 지나온 것으로 보고, 강조를 실제 결과 하나로 옮긴다.
  WON: {
    track: ["done", "done", "done"],
    outcomeStage: "WON",
    outcomeStatus: "current",
    isClosed: true,
  },
  LOST: {
    track: ["done", "done", "done"],
    outcomeStage: "LOST",
    outcomeStatus: "current",
    isClosed: true,
  },
};

let checks = 0;
function check(actual: unknown, expected: unknown, message: string) {
  assert.deepEqual(actual, expected, message);
  checks += 1;
}

// ── 5단계 전수: 트랙·마감 결과 상태 ──
for (const stage of OPPORTUNITY_STAGES) {
  const expected = MATRIX[stage];
  const progress = opportunityProgress(stage);
  /** 화면에 실제로 그려지는 노드 전체 */
  const nodes = progress.outcome
    ? [...progress.track, progress.outcome]
    : progress.track;

  check(progress.current, stage, `${stage}: current`);
  check(progress.isClosed, expected.isClosed, `${stage}: isClosed`);
  check(
    progress.track.map((node) => node.status),
    expected.track,
    `${stage}: 진행 트랙 상태`,
  );

  // 단계 목록은 상수에서 파생돼야 한다 (하드코딩 금지)
  check(
    progress.track.map((node) => node.stage),
    [...OPEN_OPPORTUNITY_STAGES],
    `${stage}: 트랙 순서는 OPEN_OPPORTUNITY_STAGES 를 따른다`,
  );

  // 라벨은 상수의 한국어 라벨을 그대로 쓴다
  check(
    progress.track.map((node) => node.label),
    OPEN_OPPORTUNITY_STAGES.map((s) => OPPORTUNITY_STAGE_LABELS[s]),
    `${stage}: 트랙 노드 라벨`,
  );

  // 마감 결과 노드 — 진행 중이면 없고, 마감이면 그 단계 하나뿐이다
  check(
    progress.outcome?.stage ?? null,
    expected.outcomeStage,
    `${stage}: 마감 결과 노드의 단계`,
  );
  check(
    progress.outcome?.status ?? null,
    expected.outcomeStatus,
    `${stage}: 마감 결과 노드의 상태`,
  );
  check(
    progress.outcome?.label ?? null,
    expected.outcomeStage
      ? OPPORTUNITY_STAGE_LABELS[expected.outcomeStage]
      : null,
    `${stage}: 마감 결과 노드 라벨`,
  );

  // 노출되는 마감 노드는 진행 중엔 0개, 마감이면 실제 결과 1개뿐이다
  // (수주일 때 실주가, 실주일 때 수주가 함께 보이면 안 된다 — 갈래 표기 제거)
  check(
    nodes
      .filter((node) =>
        (CLOSED_OPPORTUNITY_STAGES as readonly OpportunityStage[]).includes(
          node.stage,
        ),
      )
      .map((node) => node.stage),
    expected.isClosed ? [stage] : [],
    `${stage}: 노출되는 마감 노드`,
  );

  // 어떤 단계에서든 "현재"는 정확히 하나뿐이다
  const currents = nodes.filter((node) => node.status === "current");
  check(currents.length, 1, `${stage}: 현재 노드는 하나뿐`);
  check(currents[0].stage, stage, `${stage}: 현재 노드는 곧 현재 단계`);

  // 안내 문구는 비어 있지 않고 존댓말로 끝난다 (COPY-TONE)
  const guidance = stageGuidance(stage);
  check(guidance.length > 0, true, `${stage}: 안내 문구 존재`);
  check(guidance.endsWith("다."), true, `${stage}: 안내 문구 존댓말 종결`);

  // 노드 개수 — 진행 중은 트랙 3개, 마감은 트랙 3개 + 결과 1개
  check(
    nodes.length,
    OPEN_OPPORTUNITY_STAGES.length + (expected.isClosed ? 1 : 0),
    `${stage}: 노드 총 개수`,
  );
}

// ── 갈래 표기 제거 규칙 (기회-11) ──
for (const stage of OPEN_OPPORTUNITY_STAGES) {
  check(
    opportunityProgress(stage).outcome,
    null,
    `${stage}: 진행 중에는 마감 결과를 노출하지 않는다`,
  );
}
for (const stage of CLOSED_OPPORTUNITY_STAGES) {
  check(
    opportunityProgress(stage).outcome?.label,
    OPPORTUNITY_STAGE_LABELS[stage],
    `${stage}: 마감이면 그 결과 하나만 노출한다`,
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
