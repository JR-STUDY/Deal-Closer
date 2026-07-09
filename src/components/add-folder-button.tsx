"use client";

import { useState } from "react";
import { useRouter, usePathname, useSearchParams } from "next/navigation";
import { FolderPlus } from "lucide-react";
import { toast } from "sonner";

/**
 * '폴더 추가' 버튼 (문서 보관함 옆).
 * 선택(활성)된 폴더가 있으면 그 하위에, 없으면 현재 문서함 최상위에
 * "새 폴더"를 즉시 만들고, edit 파라미터로 이동해 바로 이름 편집 상태로 연다.
 * (팝업 없음)
 */
export function AddFolderButton() {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [busy, setBusy] = useState(false);

  async function add() {
    if (busy) return;
    setBusy(true);

    const onLibrary = pathname === "/library" || pathname === "/library/common";
    const isCommonBox = pathname === "/library/common";
    const basePath = isCommonBox ? "/library/common" : "/library";
    const activeFolder = onLibrary ? searchParams.get("folder") : null;

    const payload = activeFolder
      ? { name: "새 폴더", parentId: activeFolder }
      : { name: "새 폴더", isCommon: isCommonBox };

    try {
      const res = await fetch("/api/folders", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? "폴더 생성에 실패했습니다.");

      // 새 폴더를 바로 편집 상태로: 현재 필터는 유지하고 edit 파라미터만 추가
      const sp = onLibrary
        ? new URLSearchParams(searchParams.toString())
        : new URLSearchParams();
      sp.set("edit", json.data.id);
      router.replace(`${basePath}?${sp.toString()}`);
      router.refresh();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "폴더 생성에 실패했습니다.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <button
      type="button"
      onClick={add}
      disabled={busy}
      aria-label="폴더 추가"
      title="선택한 폴더 아래에 새 폴더 추가 (없으면 최상위)"
      className="flex size-6 shrink-0 items-center justify-center rounded text-muted-foreground transition-colors hover:bg-sidebar-accent/60 hover:text-sidebar-accent-foreground disabled:opacity-50"
    >
      <FolderPlus className="size-4" />
    </button>
  );
}
