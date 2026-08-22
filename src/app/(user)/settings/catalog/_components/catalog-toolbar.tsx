"use client";

import { useRef, useState, type ReactNode } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { Search, X } from "lucide-react";
import { Input } from "@/components/ui/input";
import { nextListSearch } from "@/lib/pagination";

const DEBOUNCE_MS = 350;
const LIST_HREF = "/settings/catalog";

/**
 * 품목 카탈로그 검색 툴바 — 품목명·SKU·설명 부분 일치.
 *
 * 골격은 거래처 툴바(`accounts-toolbar`)와 같다 — 검색어는 URL 쿼리(`?q=`)에 담고,
 * 검색란 폭은 고정이며, 총 건수는 `children` 으로 받아 같은 줄 우측에 둔다.
 * 화면마다 검색이 다르게 움직이면 사용자가 매번 다시 배운다.
 *
 * 검색어를 바꾸면 `nextListSearch` 가 page 를 1로 되돌린다 — 3페이지에 머문 채 조건을
 * 좁히면 결과가 있는데도 빈 화면이 뜬다.
 */
export function CatalogToolbar({ children }: { children?: ReactNode }) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [q, setQ] = useState(() => searchParams.get("q") ?? "");
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  function push(value: string) {
    const qs = nextListSearch(searchParams.toString(), { q: value });
    router.push(qs ? `${LIST_HREF}?${qs}` : LIST_HREF);
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
    <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
      <div className="relative w-full sm:w-72">
        <Search className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground" />
        <Input
          type="search"
          value={q}
          onChange={(e) => onSearchChange(e.target.value)}
          placeholder="품목명·SKU로 검색"
          aria-label="품목 카탈로그 검색"
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

      {children ? <div className="ml-auto">{children}</div> : null}
    </div>
  );
}
