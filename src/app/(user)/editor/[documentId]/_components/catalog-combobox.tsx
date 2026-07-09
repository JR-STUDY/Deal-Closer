"use client";

import { useEffect, useRef, useState } from "react";
import type { CatalogOption } from "@/lib/editor-schema";
import { Input } from "@/components/ui/input";
import { Check } from "lucide-react";

type Props = {
  value: string;
  catalog: CatalogOption[];
  onChange: (v: string) => void;
  onPick: (item: CatalogOption) => void;
  placeholder?: string;
};

/** 카탈로그 품목 자동완성 콤보박스 — 입력 필터 + 스타일된 팝오버 리스트 */
export function CatalogCombobox({
  value,
  catalog,
  onChange,
  onPick,
  placeholder,
}: Props) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  const q = value.trim().toLowerCase();
  const matches = q
    ? catalog.filter((c) => c.name.toLowerCase().includes(q))
    : catalog;

  useEffect(() => {
    function onDoc(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, []);

  return (
    <div ref={ref} className="relative">
      <Input
        value={value}
        placeholder={placeholder}
        onChange={(e) => {
          onChange(e.target.value);
          setOpen(true);
        }}
        onFocus={() => setOpen(true)}
      />
      {open && catalog.length > 0 ? (
        <ul className="absolute z-50 mt-1 max-h-56 w-full overflow-auto rounded-md border bg-popover p-1 text-popover-foreground shadow-md">
          {matches.length === 0 ? (
            <li className="px-2 py-1.5 text-xs text-muted-foreground">
              일치하는 품목이 없습니다
            </li>
          ) : (
            matches.map((c) => {
              const selected = c.name === value;
              return (
                <li key={c.id}>
                  <button
                    type="button"
                    onClick={() => {
                      onPick(c);
                      setOpen(false);
                    }}
                    className="flex w-full items-center gap-2 rounded-sm px-2 py-1.5 text-left text-xs hover:bg-accent hover:text-accent-foreground"
                  >
                    <Check
                      className={`size-3.5 shrink-0 ${selected ? "opacity-100" : "opacity-0"}`}
                    />
                    <span className="flex-1 truncate">{c.name}</span>
                    <span className="shrink-0 tabular-nums text-muted-foreground">
                      ₩{c.unitPrice.toLocaleString("ko-KR")}
                    </span>
                  </button>
                </li>
              );
            })
          )}
        </ul>
      ) : null}
    </div>
  );
}
