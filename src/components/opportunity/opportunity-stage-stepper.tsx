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
 * 가로 트랙(초기 ─ 제안 ─ 검토/협상) 뒤에 마감 갈래(수주 / 실주)를 **병렬**로 붙인다.
 * 지나온 단계는 채워진 노드·연결선, 현재 단계는 링으로 강조, 남은 단계는 빈 노드·흐린 선이다.
 *
 * **표시 전용**이다 — 여기서 단계를 바꾸지 않는다 (수동 변경은 Phase 3 F-112 범위).
 * 상호작용이 없으므로 서버 컴포넌트이며, 상태 계산은 `@/lib/opportunity-progress` 의
 * 순수 함수 하나에 모아 목록 안내와 기준을 공유한다.
 */

/**
 * 현재 노드 색. 마감 단계는 `StageBadge` 의 수주=emerald / 실주=rose 와 같은 계열을 써서
 * 목록 배지와 상세 스테퍼의 색이 어긋나지 않게 한다. 진행 단계는 테마의 primary 를 쓴다.
 */
const CURRENT_DOT_STYLES: Partial<Record<OpportunityStage, string>> = {
  WON: "bg-emerald-600 ring-emerald-600/25 dark:bg-emerald-400 dark:ring-emerald-400/25",
  LOST: "bg-rose-600 ring-rose-600/25 dark:bg-rose-400 dark:ring-rose-400/25",
};

const CURRENT_LABEL_STYLES: Partial<Record<OpportunityStage, string>> = {
  WON: "text-emerald-700 dark:text-emerald-300",
  LOST: "text-rose-700 dark:text-rose-300",
};

/** 노드 점 — 남은 단계도 테두리를 뚜렷하게 유지한다 (명도대비, ACC_*) */
function StageDot({ node }: { node: StageNode }) {
  if (node.status === "current") {
    return (
      <span
        aria-hidden="true"
        className={cn(
          "size-3.5 shrink-0 rounded-full ring-4",
          CURRENT_DOT_STYLES[node.stage] ?? "bg-primary ring-primary/25",
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
      CURRENT_LABEL_STYLES[node.stage] ?? "text-foreground",
    );
  }
  return node.status === "done" ? "text-foreground" : "text-muted-foreground";
}

/** 점·선은 aria-hidden 이라 상태가 읽히지 않는다 → 라벨에 보충한다 (ACC_*) */
function statusHint(node: StageNode): string {
  if (node.status === "current") return " (현재 단계)";
  return node.status === "done" ? " (지나온 단계)" : " (남은 단계)";
}

/** 연결선 — 지나온 구간만 채운다 */
function Connector({
  isFilled,
  className,
}: {
  isFilled: boolean;
  className?: string;
}) {
  return (
    <span
      aria-hidden="true"
      className={cn(
        "h-0.5 rounded-full",
        isFilled ? "bg-primary" : "bg-border",
        className,
      )}
    />
  );
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

  return (
    <div>
      {/* 트랙 라벨은 absolute 라 줄 높이를 밀지 않는다 → pb 로 라벨 자리를 확보한다 */}
      <div className="flex items-center px-1 pb-8">
        {progress.track.map((node, index) => (
          <Fragment key={node.stage}>
            {index > 0 ? (
              <Connector
                isFilled={node.status !== "upcoming"}
                className="min-w-6 flex-1"
              />
            ) : null}
            <div className="relative flex flex-col items-center">
              <StageDot node={node} />
              <span
                className={cn(
                  "absolute top-full mt-2 text-xs whitespace-nowrap",
                  stageLabelClass(node),
                )}
              >
                {node.label}
                <span className="sr-only">{statusHint(node)}</span>
              </span>
            </div>
          </Fragment>
        ))}

        {/* 트랙 → 마감 갈래 진입선 */}
        <Connector isFilled={progress.isClosed} className="min-w-6 flex-1" />

        {/* 마감 갈래 — 수주·실주는 순차가 아니라 병렬이다 */}
        <div className="relative flex shrink-0 flex-col gap-3">
          <span
            aria-hidden="true"
            className="absolute top-2 bottom-2 left-0 w-0.5 rounded-full bg-border"
          />
          {progress.branches.map((node) => (
            <div key={node.stage} className="flex h-4 items-center">
              <Connector isFilled={node.status === "current"} className="w-4" />
              <StageDot node={node} />
              <span
                className={cn(
                  "ml-2 text-xs whitespace-nowrap",
                  stageLabelClass(node),
                )}
              >
                {node.label}
                <span className="sr-only">{statusHint(node)}</span>
              </span>
            </div>
          ))}
        </div>
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
