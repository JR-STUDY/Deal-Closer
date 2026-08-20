"use client";

import Link from "next/link";
import { Filter, ListFilter } from "lucide-react";
import { cn } from "@/lib/utils";
import { TableHead } from "@/components/ui/table";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

/** 머리글 메뉴에 걸 선택지 한 줄 — href 는 서버가 `pageHref` 로 미리 만들어 넘긴다 */
export type StageFilterOption = {
  /** 단계 코드 (전체는 빈 문자열) */
  value: string;
  label: string;
  /** 이 선택지를 고르면 갈 주소 (검색·정렬 유지 + page 1 리셋 포함) */
  href: string;
};

/**
 * 단계 필터를 **표 머리글에서** 고른다 (4차 피드백 6).
 *
 * 툴바 셀렉트를 여기로 옮겼다 — 거르는 대상이 그 칸의 값이므로 조건도 그 칸 위에 있는 편이
 * 찾기 쉽고, 툴바에서 한 자리를 돌려받는다.
 *
 * **정렬과 겹치지 않는다.** 단계는 애초에 정렬 대상이 아니다(DB 가 String 이라 정렬하면
 * 파이프라인 순서가 아니라 알파벳 순으로 선다 — `@/lib/opportunity-sort` 참고). 그래서 이
 * 머리글은 정렬을 아예 맡지 않고 필터만 맡는다. 한 칸에 두 동작을 겹쳐 넣어 "눌렀는데 어느
 * 쪽이 먹었는지" 를 헷갈리게 만들 이유가 없다.
 *
 * **폭이 흔들리지 않는다.** 아이콘 자리를 상태와 무관하게 항상 차지하고(`SortableHead` 와
 * 같은 규칙), 글자는 `truncate` 로 잘린다. 필터가 걸리면 글자가 "단계" 대신 그 단계 이름이
 * 되고 아이콘이 채워진 필터 모양으로 바뀐다 — **색만으로 구분하지 않는다** (정책 ACC_*).
 *
 * 선택지는 전부 진짜 `<Link>` 다. 상태가 URL 쿼리(`?stage=`)에 있으므로 필터를 고르는 일은
 * **주소를 바꾸는 이동**이고, 그래야 새 탭·주소 복사·뒤로가기가 그대로 산다
 * (`SortableHead`·`ListPagination` 과 같은 이유). page 리셋은 서버가 href 를 만들 때 이미
 * 반영해 둔다. 열기·이동은 Radix 메뉴가 키보드(Enter·↑↓·Esc)로 처리한다.
 */
export function StageFilterHead({
  options,
  activeValue,
  className,
}: {
  options: readonly StageFilterOption[];
  /** 지금 걸린 단계 (없으면 빈 문자열) */
  activeValue: string;
  className?: string;
}) {
  const active = options.find((option) => option.value === activeValue);
  const isFiltered = Boolean(activeValue) && Boolean(active);
  const Icon = isFiltered ? Filter : ListFilter;

  return (
    <TableHead className={className}>
      <DropdownMenu>
        <DropdownMenuTrigger
          // 칸 이름("단계")과 현재 상태를 함께 읽힌다 — 걸린 필터가 글자로도 드러나야
          // 스크린리더 사용자가 지금 목록이 좁혀져 있음을 안다
          aria-label={
            isFiltered
              ? `단계 필터 — 현재 ${active?.label}. 다른 단계를 고르려면 여세요`
              : "단계 필터 — 현재 전체. 단계를 고르려면 여세요"
          }
          className={cn(
            "inline-flex max-w-full items-center gap-1 rounded transition-colors hover:text-primary focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none",
            !isFiltered && "text-muted-foreground",
          )}
        >
          <span className="truncate">{isFiltered ? active?.label : "단계"}</span>
          {/* 크기가 고정된 아이콘 칸 — 필터가 걸리고 풀려도 폭이 흔들리지 않는다 */}
          <Icon
            className={cn(
              "size-3.5 shrink-0",
              !isFiltered && "text-muted-foreground/60",
            )}
            aria-hidden="true"
          />
        </DropdownMenuTrigger>

        <DropdownMenuContent align="start" className="w-40">
          <DropdownMenuLabel>단계로 좁히기</DropdownMenuLabel>
          <DropdownMenuSeparator />
          {options.map((option) => (
            <DropdownMenuItem key={option.value || "ALL"} asChild>
              <Link
                href={option.href}
                aria-current={option.value === activeValue ? "true" : undefined}
                className={cn(
                  "cursor-pointer",
                  option.value === activeValue && "font-medium",
                )}
              >
                {option.label}
                {option.value === activeValue ? (
                  <span className="sr-only"> (적용 중)</span>
                ) : null}
              </Link>
            </DropdownMenuItem>
          ))}
        </DropdownMenuContent>
      </DropdownMenu>
    </TableHead>
  );
}
