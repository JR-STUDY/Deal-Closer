"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { useRouter, usePathname, useSearchParams } from "next/navigation";
import { ChevronRight, Folder as FolderIcon, X } from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";

export type SidebarFolder = {
  id: string;
  name: string;
  isCommon: boolean;
  parentId: string | null;
};

/**
 * 문서함(내/공용) 아래 폴더 트리 (다단계).
 * - 하위 폴더가 있으면 chevron 으로 접기/펼치기
 * - 이름 더블클릭 인라인 편집, 형제끼리 드래그 순서 변경, 호버 삭제
 * - 폴더 클릭 시 해당 문서함을 그 폴더로 필터(basePath?folder=id)
 * 하위 폴더 생성은 상단 '폴더 생성' 버튼(CreateFolderDialog)에서 한다.
 */
export function SidebarFolders({
  folders,
  basePath,
}: {
  folders: SidebarFolder[];
  isCommon: boolean;
  basePath: string;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const activeFolder =
    pathname === basePath ? searchParams.get("folder") : null;

  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const [editingId, setEditingId] = useState<string | null>(null);
  const [draft, setDraft] = useState("");
  const [dragId, setDragId] = useState<string | null>(null);
  const [overId, setOverId] = useState<string | null>(null);

  // parentId → 자식들 (서버에서 sortOrder 순으로 내려옴)
  const childrenOf = useMemo(() => {
    const map = new Map<string | null, SidebarFolder[]>();
    for (const f of folders) {
      const list = map.get(f.parentId) ?? [];
      list.push(f);
      map.set(f.parentId, list);
    }
    return map;
  }, [folders]);

  function toggle(id: string) {
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  async function rename(id: string) {
    const name = draft.trim();
    setEditingId(null);
    const current = folders.find((f) => f.id === id);
    if (!name || !current || name === current.name) return;
    try {
      const res = await fetch(`/api/folders/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? "이름 변경에 실패했습니다.");
      router.refresh();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "이름 변경에 실패했습니다.");
    }
  }

  async function remove(folder: SidebarFolder) {
    const hasChildren = (childrenOf.get(folder.id) ?? []).length > 0;
    try {
      const res = await fetch(`/api/folders/${folder.id}`, { method: "DELETE" });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? "삭제에 실패했습니다.");
      toast.success(
        hasChildren
          ? "폴더와 하위 폴더를 삭제했습니다. (문서는 미분류로 이동)"
          : "폴더를 삭제했습니다. (문서는 미분류로 이동)",
      );
      router.refresh();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "삭제에 실패했습니다.");
    }
  }

  function handleDrop(target: SidebarFolder) {
    const src = dragId;
    setDragId(null);
    setOverId(null);
    // 같은 상위(형제)끼리만 순서 변경
    if (!src || src === target.id) return;
    const source = folders.find((f) => f.id === src);
    if (!source || source.parentId !== target.parentId) return;

    const sibs = (childrenOf.get(target.parentId) ?? []).map((f) => f.id);
    const from = sibs.indexOf(src);
    const to = sibs.indexOf(target.id);
    if (from < 0 || to < 0) return;
    sibs.splice(from, 1);
    sibs.splice(to, 0, src);

    fetch("/api/folders/reorder", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ids: sibs }),
    })
      .then((r) => {
        if (!r.ok) throw new Error();
        router.refresh();
      })
      .catch(() => toast.error("순서 변경에 실패했습니다."));
  }

  function renderFolder(folder: SidebarFolder, depth: number) {
    const kids = childrenOf.get(folder.id) ?? [];
    const hasKids = kids.length > 0;
    const isOpen = expanded.has(folder.id);
    const isEditing = editingId === folder.id;
    const active = activeFolder === folder.id;

    return (
      <div key={folder.id}>
        <div
          draggable={!isEditing}
          onDragStart={() => setDragId(folder.id)}
          onDragEnd={() => {
            setDragId(null);
            setOverId(null);
          }}
          onDragOver={(e) => {
            e.preventDefault();
            if (overId !== folder.id) setOverId(folder.id);
          }}
          onDrop={() => handleDrop(folder)}
          style={{ paddingLeft: `${depth * 12}px` }}
          className={cn(
            "group/folder flex items-center gap-0.5 rounded-md pr-1 text-sm transition-colors",
            active
              ? "bg-sidebar-accent text-sidebar-accent-foreground"
              : "text-muted-foreground hover:bg-sidebar-accent/60 hover:text-sidebar-accent-foreground",
            dragId === folder.id && "opacity-50",
            overId === folder.id && dragId && dragId !== folder.id
              ? "ring-1 ring-primary/50"
              : "",
          )}
        >
          <button
            type="button"
            aria-label={hasKids ? (isOpen ? "접기" : "펼치기") : undefined}
            onClick={() => hasKids && toggle(folder.id)}
            className={cn(
              "flex size-5 shrink-0 items-center justify-center text-muted-foreground",
              !hasKids && "invisible",
            )}
          >
            <ChevronRight
              className={cn(
                "size-3.5 transition-transform",
                isOpen && "rotate-90",
              )}
            />
          </button>

          {isEditing ? (
            <input
              autoFocus
              aria-label="폴더 이름 편집"
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              onBlur={() => rename(folder.id)}
              onKeyDown={(e) => {
                if (e.key === "Enter") rename(folder.id);
                if (e.key === "Escape") setEditingId(null);
              }}
              className="my-0.5 w-full rounded border bg-background px-1.5 py-1 text-sm text-foreground outline-none"
            />
          ) : (
            <>
              <Link
                href={`${basePath}?folder=${folder.id}`}
                draggable={false}
                onDoubleClick={(e) => {
                  e.preventDefault();
                  setDraft(folder.name);
                  setEditingId(folder.id);
                }}
                title="더블클릭하여 이름 변경"
                className="flex min-w-0 flex-1 items-center gap-1.5 py-1.5"
              >
                <FolderIcon className="size-3.5 shrink-0" />
                <span className="truncate">{folder.name}</span>
              </Link>
              <button
                type="button"
                aria-label={`${folder.name} 폴더 삭제`}
                onClick={() => remove(folder)}
                className="flex size-5 shrink-0 items-center justify-center rounded text-muted-foreground opacity-0 hover:bg-background hover:text-foreground group-hover/folder:opacity-100"
              >
                <X className="size-3.5" />
              </button>
            </>
          )}
        </div>

        {hasKids && isOpen ? (
          <div>{kids.map((k) => renderFolder(k, depth + 1))}</div>
        ) : null}
      </div>
    );
  }

  const roots = childrenOf.get(null) ?? [];
  if (roots.length === 0) {
    return (
      <p className="py-1 pl-6 text-xs text-muted-foreground">
        폴더가 없습니다.
      </p>
    );
  }

  return <div className="mt-1 space-y-0.5">{roots.map((f) => renderFolder(f, 0))}</div>;
}
