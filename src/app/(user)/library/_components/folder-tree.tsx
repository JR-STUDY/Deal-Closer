"use client";

import { useMemo, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import {
  ChevronRight,
  Folder as FolderIcon,
  FolderPlus,
  Inbox,
  Layers,
  MoreHorizontal,
  Pencil,
  Trash2,
} from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

export type FolderNode = {
  id: string;
  name: string;
  parentId: string | null;
  docCount: number;
};

type Props = {
  folders: FolderNode[];
  /** 현재 선택: 폴더 id | "none"(미분류) | null(전체) */
  selected: string | null;
  totalCount: number;
  unfiledCount: number;
};

type DialogState =
  | { mode: "create"; parentId: string | null; parentName: string | null }
  | { mode: "rename"; folder: FolderNode }
  | { mode: "delete"; folder: FolderNode }
  | null;

export function FolderTree({
  folders,
  selected,
  totalCount,
  unfiledCount,
}: Props) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [dialog, setDialog] = useState<DialogState>(null);

  // 부모 → 자식 목록 매핑
  const childrenOf = useMemo(() => {
    const map = new Map<string | null, FolderNode[]>();
    for (const f of folders) {
      const list = map.get(f.parentId) ?? [];
      list.push(f);
      map.set(f.parentId, list);
    }
    return map;
  }, [folders]);

  /** 다른 필터(상태·종류·검색)는 유지한 채 폴더만 바꿔 이동하는 링크 */
  function hrefFor(folder: string | null): string {
    const sp = new URLSearchParams(searchParams.toString());
    if (folder) sp.set("folder", folder);
    else sp.delete("folder");
    const qs = sp.toString();
    return qs ? `/library?${qs}` : "/library";
  }

  function go(folder: string | null) {
    router.push(hrefFor(folder));
  }

  return (
    <aside className="w-full space-y-1 rounded-lg bg-muted/60 p-2 lg:max-h-[calc(100vh-11rem)] lg:overflow-y-auto">
      <div className="mb-2 flex items-center justify-between px-1">
        <span className="text-xs font-medium text-muted-foreground">폴더</span>
        <Button
          variant="ghost"
          size="sm"
          className="h-7 gap-1 px-2 text-xs"
          onClick={() =>
            setDialog({ mode: "create", parentId: null, parentName: null })
          }
        >
          <FolderPlus className="size-3.5" />새 폴더
        </Button>
      </div>

      {/* 전체 / 미분류 (고정 항목) */}
      <FixedRow
        icon={<Layers className="size-4" />}
        label="전체 문서"
        count={totalCount}
        active={selected === null}
        onClick={() => go(null)}
      />
      <FixedRow
        icon={<Inbox className="size-4" />}
        label="미분류"
        count={unfiledCount}
        active={selected === "none"}
        onClick={() => go("none")}
      />

      <div className="my-2 border-t" />

      {/* 폴더 트리 */}
      {(childrenOf.get(null) ?? []).map((f) => (
        <FolderRow
          key={f.id}
          folder={f}
          depth={0}
          childrenOf={childrenOf}
          selected={selected}
          onSelect={go}
          onAction={setDialog}
        />
      ))}
      {(childrenOf.get(null) ?? []).length === 0 ? (
        <p className="px-2 py-1 text-xs text-muted-foreground">
          아직 폴더가 없습니다.
        </p>
      ) : null}

      {dialog ? (
        <FolderDialog
          dialog={dialog}
          onClose={() => setDialog(null)}
          onDone={() => {
            setDialog(null);
            router.refresh();
          }}
        />
      ) : null}
    </aside>
  );
}

function FixedRow({
  icon,
  label,
  count,
  active,
  onClick,
}: {
  icon: React.ReactNode;
  label: string;
  count: number;
  active: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-sm transition-colors",
        active
          ? "bg-background font-medium text-foreground shadow-sm"
          : "text-muted-foreground hover:bg-background/70 hover:text-foreground",
      )}
    >
      {icon}
      <span className="flex-1 truncate text-left">{label}</span>
      <span className="text-xs tabular-nums">{count}</span>
    </button>
  );
}

function FolderRow({
  folder,
  depth,
  childrenOf,
  selected,
  onSelect,
  onAction,
}: {
  folder: FolderNode;
  depth: number;
  childrenOf: Map<string | null, FolderNode[]>;
  selected: string | null;
  onSelect: (id: string) => void;
  onAction: (d: DialogState) => void;
}) {
  const children = childrenOf.get(folder.id) ?? [];
  const hasChildren = children.length > 0;
  const [expanded, setExpanded] = useState(true);
  const active = selected === folder.id;

  return (
    <div>
      <div
        className={cn(
          "group flex items-center gap-1 rounded-md pr-1 transition-colors",
          active
            ? "bg-background text-foreground shadow-sm"
            : "hover:bg-background/70",
        )}
        style={{ paddingLeft: `${depth * 14}px` }}
      >
        <button
          type="button"
          aria-label={hasChildren ? (expanded ? "접기" : "펼치기") : undefined}
          onClick={() => hasChildren && setExpanded((v) => !v)}
          className={cn(
            "flex size-5 shrink-0 items-center justify-center text-muted-foreground",
            !hasChildren && "invisible",
          )}
        >
          <ChevronRight
            className={cn("size-3.5 transition-transform", expanded && "rotate-90")}
          />
        </button>

        <button
          type="button"
          onClick={() => onSelect(folder.id)}
          className={cn(
            "flex min-w-0 flex-1 items-center gap-2 py-1.5 text-sm",
            active
              ? "font-medium"
              : "text-muted-foreground group-hover:text-foreground",
          )}
        >
          <FolderIcon className="size-4 shrink-0" />
          <span className="flex-1 truncate text-left">{folder.name}</span>
          <span className="text-xs tabular-nums">{folder.docCount}</span>
        </button>

        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <button
              type="button"
              aria-label={`${folder.name} 폴더 메뉴`}
              className="flex size-6 shrink-0 items-center justify-center rounded text-muted-foreground opacity-0 hover:bg-background group-hover:opacity-100 data-[state=open]:opacity-100"
            >
              <MoreHorizontal className="size-3.5" />
            </button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            <DropdownMenuItem
              onClick={() =>
                onAction({
                  mode: "create",
                  parentId: folder.id,
                  parentName: folder.name,
                })
              }
            >
              <FolderPlus className="size-4" />
              하위 폴더 추가
            </DropdownMenuItem>
            <DropdownMenuItem onClick={() => onAction({ mode: "rename", folder })}>
              <Pencil className="size-4" />
              이름 변경
            </DropdownMenuItem>
            <DropdownMenuItem
              variant="destructive"
              onClick={() => onAction({ mode: "delete", folder })}
            >
              <Trash2 className="size-4" />
              삭제
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>

      {hasChildren && expanded ? (
        <div>
          {children.map((c) => (
            <FolderRow
              key={c.id}
              folder={c}
              depth={depth + 1}
              childrenOf={childrenOf}
              selected={selected}
              onSelect={onSelect}
              onAction={onAction}
            />
          ))}
        </div>
      ) : null}
    </div>
  );
}

function FolderDialog({
  dialog,
  onClose,
  onDone,
}: {
  dialog: NonNullable<DialogState>;
  onClose: () => void;
  onDone: () => void;
}) {
  const [name, setName] = useState(
    dialog.mode === "rename" ? dialog.folder.name : "",
  );
  const [busy, setBusy] = useState(false);

  async function submitCreateOrRename() {
    const trimmed = name.trim();
    if (!trimmed) {
      toast.error("폴더 이름을 입력해 주세요.");
      return;
    }
    setBusy(true);
    try {
      const res =
        dialog.mode === "create"
          ? await fetch("/api/folders", {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ name: trimmed, parentId: dialog.parentId }),
            })
          : await fetch(`/api/folders/${dialog.folder.id}`, {
              method: "PATCH",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ name: trimmed }),
            });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? "요청에 실패했습니다.");
      toast.success(
        dialog.mode === "create"
          ? "폴더를 만들었습니다."
          : "폴더 이름을 변경했습니다.",
      );
      onDone();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "요청에 실패했습니다.");
    } finally {
      setBusy(false);
    }
  }

  async function submitDelete() {
    if (dialog.mode !== "delete") return;
    setBusy(true);
    try {
      const res = await fetch(`/api/folders/${dialog.folder.id}`, {
        method: "DELETE",
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? "삭제에 실패했습니다.");
      toast.success("폴더를 삭제했습니다.");
      onDone();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "삭제에 실패했습니다.");
    } finally {
      setBusy(false);
    }
  }

  const isDelete = dialog.mode === "delete";
  const title =
    dialog.mode === "create"
      ? dialog.parentName
        ? `'${dialog.parentName}' 하위 폴더 추가`
        : "새 폴더"
      : dialog.mode === "rename"
        ? "폴더 이름 변경"
        : "폴더 삭제";

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          {isDelete ? (
            <DialogDescription>
              &lsquo;{dialog.folder.name}&rsquo; 폴더를 삭제할까요? 폴더 안에
              문서나 하위 폴더가 있으면 삭제할 수 없습니다.
            </DialogDescription>
          ) : (
            <DialogDescription>폴더 이름을 입력해 주세요.</DialogDescription>
          )}
        </DialogHeader>

        {!isDelete ? (
          <div className="space-y-1.5">
            <Label htmlFor="folder-name">폴더 이름</Label>
            <Input
              id="folder-name"
              autoFocus
              value={name}
              onChange={(e) => setName(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && !busy) submitCreateOrRename();
              }}
              placeholder="예: 주요 거래처"
            />
          </div>
        ) : null}

        <DialogFooter>
          <Button variant="outline" onClick={onClose} disabled={busy}>
            취소
          </Button>
          {isDelete ? (
            <Button variant="destructive" onClick={submitDelete} disabled={busy}>
              삭제
            </Button>
          ) : (
            <Button onClick={submitCreateOrRename} disabled={busy}>
              {dialog.mode === "create" ? "만들기" : "저장"}
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
