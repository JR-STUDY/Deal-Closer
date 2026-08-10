import { Fragment } from "react";
import { cn } from "@/lib/utils";
import type { OpportunityStage } from "@/lib/constants";
import {
  opportunityProgress,
  stageGuidance,
  type StageNode,
} from "@/lib/opportunity-progress";

/**
 * 영업 기회 진행 표시 — 스테퍼 (상세 상단, F-111 · F-112 안내).
 *
 * 가로 한 줄(초기 ─ 제안 ─ 검토/협상)이며, 마감된 기회는 **실제 결과 하나**를 트랙 끝에 이어 붙인다.
 * 진행 중에는 수주·실주를 미리 보여주지 않는다 (기회-11: 갈래 2step 표기 제거).
 * 지나온 단계는 채워진 노드·연결선, 현재 단계는 링으로 강조, 남은 단계는 빈 노드·흐린 선이다.
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

/** 노드 점 — 남은 단계도 테두리를 뚜렷하게 유지한다 (명도대비, ACC_*) */
function StageDot({ node }: { node: StageNode }) {
  if (node.status === "current") {
    return (
      <span
        aria-hidden="true"
        className={cn(
          "size-3.5 shrink-0 rounded-full ring-4",
          STAGE_ACCENTS[node.stage]?.dot ?? "bg-primary ring-primary/25",
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
function stageLabelClass(node: StageNode): string {
  if (node.status === "current") {
    return cn(
      "font-semibold",
      STAGE_ACCENTS[node.stage]?.label ?? "text-foreground",
    );
  }
  return node.status === "done" ? "text-foreground" : "text-muted-foreground";
}

/** 점·선은 aria-hidden 이라 상태가 읽히지 않는다 → 라벨에 보충한다 (ACC_*) */
function statusHint(node: StageNode): string {
  if (node.status === "current") return " (현재 단계)";
  return node.status === "done" ? " (지나온 단계)" : " (남은 단계)";
}

/**
 * 연결선 — 색은 이 선이 **들어가는** 노드에서 정한다 (기회-9).
 * 도달한 노드로 들어가는 선은 채우고, 마감 결과로 들어가는 선은 그 결과 색을 그대로 쓴다.
 * 아직 도달하지 않은 노드로 들어가는 선만 흐리게 남는다.
 */
function Connector({ into }: { into: StageNode }) {
  return (
    <span
      aria-hidden="true"
      className={cn(
        "h-0.5 min-w-6 flex-1 rounded-full",
        into.status === "upcoming"
          ? "bg-border"
          : (STAGE_ACCENTS[into.stage]?.line ?? "bg-primary"),
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
  node: StageNode;
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

/** 트랙 노드의 라벨 정렬 — 첫 노드는 왼쪽, 마지막 노드는(결과가 없을 때만) 오른쪽 */
function trackAlign(
  index: number,
  lastIndex: number,
  hasOutcome: boolean,
): "start" | "center" | "end" {
  if (index === 0) return "start";
  if (index === lastIndex && !hasOutcome) return "end";
  return "center";
}

export function OpportunityStageStepper({
  stage,
  lostReason,
}: {
  stage: OpportunityStage;
  /** 실주 사유 (F-117). LOST 가 아니거나 비어 있으면 null. */
  lostReason: string | null;
}) {
  const progress = opportunityProgress(stage);
  const lastTrackIndex = progress.track.length - 1;

  return (
    <div>
      {/* 라벨이 absolute 라 pb 로 라벨 자리를 확보한다 */}
      <div className="flex items-center px-1 pb-8">
        {progress.track.map((node, index) => (
          <Fragment key={node.stage}>
            {index > 0 ? <Connector into={node} /> : null}
            <StageMark
              node={node}
              align={trackAlign(
                index,
                lastTrackIndex,
                progress.outcome !== null,
              )}
            />
          </Fragment>
        ))}

        {/* 마감 결과 — 수주·실주 중 실제 결과 하나만 이어 붙인다 (기회-11) */}
        {progress.outcome ? (
          <>
            <Connector into={progress.outcome} />
            <StageMark node={progress.outcome} align="end" />
          </>
        ) : null}
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
