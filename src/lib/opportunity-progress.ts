/**
 * 영업 기회 단계 진행 **표시**용 순수 함수 (F-111 · F-112 안내).
 *
 * 목록 상단의 흐름 안내와 상세의 스테퍼가 같은 계산을 공유해야 화면끼리 표현이 어긋나지 않는다
 * (`@/lib/pipeline` 을 대시보드·캘린더가 공유하는 것과 같은 이유).
 *
 * 이 모듈은 **읽기 전용**이다. 단계 전이는 `@/lib/opportunity-stage` 만 수행한다.
 * server-only 를 import 하지 않으므로 서버 컴포넌트·클라이언트 컴포넌트 어디서든 쓸 수 있다.
 */

import {
  CLOSED_OPPORTUNITY_STAGES,
  OPEN_OPPORTUNITY_STAGES,
  OPPORTUNITY_STAGE_LABELS,
  isClosedOpportunityStage,
  isOpportunityStage,
  type OpportunityStage,
} from "./constants";

/**
 * 스테퍼 노드의 상태 — 지나온 / 현재 / 건너뛴 / 남은.
 *
 * `skipped` 와 `upcoming` 을 나누는 이유는 둘이 **다른 사실**이기 때문이다.
 * `upcoming` 은 "아직 안 온 곳"(앞으로 갈 수 있다), `skipped` 는 "영영 안 갈 곳"이다 —
 * 제안에서 바로 수주한 기회의 검토/협상은 앞으로 갈 곳이 아니라 지나쳐 버린 곳이다.
 * 둘을 같은 표현으로 그리면 마감된 기회의 트랙이 아직 진행 중인 것처럼 읽힌다 (기회-16).
 */
export type StageNodeStatus = "done" | "current" | "skipped" | "upcoming";

/**
 * 스테퍼가 그리는 노드 공통 모양.
 * 마감 노드는 **진행 중일 때 어느 결과인지 정해지지 않아** `stage` 가 null 이다.
 */
export type ProgressNode = {
  stage: OpportunityStage | null;
  label: string;
  status: StageNodeStatus;
};

/** 진행 트랙(초기 · 제안 · 검토/협상) 노드 — 단계가 항상 정해져 있다 */
export type StageNode = ProgressNode & { stage: OpportunityStage };

/** 트랙 끝의 마감 노드 — 진행 중이면 `stage` 가 null 이고 상태는 `upcoming` 이다 */
export type OutcomeNode = ProgressNode;

/**
 * 진행 중일 때 마감 노드에 붙는 라벨.
 * 상수에서 파생한다 — 라벨을 문자열로 적어 두면 `수주`·`실주` 표기가 바뀔 때 여기만 어긋난다.
 */
export const PENDING_OUTCOME_LABEL = CLOSED_OPPORTUNITY_STAGES.map(
  (stage) => OPPORTUNITY_STAGE_LABELS[stage],
).join("/");

/**
 * 단계 전이 이력 한 줄 — 활동 이력(ActivityLog)의 `detail` 에서 꺼낸 `from`/`to` 다.
 *
 * 단계 이름이 아닌 값(문서 종류·수신자 같은 다른 detail, 정의 밖 문자열, null)은 무시된다.
 * 정렬 순서는 상관없다 — 도달 지점을 최댓값으로 뽑기 때문이다(상세 화면은 시간 역순으로 읽는다).
 */
export type StageHistoryEntry = {
  from?: string | null;
  to?: string | null;
};

export type OpportunityProgress = {
  /** 지금 단계 */
  current: OpportunityStage;
  /** 진행 트랙 (초기 → 제안 → 검토/협상). 순차다. */
  track: StageNode[];
  /**
   * 마감 결과 노드 **하나**. 항상 있다.
   *
   * 수주·실주를 두 갈래로 나란히 두지 않는다 — 갈래로 띄우면 화면이 "둘 중 하나를 고르는
   * 단계"처럼 읽힌다. 대신 한 줄 트랙 끝에 노드 하나를 두고, 진행 중이면 회색 `수주/실주`
   * (앞으로 갈 곳)로, 마감되면 **실제 결과 하나**를 채워 보여준다 (기회-11).
   */
  outcome: OutcomeNode;
  /** 수주·실주로 마감됐는지 */
  isClosed: boolean;
};

function toNode(stage: OpportunityStage, status: StageNodeStatus): StageNode {
  return { stage, label: OPPORTUNITY_STAGE_LABELS[stage], status };
}

/** 진행 트랙에서의 위치. 트랙에 없는 값(마감 단계·정의 밖 문자열·null)은 -1. */
function openRank(value: string | null | undefined): number {
  if (!value || !isOpportunityStage(value)) return -1;
  return (OPEN_OPPORTUNITY_STAGES as readonly OpportunityStage[]).indexOf(
    value,
  );
}

/**
 * 진행 트랙에서 **실제로 도달한 가장 앞선 단계**.
 *
 * 진행 중인 기회는 현재 단계가 곧 도달 지점이라 이력을 볼 필요가 없다. 마감된 기회는
 * `stage` 가 WON·LOST 하나뿐이어서 어디까지 갔었는지 알 수 없으므로 **이력에서 도출한다** —
 * 상단(진행 단계)과 하단(이력)이 같은 출처를 보게 만들어야 둘이 어긋나지 않는다.
 * 예: 초기 → 제안 → 실주 인 기회는 검토/협상을 지나온 것으로 표시해선 안 된다.
 *
 * **이력이 없으면 초기 단계까지만 지나온 것으로 본다** — 모든 기회는 초기에서 시작하므로
 * (스키마 기본값) 이력 없이 확실히 말할 수 있는 최소 사실이다. 알 수 없는 구간을 "지나온"으로
 * 채우는 과대 주장이 바로 이 함수가 고치려는 결함이라, 모르면 덜 주장하는 쪽으로 넘어진다.
 */
export function reachedOpenStage(
  stage: OpportunityStage,
  history?: readonly StageHistoryEntry[],
): OpportunityStage {
  if (!isClosedOpportunityStage(stage)) return stage;

  // 초기(0)에서 시작한다. from·to 를 함께 보므로 전이 한 줄만 남아 있어도 도달 지점이 잡힌다.
  let rank = 0;
  for (const entry of history ?? []) {
    rank = Math.max(rank, openRank(entry.from), openRank(entry.to));
  }
  return OPEN_OPPORTUNITY_STAGES[rank];
}

/**
 * 스테퍼 노드 상태를 계산한다.
 *
 * 트랙의 기준점은 **도달 지점 하나**다 — 진행 중이면 현재 단계, 마감이면 이력에서 도출한
 * 마지막 진행 단계(`reachedOpenStage`)다. 그 앞은 지나온, 뒤는 남은 단계다.
 * 마감된 기회의 트랙에는 `current` 가 없다 — 강조는 트랙 끝의 결과 노드로 옮긴다.
 *
 * 마감을 풀어 되돌린 기회(검토/협상 → 제안)는 현재 단계가 기준점이라 검토/협상이 다시
 * **남은 단계**로 보인다. 트랙에 기준점이 둘일 수는 없고, 되돌린 사실은 아래 이력에 남는다.
 *
 * 도달 지점 **뒤**는 기회가 끝났는지에 따라 뜻이 갈린다 (기회-16).
 * 진행 중이면 `upcoming`(앞으로 갈 곳)이지만, 마감된 기회에는 앞으로가 없으므로 `skipped`
 * (지나치고 마감한 곳)다 — 제안에서 바로 수주한 기회의 검토/협상이 여기 해당한다.
 */
export function opportunityProgress(
  stage: OpportunityStage,
  history?: readonly StageHistoryEntry[],
): OpportunityProgress {
  const isClosed = isClosedOpportunityStage(stage);
  const reachedIndex = openRank(reachedOpenStage(stage, history));

  const track = OPEN_OPPORTUNITY_STAGES.map((openStage, index) => {
    if (index < reachedIndex) return toNode(openStage, "done");
    // 마감된 기회는 도달 지점도 "지나온" 이다 (현재는 결과 노드다)
    if (index === reachedIndex) {
      return toNode(openStage, isClosed ? "done" : "current");
    }
    return toNode(openStage, isClosed ? "skipped" : "upcoming");
  });

  return {
    current: stage,
    track,
    outcome: isClosed
      ? // 마감된 단계 자체가 결과다 — 채워진(현재) 상태로 하나만 내보낸다.
        toNode(stage, "current")
      : // 진행 중 — 아직 어느 쪽인지 모르니 단계 없이 "앞으로 갈 곳"으로만 둔다.
        { stage: null, label: PENDING_OUTCOME_LABEL, status: "upcoming" },
    isClosed,
  };
}

/**
 * 현재 단계에서 **다음에 할 일** 안내 (정책 COPY-TONE).
 * 자동 전이 규칙(F-113: 견적서 → 제안, 계약서 → 검토/협상)을 사용자 언어로 옮긴 것이다.
 * 마감된 기회는 다음 행동 대신 마감 사실을 알린다.
 */
export function stageGuidance(stage: OpportunityStage): string {
  switch (stage) {
    case "INITIAL":
      return "지금은 초기 단계입니다. 견적서를 보내면 제안 단계로 자동 이동합니다.";
    case "PROPOSAL":
      return "지금은 제안 단계입니다. 계약서를 보내면 검토/협상 단계로 자동 이동합니다.";
    case "NEGOTIATION":
      return "지금은 검토/협상 단계입니다. 계약서를 보내면 이 단계로 자동 이동하며, 마감은 수주 또는 실주로 처리합니다.";
    case "WON":
      return "수주로 마감된 기회입니다. 더 진행할 단계가 없습니다.";
    case "LOST":
      return "실주로 마감된 기회입니다. 더 진행할 단계가 없습니다.";
  }
}
