"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { MoreVertical, FolderInput, Users, User, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

type FolderOption = { id: string; name: string };

type Props = {
  documentId: string;
  documentTitle: string;
  isCommon: boolean;
  currentFolderId: string | null;
  /** 현재 문서함(내/공용)의 폴더 목록 */
  folders: FolderOption[];
};

const UNFILED = "__none__";

export function DocumentCardActions({
  documentId,
  documentTitle,
  isCommon,
  currentFolderId,
  folders,
}: Props) {
  const router = useRouter();
  const [moveOpen, setMoveOpen] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [target, setTarget] = useState<string>(currentFolderId ?? UNFILED);
  const [busy, setBusy] = useState(false);

  async function move() {
    setBusy(true);
    try {
      const res = await fetch(`/api/documents/${documentId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ folderId: target === UNFILED ? null : target }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? "이동에 실패했습니다.");
      toast.success("문서를 이동했습니다.");
      setMoveOpen(false);
      router.refresh();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "이동에 실패했습니다.");
    } finally {
      setBusy(false);
    }
  }

  async function remove() {
    setBusy(true);
    try {
      const res = await fetch(`/api/documents/${documentId}`, {
        method: "DELETE",
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? "삭제에 실패했습니다.");
      toast.success("문서를 삭제했습니다.");
      setDeleteOpen(false);
      router.refresh();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "삭제에 실패했습니다.");
    } finally {
      setBusy(false);
    }
  }

  async function toggleCommon() {
    try {
      const res = await fetch(`/api/documents/${documentId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        // 문서함을 옮기면 기존 폴더 소속은 해제한다(폴더는 문서함에 종속).
        body: JSON.stringify({ isCommon: !isCommon, folderId: null }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? "요청에 실패했습니다.");
      toast.success(
        isCommon ? "내 문서함으로 옮겼습니다." : "공용문서함으로 옮겼습니다.",
      );
      router.refresh();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "요청에 실패했습니다.");
    }
  }

  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button
            variant="ghost"
            size="icon"
            className="size-8"
            aria-label={`${documentTitle} 문서 메뉴`}
          >
            <MoreVertical className="size-4" />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end">
          <DropdownMenuItem
            onClick={() => {
              setTarget(currentFolderId ?? UNFILED);
              setMoveOpen(true);
            }}
          >
            <FolderInput className="size-4" />
            폴더 이동
          </DropdownMenuItem>
          <DropdownMenuItem onClick={toggleCommon}>
            {isCommon ? (
              <>
                <User className="size-4" />
                내 문서함으로 이동
              </>
            ) : (
              <>
                <Users className="size-4" />
                공용문서함으로 이동
              </>
            )}
          </DropdownMenuItem>
          <DropdownMenuItem
            variant="destructive"
            onClick={() => setDeleteOpen(true)}
          >
            <Trash2 className="size-4" />
            삭제
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>

      <Dialog open={moveOpen} onOpenChange={setMoveOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>폴더 이동</DialogTitle>
            <DialogDescription className="line-clamp-2">
              &lsquo;{documentTitle}&rsquo; 문서를 옮길 폴더를 선택해 주세요.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-1.5">
            <Label htmlFor="move-folder">폴더</Label>
            <Select value={target} onValueChange={setTarget}>
              <SelectTrigger id="move-folder" className="w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={UNFILED}>미분류 (폴더 없음)</SelectItem>
                {folders.map((f) => (
                  <SelectItem key={f.id} value={f.id}>
                    {f.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setMoveOpen(false)}
              disabled={busy}
            >
              취소
            </Button>
            <Button onClick={move} disabled={busy}>
              이동
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={deleteOpen} onOpenChange={setDeleteOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>문서 삭제</DialogTitle>
            <DialogDescription className="line-clamp-2">
              &lsquo;{documentTitle}&rsquo; 문서를 삭제할까요? 삭제한 문서는 복구할
              수 없습니다.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setDeleteOpen(false)}
              disabled={busy}
            >
              취소
            </Button>
            <Button variant="destructive" onClick={remove} disabled={busy}>
              삭제
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
