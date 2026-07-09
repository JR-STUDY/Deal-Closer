"use client";

import { useRouter, usePathname, useSearchParams } from "next/navigation";
import { LayoutGrid, List as ListIcon } from "lucide-react";
import { Button } from "@/components/ui/button";

/** 카드/목록 보기 전환 — view 쿼리로 상태를 공유(기본 card) */
export function ViewToggle() {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const view = searchParams.get("view") === "list" ? "list" : "card";

  function set(next: "card" | "list") {
    const sp = new URLSearchParams(searchParams.toString());
    if (next === "card") sp.delete("view");
    else sp.set("view", next);
    const qs = sp.toString();
    router.push(qs ? `${pathname}?${qs}` : pathname);
  }

  return (
    <div className="inline-flex shrink-0 rounded-md border p-0.5">
      <Button
        variant={view === "card" ? "secondary" : "ghost"}
        size="sm"
        className="h-7 gap-1.5 px-2"
        aria-pressed={view === "card"}
        onClick={() => set("card")}
      >
        <LayoutGrid className="size-4" />
        카드
      </Button>
      <Button
        variant={view === "list" ? "secondary" : "ghost"}
        size="sm"
        className="h-7 gap-1.5 px-2"
        aria-pressed={view === "list"}
        onClick={() => set("list")}
      >
        <ListIcon className="size-4" />
        목록
      </Button>
    </div>
  );
}
