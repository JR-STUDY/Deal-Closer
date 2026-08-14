import Link from "next/link";
import { ArrowDown, ArrowUp, ChevronsUpDown } from "lucide-react";
import { cn } from "@/lib/utils";
import { TableHead } from "@/components/ui/table";
import type { SortState } from "@/lib/opportunity-sort";

/**
 * 정렬 가능한 표 머리글 (2차 피드백 15).
 *
 * 정렬 상태가 URL 에 있으므로 머리글은 **주소를 바꾸는 이동**이다 → `<Link>` 로 만든다.
 * Tab 으로 닿고 Enter 로 눌리며(정책 ACC_*), JS 없이도 동작하고 새 탭·주소 복사까지 그대로
 * 된다 — `ListPagination` 이 이동을 전부 `<Link>` 로 두는 것과 같은 이유다.
 * 현재 정렬 상태는 `<th aria-sort>` 로 알린다 (WAI-ARIA 표 정렬 패턴).
 *
 * **아이콘 자리는 항상 차지한다.** 정렬 중인 칸에만 아이콘을 그리면 그 칸의 머리글 폭이
 * 눌릴 때마다 달라져, `table-fixed` 로 고정한 컬럼 폭 안에서 글자가 밀린다. 비활성일 때도
 * 같은 크기의 흐린 아이콘(⇅)을 둬 자리를 미리 잡아 둔다.
 *
 * 방향은 **색이 아니라 형태**로 드러난다 — 오름차순 ↑ · 내림차순 ↓ · 정렬 안 함 ⇅ (ACC_*).
 */
export function SortableHead({
  label,
  href,
  state,
  align = "left",
  className,
}: {
  /** 머리글에 보이는 글자. 이 값이 그대로 접근성 이름이 된다 */
  label: string;
  /** 눌렀을 때 갈 주소 (검색·필터 유지 + page 1 리셋은 호출측이 만든다) */
  href: string;
  /** 이 컬럼의 현재 정렬 상태 */
  state: SortState;
  align?: "left" | "right";
  className?: string;
}) {
  const isSorted = state !== "none";
  const Icon =
    state === "asc" ? ArrowUp : state === "desc" ? ArrowDown : ChevronsUpDown;

  return (
    <TableHead
      aria-sort={
        state === "asc" ? "ascending" : state === "desc" ? "descending" : "none"
      }
      className={cn(align === "right" && "text-right", className)}
    >
      <Link
        href={href}
        // 마우스 사용자에게만 다음 동작을 알린다. 접근성 이름은 머리글 글자 그대로 두어
        // 표의 각 칸이 "기회명" 으로 읽히게 한다 (설명을 넣으면 칸마다 문장이 딸려 온다).
        title={
          isSorted
            ? `${label} 기준 ${state === "asc" ? "내림차순" : "오름차순"}으로 다시 정렬합니다.`
            : `${label} 기준으로 정렬합니다.`
        }
        className={cn(
          "inline-flex max-w-full items-center gap-1 rounded transition-colors hover:text-primary focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none",
          align === "right" && "flex-row-reverse",
          !isSorted && "text-muted-foreground",
        )}
      >
        <span className="truncate">{label}</span>
        {/* 크기가 고정된 아이콘 칸 — 상태가 바뀌어도 폭이 흔들리지 않는다 */}
        <Icon
          className={cn(
            "size-3.5 shrink-0",
            !isSorted && "text-muted-foreground/60",
          )}
          aria-hidden="true"
        />
      </Link>
    </TableHead>
  );
}
