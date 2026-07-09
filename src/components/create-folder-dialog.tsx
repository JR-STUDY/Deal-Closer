"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { FolderPlus } from "lucide-react";
import { toast } from "sonner";
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
  DialogTrigger,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import type { SidebarFolder } from "@/components/sidebar-folders";

const ROOT_MINE = "__root_mine__";
const ROOT_COMMON = "__root_common__";

/** 폴더 트리를 문서함별로 펼쳐 깊이 들여쓴 옵션 목록으로 변환 */
function indentedOptions(folders: SidebarFolder[], isCommon: boolean) {
  const childrenOf = new Map<string | null, SidebarFolder[]>();
  for (const f of folders) {
    if (f.isCommon !== isCommon) continue;
    const list = childrenOf.get(f.parentId) ?? [];
    list.push(f);
    childrenOf.set(f.parentId, list);
  }
  const out: { id: string; name: string; depth: number }[] = [];
  const walk = (parentId: string | null, depth: number) => {
    for (const f of childrenOf.get(parentId) ?? []) {
      out.push({ id: f.id, name: f.name, depth });
      walk(f.id, depth + 1);
    }
  };
  walk(null, 0);
  return out;
}

/** '폴더 생성' 버튼 + 다이얼로그 — 상위(문서함 최상위/특정 폴더)를 골라 하위 폴더 생성 */
export function CreateFolderDialog({ folders }: { folders: SidebarFolder[] }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [parent, setParent] = useState<string>(ROOT_MINE);
  const [name, setName] = useState("");
  const [busy, setBusy] = useState(false);

  const mine = useMemo(() => indentedOptions(folders, false), [folders]);
  const common = useMemo(() => indentedOptions(folders, true), [folders]);

  async function create() {
    const trimmed = name.trim();
    if (!trimmed) {
      toast.error("폴더 이름을 입력해 주세요.");
      return;
    }
    const payload =
      parent === ROOT_MINE
        ? { name: trimmed, isCommon: false }
        : parent === ROOT_COMMON
          ? { name: trimmed, isCommon: true }
          : { name: trimmed, parentId: parent };

    setBusy(true);
    try {
      const res = await fetch("/api/folders", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? "폴더 생성에 실패했습니다.");
      toast.success("폴더를 만들었습니다.");
      setOpen(false);
      setName("");
      router.refresh();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "폴더 생성에 실패했습니다.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <button
          type="button"
          aria-label="폴더 생성"
          title="폴더 생성"
          className="flex size-6 shrink-0 items-center justify-center rounded text-muted-foreground transition-colors hover:bg-sidebar-accent/60 hover:text-sidebar-accent-foreground"
        >
          <FolderPlus className="size-4" />
        </button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>폴더 생성</DialogTitle>
          <DialogDescription>
            상위 위치를 선택하면 그 아래에 폴더가 생성됩니다. 폴더를 고르면 하위
            폴더가 만들어집니다.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-3">
          <div className="space-y-1.5">
            <Label htmlFor="folder-parent">상위 위치</Label>
            <Select value={parent} onValueChange={setParent}>
              <SelectTrigger id="folder-parent" className="w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={ROOT_MINE}>내 문서함 (최상위)</SelectItem>
                {mine.map((o) => (
                  <SelectItem key={o.id} value={o.id}>
                    {"  ".repeat(o.depth + 1)}
                    {o.name}
                  </SelectItem>
                ))}
                <SelectItem value={ROOT_COMMON}>공용문서함 (최상위)</SelectItem>
                {common.map((o) => (
                  <SelectItem key={o.id} value={o.id}>
                    {"  ".repeat(o.depth + 1)}
                    {o.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="folder-name">폴더 이름</Label>
            <Input
              id="folder-name"
              autoFocus
              value={name}
              onChange={(e) => setName(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && !busy) create();
              }}
              placeholder="예: A사 견적"
            />
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => setOpen(false)} disabled={busy}>
            취소
          </Button>
          <Button onClick={create} disabled={busy}>
            폴더 생성
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
