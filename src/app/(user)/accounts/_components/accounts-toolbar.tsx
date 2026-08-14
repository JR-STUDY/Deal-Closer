"use client";

import { useRef, useState, type ReactNode } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { Search, X } from "lucide-react";
import { Input } from "@/components/ui/input";
import { nextListSearch } from "@/lib/pagination";

const DEBOUNCE_MS = 350;
const LIST_HREF = "/accounts";

/**
 * 거래처 검색 툴바 (F-102) — 회사명·담당자명 부분 일치.
 * 검색어는 URL 쿼리(`?q=`)에 담아 서버 컴포넌트가 조회 조건으로 쓰게 한다
 * (새로고침·공유 시에도 같은 결과가 나온다).
 *
 * `children` 으로 총 건수를 받아 **검색란과 같은 줄 우측**에 둔다 — 별도 줄을 쓰지 않아
 * 표가 위로 올라온다 (기회-15 와 같은 규칙).
 *
 * 검색란은 **폭이 고정**이다(`flex-1` 이 아니다). 늘어나게 두면 우측 건수 문구가 길어질 때마다
 * 검색창 폭이 함께 움직인다 — 기회 목록과 같은 규칙으로 맞춘다 (A-5 보완).
 */
export function AccountsToolbar({ children }: { children?: ReactNode }) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [q, setQ] = useState(() => searchParams.get("q") ?? "");
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  function push(value: string) {
    // 검색어를 바꾸면 page 를 1로 되돌린다 — 3페이지에 머문 채 좁히면 빈 화면이 뜬다
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

      {children ? <div className="ml-auto">{children}</div> : null}
    </div>
  );
}
