/**
 * `src/lib/opportunity-progress.ts` 검증 (네트워크·DB 없이 순수 함수만).
 * 실행: pnpm test:opportunity-progress
 *
 * 이 파일의 핵심 기대값은 두 가지다.
 *  ① 지나온 구간은 **활동 이력에서 도출**한다 — `stage` 하나로 단정하지 않는다.
 *     제안에서 실주한 기회가 검토/협상을 지나온 것으로 보이면 상단(진행 단계)과
 *     하단(이력)이 어긋난다.
 *  ② 마감 노드는 **항상 하나** 있다 — 진행 중이면 회색 `수주/실주`, 마감이면 실제 결과다
 *     (기회-11: 갈래 2step 표기 없음).
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
  PENDING_OUTCOME_LABEL,
  opportunityProgress,
  reachedOpenStage,
  stageGuidance,
  type StageHistoryEntry,
  type StageNodeStatus,
} from "../src/lib/opportunity-progress";

let checks = 0;
function check(actual: unknown, expected: unknown, message: string) {
  assert.deepEqual(actual, expected, message);
  checks += 1;
}

/** 단계 경로(초기 → 제안 → …)를 실제 이력 모양(from/to 쌍)으로 옮긴다 */
function historyOf(...path: OpportunityStage[]): StageHistoryEntry[] {
  return path.slice(1).map((to, index) => ({ from: path[index], to }));
}

/** 진행 트랙·마감 노드 상태를 한 번에 읽는다 */
function shape(stage: OpportunityStage, history?: StageHistoryEntry[]) {
  const progress = opportunityProgress(stage, history);
  return {
    track: progress.track.map((node) => node.status),
    outcomeStage: progress.outcome.stage,
    outcomeStatus: progress.outcome.status,
    outcomeLabel: progress.outcome.label,
    isClosed: progress.isClosed,
  };
}

type Expected = {
  /** 초기 · 제안 · 검토/협상 순 */
  track: StageNodeStatus[];
  /** 마감 노드의 단계. 진행 중이면 null (아직 어느 쪽인지 모른다). */
  outcomeStage: OpportunityStage | null;
  outcomeStatus: StageNodeStatus;
  outcomeLabel: string;
  isClosed: boolean;
};

/** 진행 중 3단계가 공유하는 마감 노드 — 회색 `수주/실주` 하나 */
const PENDING_OUTCOME = {
  outcomeStage: null,
  outcomeStatus: "upcoming",
  outcomeLabel: PENDING_OUTCOME_LABEL,
  isClosed: false,
} as const;

/**
 * 5단계 전수 기대표 (지나온=done / 현재=current / 남은=upcoming).
 * 마감 두 단계는 **시드와 같은 이력**(수주는 검토/협상 경유, 실주는 제안에서 마감)을 전제한다.
 */
const MATRIX: Record<
  OpportunityStage,
  Expected & { history: StageHistoryEntry[] }
> = {
  INITIAL: {
    // 생성 직후 — 이력에 전이가 없다
    history: [],
    track: ["current", "upcoming", "upcoming"],
    ...PENDING_OUTCOME,
  },
  PROPOSAL: {
    history: historyOf("INITIAL", "PROPOSAL"),
    track: ["done", "current", "upcoming"],
    ...PENDING_OUTCOME,
  },
  NEGOTIATION: {
    history: historyOf("INITIAL", "PROPOSAL", "NEGOTIATION"),
    track: ["done", "done", "current"],
    ...PENDING_OUTCOME,
  },
  WON: {
    history: historyOf("INITIAL", "PROPOSAL", "NEGOTIATION", "WON"),
    track: ["done", "done", "done"],
    outcomeStage: "WON",
    outcomeStatus: "current",
    outcomeLabel: OPPORTUNITY_STAGE_LABELS.WON,
    isClosed: true,
  },
  LOST: {
    // 검토/협상을 거치지 않고 제안에서 마감한 기회 (시드의 `백업 스토리지 교체`)
    history: historyOf("INITIAL", "PROPOSAL", "LOST"),
    track: ["done", "done", "upcoming"],
    outcomeStage: "LOST",
    outcomeStatus: "current",
    outcomeLabel: OPPORTUNITY_STAGE_LABELS.LOST,
    isClosed: true,
  },
};

/** 트랙 상태는 이 순서를 거스르지 않는다 — 기준점은 하나뿐이다 */
const STATUS_ORDER: StageNodeStatus[] = ["done", "current", "upcoming"];

// ── 5단계 전수: 트랙·마감 노드 상태 ──
for (const stage of OPPORTUNITY_STAGES) {
  const { history, ...expected } = MATRIX[stage];
  const progress = opportunityProgress(stage, history);
  /** 화면에 실제로 그려지는 노드 전체 (트랙 + 마감 노드) */
  const nodes = [...progress.track, progress.outcome];

  check(progress.current, stage, `${stage}: current`);
  check(shape(stage, history), expected, `${stage}: 트랙·마감 노드 상태`);

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

  // 노출되는 마감 노드는 실제 결과 하나뿐이다 (수주일 때 실주가 함께 보이면 안 된다)
  check(
    nodes
      .flatMap((node) => (node.stage ? [node.stage] : []))
      .filter((value) =>
        (CLOSED_OPPORTUNITY_STAGES as readonly OpportunityStage[]).includes(
          value,
        ),
      ),
    expected.isClosed ? [stage] : [],
    `${stage}: 노출되는 마감 단계 노드`,
  );

  // 어떤 단계에서든 "현재"는 정확히 하나뿐이다 (진행 중이면 트랙, 마감이면 결과 노드)
  const currents = nodes.filter((node) => node.status === "current");
  check(currents.length, 1, `${stage}: 현재 노드는 하나뿐`);
  check(currents[0].stage, stage, `${stage}: 현재 노드는 곧 현재 단계`);

  // 노드 개수 — 트랙 3개 + 마감 노드 1개. 진행 중에도 마감 노드를 감추지 않는다.
  check(
    nodes.length,
    OPEN_OPPORTUNITY_STAGES.length + 1,
    `${stage}: 노드 총 개수는 항상 트랙+1`,
  );

  check(
    progress.track.every(
      (node, index) =>
        index === 0 ||
        STATUS_ORDER.indexOf(node.status) >=
          STATUS_ORDER.indexOf(progress.track[index - 1].status),
    ),
    true,
    `${stage}: 트랙 상태가 뒤섞이지 않는다`,
  );

  // 안내 문구는 비어 있지 않고 존댓말로 끝난다 (COPY-TONE)
  const guidance = stageGuidance(stage);
  check(guidance.length > 0, true, `${stage}: 안내 문구 존재`);
  check(guidance.endsWith("다."), true, `${stage}: 안내 문구 존댓말 종결`);
}

// ── 마감 노드 규칙 (기회-11 재수정) ──
check(
  PENDING_OUTCOME_LABEL,
  CLOSED_OPPORTUNITY_STAGES.map(
    (stage) => OPPORTUNITY_STAGE_LABELS[stage],
  ).join("/"),
  "진행 중 마감 노드 라벨은 상수에서 파생한다",
);
check(PENDING_OUTCOME_LABEL, "수주/실주", "진행 중 마감 노드 라벨");

for (const stage of OPEN_OPPORTUNITY_STAGES) {
  const outcome = opportunityProgress(stage).outcome;
  check(outcome.status, "upcoming", `${stage}: 마감 노드는 회색(앞으로 갈 곳)`);
  check(
    outcome.stage,
    null,
    `${stage}: 진행 중에는 결과 단계가 정해지지 않는다`,
  );
  check(outcome.label, PENDING_OUTCOME_LABEL, `${stage}: 마감 노드 라벨`);
}
for (const stage of CLOSED_OPPORTUNITY_STAGES) {
  const outcome = opportunityProgress(stage).outcome;
  check(outcome.status, "current", `${stage}: 마감되면 결과 노드가 채워진다`);
  check(outcome.stage, stage, `${stage}: 결과 노드는 실제 결과 하나뿐`);
  check(
    outcome.label,
    OPPORTUNITY_STAGE_LABELS[stage],
    `${stage}: 결과 노드 라벨`,
  );
}

// ── 검증 필수 케이스 1: 초기 → 제안 → 실주 (검토/협상 미경유) ──
// 시드의 `백업 스토리지 교체`. 검토/협상은 **지나온 표시가 아니어야** 한다.
const lostAtProposal = historyOf("INITIAL", "PROPOSAL", "LOST");
check(
  shape("LOST", lostAtProposal),
  {
    track: ["done", "done", "upcoming"],
    outcomeStage: "LOST",
    outcomeStatus: "current",
    outcomeLabel: "실주",
    isClosed: true,
  },
  "제안에서 실주: 검토/협상은 지나온 단계가 아니다",
);
check(
  reachedOpenStage("LOST", lostAtProposal),
  "PROPOSAL",
  "제안에서 실주: 도달 지점은 제안",
);
// 실주 이력만 남아 있어도(중간 전이 기록이 유실돼도) from 으로 도달 지점을 알 수 있다
check(
  reachedOpenStage("LOST", [{ from: "PROPOSAL", to: "LOST" }]),
  "PROPOSAL",
  "마감 이력 한 줄만 있어도 from 으로 도달 지점을 잡는다",
);

// ── 검증 필수 케이스 2: 초기 → 제안 → 검토/협상 → 수주 (전부 거침) ──
// 시드의 `커머스 플랫폼 고도화`.
const wonFullPath = historyOf("INITIAL", "PROPOSAL", "NEGOTIATION", "WON");
check(
  shape("WON", wonFullPath),
  {
    track: ["done", "done", "done"],
    outcomeStage: "WON",
    outcomeStatus: "current",
    outcomeLabel: "수주",
    isClosed: true,
  },
  "전 단계를 거친 수주: 트랙 3단계가 모두 지나온 단계",
);
check(
  reachedOpenStage("WON", wonFullPath),
  "NEGOTIATION",
  "전 단계를 거친 수주: 도달 지점은 검토/협상",
);
// 이력 순서는 상관없다 — 상세 화면은 최신순(시간 역순)으로 읽는다
check(
  shape("WON", [...wonFullPath].reverse()),
  shape("WON", wonFullPath),
  "이력 정렬 순서가 뒤바뀌어도 결과가 같다",
);

// ── 검증 필수 케이스 3: 초기 → 실주 (바로 마감) ──
check(
  shape("LOST", historyOf("INITIAL", "LOST")),
  {
    track: ["done", "upcoming", "upcoming"],
    outcomeStage: "LOST",
    outcomeStatus: "current",
    outcomeLabel: "실주",
    isClosed: true,
  },
  "초기에서 바로 실주: 초기만 지나온 단계",
);
check(
  reachedOpenStage("LOST", historyOf("INITIAL", "LOST")),
  "INITIAL",
  "초기에서 바로 실주: 도달 지점은 초기",
);

// ── 검증 필수 케이스 4: 이력 없음 (생성 직후 · 이력 유실) ──
// 진행 중이면 현재 단계가 곧 도달 지점이라 이력이 없어도 정확하다.
for (const stage of OPEN_OPPORTUNITY_STAGES) {
  check(
    shape(stage, []),
    shape(stage, MATRIX[stage].history),
    `${stage}: 진행 중이면 이력 없이도 같은 결과`,
  );
  check(
    reachedOpenStage(stage),
    stage,
    `${stage}: 진행 중 도달 지점은 현재 단계`,
  );
}
// 마감된 기회에 이력이 없으면 **초기까지만** 지나온 것으로 본다 (모르면 덜 주장한다).
for (const stage of CLOSED_OPPORTUNITY_STAGES) {
  check(
    shape(stage, []),
    {
      track: ["done", "upcoming", "upcoming"],
      outcomeStage: stage,
      outcomeStatus: "current",
      outcomeLabel: OPPORTUNITY_STAGE_LABELS[stage],
      isClosed: true,
    },
    `${stage}: 이력이 없으면 초기까지만 지나온 단계 (폴백)`,
  );
  check(
    reachedOpenStage(stage),
    "INITIAL",
    `${stage}: 이력이 없으면 도달 지점은 초기`,
  );
  check(
    reachedOpenStage(stage, []),
    reachedOpenStage(stage, undefined),
    `${stage}: 빈 배열과 생략이 같다`,
  );
}

// ── 검증 필수 케이스 5: 역전 — 검토/협상 → 제안 으로 되돌린 뒤 진행 중 ──
// 기준점은 현재 단계다. 되돌린 뒤에는 검토/협상이 다시 **남은 단계**로 보이고,
// 되돌린 사실은 아래 이력에 남는다 (트랙에 기준점이 둘일 수는 없다).
const reverted = historyOf("INITIAL", "PROPOSAL", "NEGOTIATION", "PROPOSAL");
check(
  shape("PROPOSAL", reverted),
  { track: ["done", "current", "upcoming"], ...PENDING_OUTCOME },
  "되돌린 뒤 제안 단계: 검토/협상은 다시 남은 단계",
);
check(
  reachedOpenStage("PROPOSAL", reverted),
  "PROPOSAL",
  "되돌린 뒤 도달 지점은 현재 단계(제안)",
);
// 마감을 풀어 되돌린 경우도 같다 — 진행 중이면 이력보다 현재 단계가 기준이다
check(
  shape("PROPOSAL", historyOf("INITIAL", "PROPOSAL", "LOST", "PROPOSAL")),
  { track: ["done", "current", "upcoming"], ...PENDING_OUTCOME },
  "실주를 풀어 제안으로 되돌리면 진행 중 표시로 돌아온다",
);

// ── 단계와 무관한 이력은 무시한다 ──
// 활동 이력에는 문서 생성·발송처럼 from/to 가 없는 줄이 섞여 있다.
const noisy: StageHistoryEntry[] = [
  { from: null, to: null },
  {},
  { from: "", to: "   " },
  { from: "UNKNOWN_STAGE", to: "ARCHIVED" },
  { from: "INITIAL", to: "PROPOSAL" },
];
check(
  reachedOpenStage("LOST", noisy),
  "PROPOSAL",
  "정의 밖 값·빈 값은 도달 지점 계산에서 무시한다",
);
check(
  reachedOpenStage("WON", [{ from: null, to: null }, {}]),
  "INITIAL",
  "쓸 만한 전이가 하나도 없으면 초기로 떨어진다",
);
// 마감 단계는 트랙에 없으므로 도달 지점을 밀지 않는다
check(
  reachedOpenStage("WON", [{ from: "WON", to: "LOST" }]),
  "INITIAL",
  "마감 단계끼리의 전이는 진행 트랙 도달 지점을 바꾸지 않는다",
);

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
