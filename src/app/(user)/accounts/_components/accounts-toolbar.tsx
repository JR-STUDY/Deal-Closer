"use client";

import { useRef, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { Search, X } from "lucide-react";
import { Input } from "@/components/ui/input";

const DEBOUNCE_MS = 350;

/**
 * 거래처 검색 툴바 (F-102) — 회사명·담당자명 부분 일치.
 * 검색어는 URL 쿼리(`?q=`)에 담아 서버 컴포넌트가 조회 조건으로 쓰게 한다
 * (새로고침·공유 시에도 같은 결과가 나온다).
 */
export function AccountsToolbar() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [q, setQ] = useState(() => searchParams.get("q") ?? "");
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  function push(value: string) {
    const sp = new URLSearchParams(searchParams.toString());
    const trimmed = value.trim();
    if (trimmed) sp.set("q", trimmed);
    else sp.delete("q");
    const qs = sp.toString();
    router.push(qs ? `/accounts?${qs}` : "/accounts");
  }

  function onSearchChange(value: string) {
    setQ(value);
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => push(value), DEBOUNCE_MS);
  }

  function clearSearch() {
    setQ("");
    if (timer.current) clearTimeout(timer.current);
    push("");
  }

  return (
    <div className="relative max-w-md">
      <Search className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground" />
      <Input
        type="search"
        value={q}
        onChange={(e) => onSearchChange(e.target.value)}
        placeholder="회사명·담당자명으로 검색"
        aria-label="거래처 검색"
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
  );
}
