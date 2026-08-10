"use client";

import { useRef, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { Search, X } from "lucide-react";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { OPPORTUNITY_STAGES, OPPORTUNITY_STAGE_LABELS } from "@/lib/constants";
import type { OpportunityOwnerOption } from "@/lib/opportunity";

const DEBOUNCE_MS = 350;
const LIST_HREF = "/opportunities";
/** Radix Select 는 빈 문자열 value 를 허용하지 않아 "전체" 를 표현할 표식이 필요하다 */
const ALL = "ALL";

/**
 * 영업 기회 목록 툴바 (F-111) — 기회명·거래처명 검색 + 단계별·담당자별 필터.
 * 조건은 URL 쿼리(`?q=&stage=&owner=`)에 담아 서버 컴포넌트가 조회 조건으로 쓰게 한다
 * (새로고침·공유 시에도 같은 결과가 나온다).
 */
export function OpportunitiesToolbar({
  owners,
}: {
  owners: OpportunityOwnerOption[];
}) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [q, setQ] = useState(() => searchParams.get("q") ?? "");
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const stage = searchParams.get("stage") ?? ALL;
  const owner = searchParams.get("owner") ?? ALL;

  function push(next: { q?: string; stage?: string; owner?: string }) {
    const sp = new URLSearchParams(searchParams.toString());
    for (const [key, value] of Object.entries(next)) {
      const trimmed = value?.trim() ?? "";
      if (trimmed && trimmed !== ALL) sp.set(key, trimmed);
      else sp.delete(key);
    }
    const qs = sp.toString();
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

      <Select value={owner} onValueChange={(value) => push({ owner: value })}>
        <SelectTrigger className="w-40" aria-label="담당자 필터">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value={ALL}>담당자 전체</SelectItem>
          {owners.map((item) => (
            <SelectItem key={item.id} value={item.id}>
              {item.name}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  );
}
