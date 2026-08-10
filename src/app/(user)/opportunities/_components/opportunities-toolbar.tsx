"use client";

import { useRef, useState, type ReactNode } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { Columns3, List, Search, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { OPPORTUNITY_STAGES, OPPORTUNITY_STAGE_LABELS } from "@/lib/constants";
import { ALL_FILTER_VALUE, nextListSearch } from "@/lib/pagination";
import type { OpportunityOwnerOption } from "@/lib/opportunity";

const DEBOUNCE_MS = 350;
const LIST_HREF = "/opportunities";
/** Radix Select 는 빈 문자열 value 를 허용하지 않아 "전체" 를 표현할 표식이 필요하다 */
const ALL = ALL_FILTER_VALUE;
/** 칸반 보기 표식 (`?view=board`). 목록이 기본이라 목록일 때는 파라미터를 지운다. */
const BOARD_VIEW = "board";

/**
 * 영업 기회 목록 툴바 (F-111 · F-112) — 검색 + 단계별·영업 담당자별 필터 + 목록/칸반 전환.
 * 조건은 URL 쿼리(`?q=&stage=&owner=&view=&page=`)에 담아 서버 컴포넌트가 조회 조건으로 쓰게 한다
 * (새로고침·공유 시에도 같은 결과·같은 보기가 나온다).
 *
 * `children` 으로 총 건수·예상 금액 합계를 받아 **검색란과 같은 줄 우측**에 둔다 (기회-15).
 * 좁은 화면에서는 `flex-wrap` 으로 아래 줄로 내려가 겹치지 않는다.
 */
export function OpportunitiesToolbar({
  owners,
  children,
}: {
  owners: OpportunityOwnerOption[];
  children?: ReactNode;
}) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [q, setQ] = useState(() => searchParams.get("q") ?? "");
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const stage = searchParams.get("stage") ?? ALL;
  const owner = searchParams.get("owner") ?? ALL;
  const isBoard = searchParams.get("view") === BOARD_VIEW;

  function push(next: {
    q?: string;
    stage?: string;
    owner?: string;
    view?: string;
  }) {
    // 검색·필터를 바꾸면 page 를 1로 되돌린다. 보기 전환은 결과 집합이 같아 page 를 유지한다.
    const qs = nextListSearch(searchParams.toString(), next);
    router.push(qs ? `${LIST_HREF}?${qs}` : LIST_HREF);
  }

  function onSearchChange(value: string) {
    setQ(value);
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => push({ q: value }), DEBOUNCE_MS);
  }

  function clearSearch() {
    setQ("");
    if (timer.current) clearTimeout(timer.current);
    push({ q: "" });
  }

  return (
    <div className="flex flex-wrap items-center gap-2">
      <div className="relative min-w-56 flex-1 sm:max-w-md">
        <Search className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground" />
        <Input
          type="search"
          value={q}
          onChange={(e) => onSearchChange(e.target.value)}
          placeholder="기회명·거래처명으로 검색"
          aria-label="영업 기회 검색"
          className="pl-9"
        />
        {q ? (
          <button
            type="button"
            onClick={clearSearch}
            aria-label="검색어 지우기"
            className="absolute top-1/2 right-2 flex size-6 -translate-y-1/2 items-center justify-center rounded text-muted-foreground hover:bg-accent hover:text-foreground"
          >
            <X className="size-4" />
          </button>
        ) : null}
      </div>

      <Select value={stage} onValueChange={(value) => push({ stage: value })}>
        <SelectTrigger className="w-36" aria-label="단계 필터">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value={ALL}>단계 전체</SelectItem>
          {OPPORTUNITY_STAGES.map((value) => (
            <SelectItem key={value} value={value}>
              {OPPORTUNITY_STAGE_LABELS[value]}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>

      {/* 거래처 담당자와 헷갈리지 않도록 "영업 담당자" 로 못박는다 (기회-14) */}
      <Select value={owner} onValueChange={(value) => push({ owner: value })}>
        <SelectTrigger className="w-44" aria-label="영업 담당자 필터">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value={ALL}>영업 담당자 전체</SelectItem>
          {owners.map((item) => (
            <SelectItem key={item.id} value={item.id}>
              {item.name}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>

      {/* 합계와 보기 전환을 오른쪽에 묶는다 — 좁아지면 이 묶음이 통째로 아래 줄로 내려간다 */}
      <div className="ml-auto flex flex-wrap items-center gap-x-4 gap-y-2">
        {children}

        {/* 보기 전환 — 검색·필터·페이지는 그대로 두고 view 파라미터만 바꾼다 */}
        <div
          role="group"
          aria-label="보기 방식"
          className="flex items-center gap-0.5 rounded-md border p-0.5"
        >
          <Button
            type="button"
            size="sm"
            variant={isBoard ? "ghost" : "secondary"}
            aria-pressed={!isBoard}
            onClick={() => push({ view: "" })}
          >
            <List className="size-4" aria-hidden="true" />
            목록
          </Button>
          <Button
            type="button"
            size="sm"
            variant={isBoard ? "secondary" : "ghost"}
            aria-pressed={isBoard}
            onClick={() => push({ view: BOARD_VIEW })}
          >
            <Columns3 className="size-4" aria-hidden="true" />
            칸반
          </Button>
        </div>
      </div>
    </div>
  );
}
