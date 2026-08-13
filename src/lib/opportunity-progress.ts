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
  type OpportunityStage,
} from "./constants";

/** 스테퍼 노드의 상태 — 지나온 / 현재 / 남은 */
export type StageNodeStatus = "done" | "current" | "upcoming";

export type StageNode = {
  stage: OpportunityStage;
  label: string;
  status: StageNodeStatus;
};

export type OpportunityProgress = {
  /** 지금 단계 */
  current: OpportunityStage;
  /** 진행 트랙 (초기 → 제안 → 검토/협상). 순차다. */
  track: StageNode[];
  /** 마감 갈래 (수주 · 실주). 순차가 아니라 **병렬**이다. */
  branches: StageNode[];
  /** 수주·실주로 마감됐는지 */
  isClosed: boolean;
};

function toNode(stage: OpportunityStage, status: StageNodeStatus): StageNode {
  return { stage, label: OPPORTUNITY_STAGE_LABELS[stage], status };
}

/**
 * 현재 단계로부터 스테퍼 노드 상태를 계산한다.
 *
 * 마감(WON·LOST)된 기회는 진행 트랙 3단계를 모두 "지나온"으로 본다 — 어느 단계에서 마감했는지는
 * 활동 이력(ActivityLog)에만 남고 `stage` 하나로는 알 수 없기 때문이다. 강조는 마감 갈래로 옮긴다.
 */
export function opportunityProgress(
  stage: OpportunityStage,
): OpportunityProgress {
  const isClosed = isClosedOpportunityStage(stage);
  const currentIndex = (
    OPEN_OPPORTUNITY_STAGES as readonly OpportunityStage[]
  ).indexOf(stage);

  const track = OPEN_OPPORTUNITY_STAGES.map((openStage, index) => {
    if (isClosed || index < currentIndex) return toNode(openStage, "done");
    if (index === currentIndex) return toNode(openStage, "current");
    return toNode(openStage, "upcoming");
  });

  const branches = CLOSED_OPPORTUNITY_STAGES.map((closedStage) =>
    toNode(closedStage, closedStage === stage ? "current" : "upcoming"),
  );

  return { current: stage, track, branches, isClosed };
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
