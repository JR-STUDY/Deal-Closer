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
import {
  DOCUMENT_TYPES,
  DOCUMENT_TYPE_LABELS,
  DOCUMENT_STATUSES,
  DOCUMENT_STATUS_LABELS,
} from "@/lib/constants";

const ALL = "__all__";

/**
 * 내 문서함 검색·필터 툴바 — 검색어 + 계약 단계 + 문서 종류를 한 줄에서
 * 동시에 적용한다. 폴더 선택은 유지하며 q·status·type 쿼리만 갱신한다.
 */
export function LibraryToolbar() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const currentStatus = searchParams.get("status") ?? ALL;
  const currentType = searchParams.get("type") ?? ALL;
  const [q, setQ] = useState(() => searchParams.get("q") ?? "");
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  /** 현재 쿼리를 복사해 일부만 수정한 뒤 이동(다른 필터·폴더는 유지) */
  function push(mods: (sp: URLSearchParams) => void) {
    const sp = new URLSearchParams(searchParams.toString());
    mods(sp);
    const qs = sp.toString();
    router.push(qs ? `/library?${qs}` : "/library");
  }

  function setParam(key: string, value: string) {
    push((sp) => {
      if (value === ALL) sp.delete(key);
      else sp.set(key, value);
    });
  }

  function onSearchChange(value: string) {
    setQ(value);
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => {
      push((sp) => {
        const trimmed = value.trim();
        if (trimmed) sp.set("q", trimmed);
        else sp.delete("q");
      });
    }, 350);
  }

  function clearSearch() {
    setQ("");
    if (timer.current) clearTimeout(timer.current);
    push((sp) => sp.delete("q"));
  }

  return (
    <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
      <div className="relative flex-1">
        <Search className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground" />
        <Input
          type="search"
          value={q}
          onChange={(e) => onSearchChange(e.target.value)}
          placeholder="제목·거래처로 검색"
          aria-label="문서 검색"
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

      <div className="flex gap-2">
        <Select
          value={currentStatus}
          onValueChange={(v) => setParam("status", v)}
        >
          <SelectTrigger className="w-full sm:w-36" aria-label="계약 단계 필터">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value={ALL}>모든 단계</SelectItem>
            {DOCUMENT_STATUSES.map((s) => (
              <SelectItem key={s} value={s}>
                {DOCUMENT_STATUS_LABELS[s]}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        <Select value={currentType} onValueChange={(v) => setParam("type", v)}>
          <SelectTrigger className="w-full sm:w-36" aria-label="문서 종류 필터">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value={ALL}>모든 종류</SelectItem>
            {DOCUMENT_TYPES.map((t) => (
              <SelectItem key={t} value={t}>
                {DOCUMENT_TYPE_LABELS[t]}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
    </div>
  );
}
