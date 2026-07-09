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
import { DOCUMENT_TYPES, DOCUMENT_TYPE_LABELS } from "@/lib/constants";

const ALL_TYPES = "__all__";

/**
 * 문서 보관함 검색·종류 필터 툴바.
 * 다른 필터(폴더·상태)는 그대로 둔 채 q·type 쿼리만 갱신한다.
 */
export function LibraryToolbar() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const currentType = searchParams.get("type") ?? ALL_TYPES;
  const [q, setQ] = useState(() => searchParams.get("q") ?? "");
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  /** 현재 쿼리를 복사해 일부만 수정한 뒤 이동 */
  function push(mods: (sp: URLSearchParams) => void) {
    const sp = new URLSearchParams(searchParams.toString());
    mods(sp);
    const qs = sp.toString();
    router.push(qs ? `/library?${qs}` : "/library");
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
    <div className="flex flex-col gap-2 sm:flex-row">
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

      <Select
        value={currentType}
        onValueChange={(v) =>
          push((sp) => {
            if (v === ALL_TYPES) sp.delete("type");
            else sp.set("type", v);
          })
        }
      >
        <SelectTrigger className="sm:w-40" aria-label="문서 종류 필터">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value={ALL_TYPES}>모든 종류</SelectItem>
          {DOCUMENT_TYPES.map((t) => (
            <SelectItem key={t} value={t}>
              {DOCUMENT_TYPE_LABELS[t]}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  );
}
