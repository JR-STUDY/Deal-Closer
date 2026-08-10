"use client";

import { memo, useCallback, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { CalendarClock, MoreHorizontal, User } from "lucide-react";
import { cn } from "@/lib/utils";
import { OPPORTUNITY_STAGE_LABELS, type OpportunityStage } from "@/lib/constants";
import { parseDateInput, type OpportunityDTO } from "@/lib/opportunity";
import { summarizeByStage } from "@/lib/pipeline";
import { formatDate, formatKRW, formatNumber } from "@/lib/format";
import { StageBadge } from "@/components/status-badge";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  StageChangeConfirmDialog,
  StageChangeMenuItems,
  useStageChange,
} from "@/components/opportunity/stage-change";

/**
 * 영업 기회 칸반 보드 (F-112).
 *
 * 컬럼은 `OPPORTUNITY_STAGES` 순서 그대로 5개이고, 헤더의 건수·금액 합계는 대시보드·캘린더와
 * 같은 순수 함수(`summarizeByStage`)로 계산한다 — 화면마다 따로 더하면 숫자가 어긋난다.
 *
 * 드래그는 저장소 선례(`src/components/sidebar-folders.tsx`)와 같은 **네이티브 HTML5 DnD** 다.
 * 라이브러리를 더하지 않는다. 드롭하면 카드를 먼저 옮기고(낙관적 업데이트) 저장에 실패하면
 * 원위치로 되돌린다. 마우스를 쓸 수 없는 경우를 위해 카드마다 ⋯ 메뉴의 "단계 변경" 을 둔다
 * (정책 ACC_*).
 */

/**
 * 화면에 그릴 카드.
 * DTO 의 마감일은 직렬화용 `YYYY-MM-DD` 문자열이라 여기서 **로컬 Date** 로 되돌린다 —
 * `pipeline.ts` 의 집계 계약(`PipelineOpportunity`)이 Date 를 요구하고, `new Date("YYYY-MM-DD")`
 * 는 UTC 로 파싱돼 타임존에 따라 하루가 밀리기 때문이다.
 */
type BoardCard = Omit<OpportunityDTO, "expectedCloseDate"> & {
  expectedCloseDate: Date | null;
};

export function OpportunityBoard({
  opportunities,
}: {
  opportunities: OpportunityDTO[];
}) {
  const router = useRouter();
  const { request, pending, cancel, confirm, isSaving } = useStageChange({
    onChanged: () => router.refresh(),
  });

  // 낙관적 단계 보정치 (id → 옮겨 놓은 단계). 저장 성공 후 서버 데이터가 도착하면 버린다.
  const [overrides, setOverrides] = useState<Record<string, OpportunityStage>>({});
  const [source, setSource] = useState(opportunities);
  const [draggingId, setDraggingId] = useState<string | null>(null);
  const [dropStage, setDropStage] = useState<OpportunityStage | null>(null);

  // 서버 데이터가 갱신되면(refresh) 보정치를 비운다 — effect 없이 렌더 중 상태를 맞추는 패턴.
  if (source !== opportunities) {
    setSource(opportunities);
    setOverrides({});
  }

  const cards = useMemo<BoardCard[]>(
    () =>
      opportunities.map((opportunity) => ({
        ...opportunity,
        stage: overrides[opportunity.id] ?? opportunity.stage,
        expectedCloseDate: parseDateInput(opportunity.expectedCloseDate ?? ""),
      })),
    [opportunities, overrides],
  );

  // 헤더 합계 — 집계는 pipeline.ts 순수 함수만 쓴다 (직접 합산 금지)
  const summary = useMemo(() => summarizeByStage(cards), [cards]);

  const cardsByStage = useMemo(() => {
    const grouped = new Map<OpportunityStage, BoardCard[]>();
    for (const { stage } of summary.stages) grouped.set(stage, []);
    for (const card of cards) grouped.get(card.stage)?.push(card);
    return grouped;
  }, [cards, summary.stages]);

  /** 카드 하나를 다른 단계로 옮긴다 (드롭·메뉴 공용) */
  const moveCard = useCallback(
    (card: BoardCard, toStage: OpportunityStage) => {
      const from = card.stage;
      if (from === toStage) return;
      setOverrides((prev) => ({ ...prev, [card.id]: toStage }));
      request({
        target: { id: card.id, name: card.name, stage: from },
        toStage,
        rollback: () => setOverrides((prev) => ({ ...prev, [card.id]: from })),
      });
    },
    [request],
  );

  const handleDrop = useCallback(
    (toStage: OpportunityStage) => {
      const id = draggingId;
      setDraggingId(null);
      setDropStage(null);
      if (!id) return;
      const card = cards.find((item) => item.id === id);
      if (card) moveCard(card, toStage);
    },
    [cards, draggingId, moveCard],
  );

  const handleDragEnd = useCallback(() => {
    setDraggingId(null);
    setDropStage(null);
  }, []);

  return (
    <>
      <p className="text-xs text-muted-foreground">
        카드를 다른 단계로 끌어다 놓으면 단계가 바뀝니다. 마우스를 쓰기 어려우시면
        카드의 ⋯ 메뉴에서 ‘단계 변경’ 을 선택하셔도 됩니다.
      </p>

      <div className="flex gap-4 overflow-x-auto pb-2">
        {summary.stages.map(({ stage, count, amount }) => {
          const isDropTarget = dropStage === stage && draggingId !== null;
          return (
            <section
              key={stage}
              aria-label={`${OPPORTUNITY_STAGE_LABELS[stage]} 단계 · ${formatNumber(count)}건`}
              onDragOver={(event) => {
                // preventDefault 를 해야 이 영역이 드롭을 받는다 (HTML5 DnD 규약)
                event.preventDefault();
                if (dropStage !== stage) setDropStage(stage);
              }}
              onDrop={() => handleDrop(stage)}
              className={cn(
                "flex w-72 shrink-0 flex-col gap-3 rounded-lg border bg-muted/30 p-3 transition-colors",
                isDropTarget && "border-primary bg-primary/5",
              )}
            >
              <header className="space-y-1">
                <div className="flex items-center justify-between gap-2">
                  <StageBadge stage={stage} />
                  <span className="text-xs tabular-nums text-muted-foreground">
                    {formatNumber(count)}건
                  </span>
                </div>
                <p className="text-sm font-medium tabular-nums">
                  {formatKRW(amount)}
                </p>
              </header>

              <div className="flex flex-col gap-2">
                {(cardsByStage.get(stage) ?? []).map((card) => (
                  <BoardCardItem
                    key={card.id}
                    card={card}
                    isDragging={draggingId === card.id}
                    onDragStart={setDraggingId}
                    onDragEnd={handleDragEnd}
                    onStageSelect={moveCard}
                  />
                ))}
                {count === 0 ? (
                  <p className="rounded-md border border-dashed px-3 py-6 text-center text-xs text-muted-foreground">
                    이 단계의 기회가 없습니다.
                  </p>
                ) : null}
              </div>
            </section>
          );
        })}
      </div>

      <StageChangeConfirmDialog
        pending={pending}
        isSaving={isSaving}
        onCancel={cancel}
        onConfirm={confirm}
      />
    </>
  );
}

/**
 * 카드 1장. 카드가 늘어나도 드래그 중 상태 변화가 전체를 다시 그리지 않도록 memo 한다
 * (docs/REACT_BEST_PRACTICES.md — 불필요한 리렌더 억제).
 */
const BoardCardItem = memo(function BoardCardItem({
  card,
  isDragging,
  onDragStart,
  onDragEnd,
  onStageSelect,
}: {
  card: BoardCard;
  isDragging: boolean;
  onDragStart: (id: string) => void;
  onDragEnd: () => void;
  onStageSelect: (card: BoardCard, stage: OpportunityStage) => void;
}) {
  return (
    <article
      draggable
      onDragStart={() => onDragStart(card.id)}
      onDragEnd={onDragEnd}
      className={cn(
        "cursor-grab rounded-md border bg-background p-3 shadow-xs transition-opacity active:cursor-grabbing",
        isDragging && "opacity-50",
      )}
    >
      <div className="flex items-start justify-between gap-1">
        <Link
          href={`/opportunities/${card.id}`}
          // 링크를 끌면 브라우저가 URL 을 드래그해 카드 이동이 막힌다 → 카드만 끌리게 한다
          draggable={false}
          className="rounded text-sm font-medium transition-colors hover:text-primary hover:underline focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
        >
          {card.name}
        </Link>

        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button
              variant="ghost"
              size="icon"
              className="-mt-1 -mr-1 size-7 shrink-0"
              aria-label={`${card.name} 관리`}
            >
              <MoreHorizontal className="size-4" aria-hidden="true" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            <StageChangeMenuItems
              current={card.stage}
              onSelect={(stage) => onStageSelect(card, stage)}
            />
            <DropdownMenuSeparator />
            <DropdownMenuItem asChild>
              <Link href={`/opportunities/${card.id}`}>상세 보기</Link>
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>

      <Link
        href={`/accounts/${card.accountId}`}
        draggable={false}
        className="mt-1 inline-block rounded text-xs text-muted-foreground transition-colors hover:text-primary hover:underline focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
      >
        {card.accountName}
      </Link>

      <p className="mt-2 text-sm font-semibold tabular-nums">
        {formatKRW(card.expectedAmount)}
      </p>

      <dl className="mt-2 space-y-1 text-xs text-muted-foreground">
        <div className="flex items-center gap-1.5">
          <dt className="flex items-center gap-1.5">
            <CalendarClock className="size-3.5" aria-hidden="true" />
            <span className="sr-only">예상 마감일</span>
          </dt>
          <dd>
            {card.expectedCloseDate
              ? formatDate(card.expectedCloseDate)
              : "마감일 미정"}
          </dd>
        </div>
        <div className="flex items-center gap-1.5">
          <dt className="flex items-center gap-1.5">
            <User className="size-3.5" aria-hidden="true" />
            <span className="sr-only">영업 담당자</span>
          </dt>
          <dd>{card.ownerName}</dd>
        </div>
      </dl>
    </article>
  );
});
