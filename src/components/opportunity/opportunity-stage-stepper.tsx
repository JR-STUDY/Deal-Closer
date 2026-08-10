import { Fragment } from "react";
import { cn } from "@/lib/utils";
import type { OpportunityStage } from "@/lib/constants";
import {
  opportunityProgress,
  stageGuidance,
  type ProgressNode,
  type StageHistoryEntry,
} from "@/lib/opportunity-progress";

/**
 * 영업 기회 진행 표시 — 스테퍼 (상세 상단, F-111 · F-112 안내).
 *
 * 가로 한 줄(초기 ─ 제안 ─ 검토/협상 ─ 마감)이다. 마지막 마감 노드는 **항상 하나**이며,
 * 진행 중이면 회색 `수주/실주`(앞으로 갈 곳), 마감되면 실제 결과 하나가 채워진다.
 * 수주·실주를 두 줄 갈래(2step)로 벌리지 않는다 (기회-11).
 * 지나온 단계는 채워진 노드·연결선, 현재 단계는 링으로 강조, 남은 단계는 빈 노드·흐린 선이다.
 *
 * 지나온 구간은 `stage` 하나로 알 수 없다 — 마감된 기회는 어느 단계에서 마감했는지가
 * **활동 이력에만** 남는다. 그래서 상세 페이지가 이미 조회한 이력을 그대로 받아 넘긴다.
 * 상단(진행 단계)과 하단(이력)이 같은 출처를 보므로 둘이 어긋날 수 없다.
 *
 * **표시 전용**이다 — 여기서 단계를 바꾸지 않는다 (수동 변경은 Phase 3 F-112 범위).
 * 상호작용이 없으므로 서버 컴포넌트이며, 상태 계산은 `@/lib/opportunity-progress` 의
 * 순수 함수 하나에 모아 목록 안내와 기준을 공유한다.
 */

/**
 * 마감 단계의 강조 색. `StageBadge` 의 수주=emerald / 실주=rose 와 같은 계열을 써서
 * 목록 배지와 상세 스테퍼의 색이 어긋나지 않게 한다. 진행 단계는 테마의 primary 를 쓴다.
 * 노드·라벨·연결선이 **한 표에서 파생**되므로 셋의 색이 따로 놀 수 없다 (기회-9).
 */
const STAGE_ACCENTS: Partial<
  Record<OpportunityStage, { dot: string; label: string; line: string }>
> = {
  WON: {
    dot: "bg-emerald-600 ring-emerald-600/25 dark:bg-emerald-400 dark:ring-emerald-400/25",
    label: "text-emerald-700 dark:text-emerald-300",
    line: "bg-emerald-600 dark:bg-emerald-400",
  },
  LOST: {
    dot: "bg-rose-600 ring-rose-600/25 dark:bg-rose-400 dark:ring-rose-400/25",
    label: "text-rose-700 dark:text-rose-300",
    line: "bg-rose-600 dark:bg-rose-400",
  },
};

/**
 * 노드의 강조 색. 마감 노드는 **진행 중일 때 단계가 정해지지 않아**(stage null) 강조가 없다 —
 * 그때는 회색(upcoming) 표현만 쓰이므로 기본값으로 떨어져도 색이 새지 않는다.
 */
function accent(node: ProgressNode) {
  return node.stage ? STAGE_ACCENTS[node.stage] : undefined;
}

/** 노드 점 — 남은 단계도 테두리를 뚜렷하게 유지한다 (명도대비, ACC_*) */
function StageDot({ node }: { node: ProgressNode }) {
  if (node.status === "current") {
    return (
      <span
        aria-hidden="true"
        className={cn(
          "size-3.5 shrink-0 rounded-full ring-4",
          accent(node)?.dot ?? "bg-primary ring-primary/25",
        )}
      />
    );
  }
  if (node.status === "done") {
    return (
      <span
        aria-hidden="true"
        className="size-3 shrink-0 rounded-full bg-primary"
      />
    );
  }
  return (
    <span
      aria-hidden="true"
      className="size-3 shrink-0 rounded-full border-2 border-muted-foreground/60 bg-background"
    />
  );
}

/** 노드 라벨 — 현재 단계는 굵게 강조한다 */
function stageLabelClass(node: ProgressNode): string {
  if (node.status === "current") {
    return cn("font-semibold", accent(node)?.label ?? "text-foreground");
  }
  return node.status === "done" ? "text-foreground" : "text-muted-foreground";
}

/** 점·선은 aria-hidden 이라 상태가 읽히지 않는다 → 라벨에 보충한다 (ACC_*) */
function statusHint(node: ProgressNode): string {
  if (node.status === "current") return " (현재 단계)";
  return node.status === "done" ? " (지나온 단계)" : " (남은 단계)";
}

/**
 * 연결선 — 색은 이 선이 **들어가는** 노드에서 정한다 (기회-9).
 * 도달한 노드로 들어가는 선은 채우고, 마감 결과로 들어가는 선은 그 결과 색을 그대로 쓴다.
 * 아직 도달하지 않은 노드로 들어가는 선만 흐리게 남는다.
 */
function Connector({ into }: { into: ProgressNode }) {
  return (
    <span
      aria-hidden="true"
      className={cn(
        "h-0.5 min-w-6 flex-1 rounded-full",
        into.status === "upcoming"
          ? "bg-border"
          : (accent(into)?.line ?? "bg-primary"),
      )}
    />
  );
}

/**
 * 노드 한 칸 (점 + 아래 라벨).
 * 라벨은 absolute 라 줄 높이를 밀지 않는다. 양 끝 노드의 라벨을 가운데 정렬하면 좌우로
 * 넘치므로 안쪽으로 붙인다.
 */
function StageMark({
  node,
  align,
}: {
  node: ProgressNode;
  align: "start" | "center" | "end";
}) {
  return (
    <div className="relative flex flex-col items-center">
      <StageDot node={node} />
      <span
        className={cn(
          "absolute top-full mt-2 text-xs whitespace-nowrap",
          align === "start" && "left-0",
          align === "center" && "left-1/2 -translate-x-1/2",
          align === "end" && "right-0",
          stageLabelClass(node),
        )}
      >
        {node.label}
        <span className="sr-only">{statusHint(node)}</span>
      </span>
    </div>
  );
}

export function OpportunityStageStepper({
  stage,
  lostReason,
  history,
}: {
  stage: OpportunityStage;
  /** 실주 사유 (F-117). LOST 가 아니거나 비어 있으면 null. */
  lostReason: string | null;
  /**
   * 이 기회의 단계 전이 이력 (활동 이력에서 꺼낸 `from`/`to`).
   * 마감된 기회가 **어디까지 갔었는지**는 이력만 알고 있다 — 없으면 초기까지만 지나온으로 본다.
   */
  history: readonly StageHistoryEntry[];
}) {
  const progress = opportunityProgress(stage, history);

  return (
    <div>
      {/* 라벨이 absolute 라 pb 로 라벨 자리를 확보한다 */}
      <div className="flex items-center px-1 pb-8">
        {progress.track.map((node, index) => (
          <Fragment key={node.stage}>
            {index > 0 ? <Connector into={node} /> : null}
            {/* 트랙 끝에 마감 노드가 항상 붙으므로 마지막 트랙 노드도 가운데 정렬이다 */}
            <StageMark node={node} align={index === 0 ? "start" : "center"} />
          </Fragment>
        ))}

        {/*
          마감 노드 하나 — 진행 중이면 회색 `수주/실주`(앞으로 갈 곳), 마감이면 실제 결과다.
          갈래로 벌리지 않는다 (기회-11). 회색 여부는 노드 status 가 정하므로 여기서 분기하지 않는다.
        */}
        <Connector into={progress.outcome} />
        <StageMark node={progress.outcome} align="end" />
      </div>

      <p className="text-sm text-muted-foreground">{stageGuidance(stage)}</p>
      {lostReason ? (
        <p className="mt-1.5 text-sm">
          <span className="text-muted-foreground">실주 사유</span>{" "}
          <span className="font-medium">{lostReason}</span>
        </p>
      ) : null}
    </div>
  );
}
