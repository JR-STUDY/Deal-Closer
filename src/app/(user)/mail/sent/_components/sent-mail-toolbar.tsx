"use client";

import { useRef, useState, type ReactNode } from "react";
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
import { ALL_FILTER_VALUE, nextListSearch } from "@/lib/pagination";
import {
  EMAIL_LOG_OPENED_PARAM,
  EMAIL_LOG_QUERY_PARAM,
  EMAIL_LOG_STATUSES,
  EMAIL_LOG_STATUS_LABELS,
  EMAIL_LOG_STATUS_PARAM,
  EMAIL_OPEN_FILTERS,
  EMAIL_OPEN_FILTER_LABELS,
} from "@/lib/email-log";

const DEBOUNCE_MS = 350;
const LIST_HREF = "/mail/sent";
/** Radix Select 는 빈 문자열 value 를 허용하지 않아 "전체" 를 표현할 표식이 필요하다 */
const ALL = ALL_FILTER_VALUE;

/**
 * 발송 이력 툴바 — 검색(수신자·제목·문서 제목) + 상태 필터 + 열람 확인 필터.
 *
 * 조건은 URL 쿼리(`?q=&status=&opened=&page=`)에 담아 서버 컴포넌트가 조회 조건으로 쓰게 한다
 * (기회 목록 툴바와 같은 골격 — 사용자가 화면마다 다시 배우지 않도록 debounce·지우기 버튼·
 * 셀렉트 배치를 맞췄다). 조건을 바꿀 때는 `nextListSearch` 가 **page 를 1로 되돌린다** —
 * 3쪽에 머문 채 조건을 좁히면 결과가 있는데도 빈 화면이 뜬다.
 *
 * `children` 으로 총 건수를 받아 **검색란과 같은 줄 우측**에 둔다 (세로 공간을 아낀다).
 * 검색란은 폭이 고정이라(`flex-1` 이 아니다) 우측 문구가 길어져도 입력이 움직이지 않는다.
 */
export function SentMailToolbar({ children }: { children?: ReactNode }) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [q, setQ] = useState(
    () => searchParams.get(EMAIL_LOG_QUERY_PARAM) ?? "",
  );
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const status = searchParams.get(EMAIL_LOG_STATUS_PARAM) ?? ALL;
  const opened = searchParams.get(EMAIL_LOG_OPENED_PARAM) ?? ALL;

  function push(next: Record<string, string>) {
    const qs = nextListSearch(searchParams.toString(), next);
    router.push(qs ? `${LIST_HREF}?${qs}` : LIST_HREF);
  }

  function onSearchChange(value: string) {
    setQ(value);
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(
      () => push({ [EMAIL_LOG_QUERY_PARAM]: value }),
      DEBOUNCE_MS,
    );
  }

  function clearSearch() {
    setQ("");
    if (timer.current) clearTimeout(timer.current);
    push({ [EMAIL_LOG_QUERY_PARAM]: "" });
  }

  return (
    <div className="flex flex-wrap items-center gap-2">
      <div className="relative w-full sm:w-80">
        <Search className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground" />
        <Input
          type="search"
          value={q}
          onChange={(e) => onSearchChange(e.target.value)}
          placeholder="받는 사람·제목·문서 제목으로 검색"
          aria-label="발송 이력 검색"
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

      <Select
        value={status}
        onValueChange={(value) => push({ [EMAIL_LOG_STATUS_PARAM]: value })}
      >
        <SelectTrigger className="w-36" aria-label="발송 상태 필터">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value={ALL}>상태 전체</SelectItem>
          {EMAIL_LOG_STATUSES.map((value) => (
            <SelectItem key={value} value={value}>
              발송 {EMAIL_LOG_STATUS_LABELS[value]}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>

      <Select
        value={opened}
        onValueChange={(value) => push({ [EMAIL_LOG_OPENED_PARAM]: value })}
      >
        <SelectTrigger className="w-40" aria-label="열람 확인 필터">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value={ALL}>열람 확인 전체</SelectItem>
          {/*
            "미열람" 이라고 적지 않는다 — 걸러내는 것은 **기록이 없는 건**이고 그것이 곧
            읽지 않은 건은 아니다(이미지 차단). 라벨은 `@/lib/email-log` 한 곳에서 온다.
          */}
          {EMAIL_OPEN_FILTERS.map((value) => (
            <SelectItem key={value} value={value}>
              {EMAIL_OPEN_FILTER_LABELS[value]}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>

      {children ? (
        <div className="ml-auto flex flex-wrap items-center gap-x-4 gap-y-2">
          {children}
        </div>
      ) : null}
    </div>
  );
}
