"use client";

import { Fragment, useState } from "react";
import { useRouter } from "next/navigation";
import { cn } from "@/lib/utils";
import {
  CLOSED_OPPORTUNITY_STAGES,
  OPPORTUNITY_STAGE_LABELS,
  type OpportunityStage,
} from "@/lib/constants";
import {
  opportunityProgress,
  stageGuidance,
  type ProgressNode,
  type StageHistoryEntry,
} from "@/lib/opportunity-progress";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  StageChangeConfirmDialog,
  useStageChange,
} from "@/components/opportunity/stage-change";

/**
 * 영업 기회 진행 표시 — 스테퍼 (상세 상단, F-111 · F-112).
 *
 * 가로 한 줄(초기 ─ 제안 ─ 검토/협상 ─ 마감)이다. 마지막 마감 노드는 **항상 하나**이며,
 * 진행 중이면 회색 `수주/실주`(앞으로 갈 곳), 마감되면 실제 결과 하나가 채워진다.
 * 수주·실주를 두 줄 갈래(2step)로 벌리지 않는다 (기회-11).
 * 지나온 단계는 채워진 노드·연결선, 현재 단계는 링으로 강조, 남은 단계는 빈 노드·흐린 선이다.
 * **건너뛴 단계**(마감된 기회가 지나치고 만 단계)는 점선 노드·점선 연결선·취소선 라벨이다 —
 * "아직 안 온 곳"과 "영영 안 갈 곳"이 같아 보이면 안 된다 (기회-16).
 *
 * 지나온 구간은 `stage` 하나로 알 수 없다 — 마감된 기회는 어느 단계에서 마감했는지가
 * **활동 이력에만** 남는다. 그래서 상세 페이지가 이미 조회한 이력을 그대로 받아 넘긴다.
 * 상단(진행 단계)과 하단(이력)이 같은 출처를 보므로 둘이 어긋날 수 없다.
 *
 * `action` 을 주면 **노드를 눌러 그 단계로 전이**한다 (기회-1 · 기회-7). 이때도 이 파일은
 * 규칙을 스스로 판단하지 않는다 — 허용 판정·경고 문구는 `@/lib/opportunity-transition`,
 * 저장은 `POST /api/opportunities/:id/stage` → `@/lib/opportunity-stage` 트랜잭션이 맡는다.
 * 칸반 ⋯ 메뉴와 같은 `useStageChange` 훅을 쓰므로 두 화면의 확인창·안내가 어긋나지 않는다.
 * 상태 계산(`@/lib/opportunity-progress`)은 **읽기 전용**이며 전이에 관여하지 않는다.
 */

/** 노드를 눌러 단계를 바꿀 수 있게 하는 대상 (없으면 표시 전용) */
export type StageStepperAction = {
  opportunityId: string;
  /** 되돌리기 확인창에 쓸 기회명 */
  name: string;
};

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

/**
 * 노드 점 — 남은 단계도 테두리를 뚜렷하게 유지한다 (명도대비, ACC_*).
 *
 * 건너뛴 단계는 **점선 테두리**로 그린다 (기회-16). 색만 흐리게 하면 남은 단계와 구별되지
 * 않으므로 형태로도 갈라 놓는다 — 색을 유일한 구분 수단으로 쓰지 않는다 (정책 ACC_*).
 */
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
  if (node.status === "skipped") {
    return (
      <span
        aria-hidden="true"
        className="size-3 shrink-0 rounded-full border-2 border-dashed border-muted-foreground/50 bg-transparent"
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

/**
 * 노드 라벨 — 현재 단계는 굵게 강조하고, 건너뛴 단계에는 취소선을 둔다.
 * 취소선은 색과 별개인 **형태** 신호라 명도대비에 기대지 않고도 구분된다 (ACC_*).
 */
function stageLabelClass(node: ProgressNode): string {
  if (node.status === "current") {
    return cn("font-semibold", accent(node)?.label ?? "text-foreground");
  }
  if (node.status === "done") return "text-foreground";
  if (node.status === "skipped") {
    return "text-muted-foreground line-through decoration-muted-foreground/60";
  }
  return "text-muted-foreground";
}

/** 점·선은 aria-hidden 이라 상태가 읽히지 않는다 → 라벨에 보충한다 (ACC_*) */
function statusHint(node: ProgressNode): string {
  switch (node.status) {
    case "current":
      return " (현재 단계)";
    case "done":
      return " (지나온 단계)";
    case "skipped":
      return " (건너뛴 단계)";
    case "upcoming":
      return " (남은 단계)";
  }
}

/**
 * 연결선의 표현 — **양 끝 노드의 상태에서 파생한다** (기회-9 · 기회-16).
 *
 * 들어가는 노드만 보면 `제안 → 수주` 처럼 건너뛴 구간을 가로질러 결과 색이 칠해져,
 * 지나가지 않은 검토/협상이 지나온 것처럼 읽힌다. 그래서 **한쪽이라도 건너뛴 노드면 그 구간
 * 전체를 건너뜀(점선)으로** 그린다 — 건너뛴 구간이 트랙에서 통째로 끊겨 보이게 된다.
 */
function connectorClass(from: ProgressNode, into: ProgressNode): string {
  if (from.status === "skipped" || into.status === "skipped") {
    // 점선은 배경이 아니라 테두리로 그린다 (bg 로는 파선을 만들 수 없다)
    return "h-0 border-t-2 border-dashed border-muted-foreground/40";
  }
  if (into.status === "upcoming") return "h-0.5 rounded-full bg-border";
  return cn("h-0.5 rounded-full", accent(into)?.line ?? "bg-primary");
}

function Connector({ from, into }: { from: ProgressNode; into: ProgressNode }) {
  return (
    <span
      aria-hidden="true"
      className={cn("min-w-6 flex-1", connectorClass(from, into))}
    />
  );
}

type MarkAlign = "start" | "center" | "end";

/** 노드 라벨 (점 아래). absolute 라 줄 높이를 밀지 않는다. */
function StageMarkLabel({
  node,
  align,
}: {
  node: ProgressNode;
  align: MarkAlign;
}) {
  return (
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
  );
}

/**
 * 노드 한 칸 (점 + 아래 라벨) — 표시 전용.
 * 양 끝 노드의 라벨을 가운데 정렬하면 좌우로 넘치므로 안쪽으로 붙인다.
 */
function StageMark({ node, align }: { node: ProgressNode; align: MarkAlign }) {
  return (
    <div className="relative flex flex-col items-center">
      <StageDot node={node} />
      <StageMarkLabel node={node} align={align} />
    </div>
  );
}

/**
 * 누를 수 있는 노드 — 클릭·Enter·Space 로 그 단계로 전이한다 (기회-1, 정책 ACC_*).
 * 점(0.875rem)만으로는 누르기 어려우므로 padding 으로 히트 영역을 넓히고 라벨도 버튼 안에 둔다.
 * 음수 margin 으로 넓힌 만큼 되돌려 트랙 간격은 표시 전용일 때와 같게 유지한다.
 *
 * 드롭다운 트리거로도 쓰이므로 나머지 props(onClick 등)를 그대로 넘겨받는다.
 */
function StageMarkButton({
  node,
  align,
  label,
  disabled,
  isCurrent,
  ...rest
}: {
  node: ProgressNode;
  align: MarkAlign;
  label: string;
  disabled: boolean;
  isCurrent: boolean;
} & React.ComponentPropsWithoutRef<"button">) {
  return (
    <button
      type="button"
      aria-label={label}
      aria-current={isCurrent ? "step" : undefined}
      disabled={disabled}
      {...rest}
      className={cn(
        "relative -m-2 flex flex-col items-center rounded-full p-2 transition-colors",
        "focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none",
        disabled ? "cursor-default" : "cursor-pointer hover:bg-muted",
      )}
    >
      <StageDot node={node} />
      <StageMarkLabel node={node} align={align} />
    </button>
  );
}

export function OpportunityStageStepper({
  stage,
  lostReason,
  history,
  action,
}: {
  stage: OpportunityStage;
  /** 실주 사유 (F-117). LOST 가 아니거나 비어 있으면 null. */
  lostReason: string | null;
  /**
   * 이 기회의 단계 전이 이력 (활동 이력에서 꺼낸 `from`/`to`).
   * 마감된 기회가 **어디까지 갔었는지**는 이력만 알고 있다 — 없으면 초기까지만 지나온으로 본다.
   */
  history: readonly StageHistoryEntry[];
  /** 주면 노드를 눌러 단계를 바꿀 수 있다. 없으면 표시 전용이다. */
  action?: StageStepperAction;
}) {
  const router = useRouter();
  /**
   * 낙관적으로 반영한 단계 (저장이 끝나기 전에 화면에 먼저 보여줄 값).
   * 실패·취소하면 rollback 이 비워 서버 값(props)으로 되돌아간다 — 칸반 드래그와 같은 방식이다.
   */
  const [optimisticStage, setOptimisticStage] =
    useState<OpportunityStage | null>(null);
  const stageChange = useStageChange({ onChanged: () => router.refresh() });

  const currentStage = optimisticStage ?? stage;
  /**
   * 낙관 반영 중에는 방금 고른 전이도 이력에 얹어 계산한다 — 그래야 지나온 구간이 실제 이동과
   * 어긋나지 않는다. 저장이 끝나면 서버가 같은 내용을 이력으로 채운다.
   */
  const effectiveHistory: readonly StageHistoryEntry[] = optimisticStage
    ? [...history, { from: stage, to: optimisticStage }]
    : history;
  const progress = opportunityProgress(currentStage, effectiveHistory);

  const selectStage = (toStage: OpportunityStage) => {
    if (!action || toStage === currentStage) return;
    setOptimisticStage(toStage);
    stageChange.request({
      target: {
        id: action.opportunityId,
        name: action.name,
        stage: currentStage,
      },
      toStage,
      rollback: () => setOptimisticStage(null),
    });
  };

  return (
    <div>
      {/* 라벨이 absolute 라 pb 로 라벨 자리를 확보한다 */}
      <div className="flex items-center px-1 pb-8">
        {progress.track.map((node, index) => {
          const align: MarkAlign = index === 0 ? "start" : "center";
          const isCurrent = node.stage === currentStage;
          return (
            <Fragment key={node.stage}>
              {index > 0 ? (
                <Connector from={progress.track[index - 1]} into={node} />
              ) : null}
              {/* 트랙 끝에 마감 노드가 항상 붙으므로 마지막 트랙 노드도 가운데 정렬이다 */}
              {action ? (
                <StageMarkButton
                  node={node}
                  align={align}
                  isCurrent={isCurrent}
                  disabled={isCurrent || stageChange.isSaving}
                  /*
                   * aria-label 은 버튼 안의 글자를 대신 읽히므로 라벨 옆 sr-only 상태 안내가
                   * 묻힌다 → 상태를 여기에 함께 싣는다 (특히 "건너뛴 단계", 정책 ACC_*).
                   */
                  label={
                    isCurrent
                      ? `${node.label} — 현재 단계`
                      : `${node.label}${statusHint(node)} — 이 단계로 변경`
                  }
                  onClick={() => selectStage(node.stage)}
                />
              ) : (
                <StageMark node={node} align={align} />
              )}
            </Fragment>
          );
        })}

        {/*
          마감 노드 하나 — 진행 중이면 회색 `수주/실주`(앞으로 갈 곳), 마감이면 실제 결과다.
          갈래로 벌리지 않는다 (기회-11). 회색 여부는 노드 status 가 정하므로 여기서 분기하지 않는다.
          누를 때는 어느 결과인지 정해야 하므로 수주·실주를 메뉴로 고른다.
        */}
        <Connector
          from={progress.track[progress.track.length - 1]}
          into={progress.outcome}
        />
        {action ? (
          <DropdownMenu>
            <DropdownMenuTrigger asChild disabled={stageChange.isSaving}>
              <StageMarkButton
                node={progress.outcome}
                align="end"
                isCurrent={progress.isClosed}
                disabled={stageChange.isSaving}
                label="마감 처리 — 수주 또는 실주 선택"
              />
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuLabel>마감 처리</DropdownMenuLabel>
              {CLOSED_OPPORTUNITY_STAGES.map((closedStage) => (
                <DropdownMenuItem
                  key={closedStage}
                  disabled={closedStage === currentStage}
                  onSelect={() => selectStage(closedStage)}
                >
                  {OPPORTUNITY_STAGE_LABELS[closedStage]}(으)로 마감
                </DropdownMenuItem>
              ))}
            </DropdownMenuContent>
          </DropdownMenu>
        ) : (
          <StageMark node={progress.outcome} align="end" />
        )}
      </div>

      <p className="text-sm text-muted-foreground">
        {stageGuidance(currentStage)}
      </p>
      {/* 낙관 반영으로 마감을 풀었다면 사유도 함께 감춘다 (서버 저장이 끝나면 실제로 지워진다) */}
      {lostReason && currentStage === "LOST" ? (
        <p className="mt-1.5 text-sm">
          <span className="text-muted-foreground">실주 사유</span>{" "}
          <span className="font-medium">{lostReason}</span>
        </p>
      ) : null}
      {action ? (
        <p className="mt-1.5 text-xs text-muted-foreground">
          단계를 누르시면 그 단계로 옮깁니다. 마감을 되돌리실 때는 먼저 확인을
          여쭙습니다.
        </p>
      ) : null}

      <StageChangeConfirmDialog
        pending={stageChange.pending}
        isSaving={stageChange.isSaving}
        onCancel={stageChange.cancel}
        onConfirm={stageChange.confirm}
      />
    </div>
  );
}
