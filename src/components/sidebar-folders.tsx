"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter, usePathname, useSearchParams } from "next/navigation";
import { Folder as FolderIcon, Plus, X } from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";

export type SidebarFolder = { id: string; name: string; isCommon: boolean };

/**
 * 문서함(내/공용) 아래에 붙는 폴더 목록.
 * - '+ 폴더'로 추가, 이름 더블클릭으로 인라인 편집, 드래그로 순서 변경
 * - 폴더 클릭 시 해당 문서함을 그 폴더로 필터(basePath?folder=id)
 * 서버에서 내려온 folders 로 초기화하며, 변경 후 router.refresh() 로 재동기화한다
 * (부모에서 순서 서명으로 key 를 주어 서버 상태가 바뀌면 재마운트된다).
 */
export function SidebarFolders({
  folders,
  isCommon,
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

  const [items, setItems] = useState(folders);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [draft, setDraft] = useState("");
  const [adding, setAdding] = useState(false);
  const [newName, setNewName] = useState("");
  const [dragId, setDragId] = useState<string | null>(null);
  const [overId, setOverId] = useState<string | null>(null);

  async function addFolder() {
    const name = newName.trim();
    if (!name) {
      setAdding(false);
      setNewName("");
      return;
    }
    try {
      const res = await fetch("/api/folders", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name, isCommon }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? "폴더 생성에 실패했습니다.");
      toast.success("폴더를 추가했습니다.");
      setAdding(false);
      setNewName("");
      router.refresh();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "폴더 생성에 실패했습니다.");
    }
  }

  async function rename(id: string) {
    const name = draft.trim();
    setEditingId(null);
    const current = items.find((f) => f.id === id);
    if (!name || !current || name === current.name) return;
    setItems((prev) => prev.map((f) => (f.id === id ? { ...f, name } : f)));
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
      router.refresh();
    }
  }

  async function remove(id: string) {
    setItems((prev) => prev.filter((f) => f.id !== id));
    try {
      const res = await fetch(`/api/folders/${id}`, { method: "DELETE" });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? "삭제에 실패했습니다.");
      toast.success("폴더를 삭제했습니다. (문서는 미분류로 이동)");
      router.refresh();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "삭제에 실패했습니다.");
      router.refresh();
    }
  }

  function handleDrop(targetId: string) {
    const src = dragId;
    setDragId(null);
    setOverId(null);
    if (!src || src === targetId) return;
    const from = items.findIndex((f) => f.id === src);
    const to = items.findIndex((f) => f.id === targetId);
    if (from < 0 || to < 0) return;

    const next = [...items];
    const [moved] = next.splice(from, 1);
    next.splice(to, 0, moved);
    setItems(next);

    fetch("/api/folders/reorder", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ids: next.map((f) => f.id) }),
    })
      .then((r) => {
        if (!r.ok) throw new Error();
        router.refresh();
      })
      .catch(() => {
        toast.error("순서 변경에 실패했습니다.");
        router.refresh();
      });
  }

  return (
    <div className="mt-1 space-y-0.5">
      {items.map((folder) => {
        const active = activeFolder === folder.id;
        const isEditing = editingId === folder.id;
        return (
          <div
            key={folder.id}
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
            onDrop={() => handleDrop(folder.id)}
            className={cn(
              "group/folder flex items-center gap-1.5 rounded-md pr-1 text-sm transition-colors",
              active
                ? "bg-sidebar-accent text-sidebar-accent-foreground"
                : "text-muted-foreground hover:bg-sidebar-accent/60 hover:text-sidebar-accent-foreground",
              dragId === folder.id && "opacity-50",
              overId === folder.id && dragId && dragId !== folder.id
                ? "ring-1 ring-primary/50"
                : "",
            )}
          >
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
                className="my-0.5 ml-1.5 w-full rounded border bg-background px-1.5 py-1 text-sm text-foreground outline-none"
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
                  className="flex min-w-0 flex-1 cursor-pointer items-center gap-2 py-1.5 pl-2.5"
                >
                  <FolderIcon className="size-3.5 shrink-0" />
                  <span className="truncate">{folder.name}</span>
                </Link>
                <button
                  type="button"
                  aria-label={`${folder.name} 폴더 삭제`}
                  onClick={() => remove(folder.id)}
                  className="flex size-5 shrink-0 items-center justify-center rounded text-muted-foreground opacity-0 hover:bg-background hover:text-foreground group-hover/folder:opacity-100"
                >
                  <X className="size-3.5" />
                </button>
              </>
            )}
          </div>
        );
      })}

      {adding ? (
        <input
          autoFocus
          aria-label="새 폴더 이름"
          value={newName}
          onChange={(e) => setNewName(e.target.value)}
          onBlur={addFolder}
          onKeyDown={(e) => {
            if (e.key === "Enter") addFolder();
            if (e.key === "Escape") {
              setAdding(false);
              setNewName("");
            }
          }}
          placeholder="폴더 이름"
          className="my-0.5 ml-2.5 w-[calc(100%-0.625rem)] rounded border bg-background px-1.5 py-1 text-sm text-foreground outline-none"
        />
      ) : (
        <button
          type="button"
          onClick={() => setAdding(true)}
          className="flex w-full items-center gap-1.5 rounded-md py-1.5 pl-2.5 text-sm text-muted-foreground transition-colors hover:bg-sidebar-accent/60 hover:text-sidebar-accent-foreground"
        >
          <Plus className="size-3.5 shrink-0" />폴더 추가
        </button>
      )}
    </div>
  );
}
