"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Sparkles, MoreVertical, Trash2, FilePlus2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
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
import { DOCUMENT_TYPES, DOCUMENT_TYPE_LABELS, type DocumentType } from "@/lib/constants";

/** 템플릿 카드 액션 — 새 문서 생성 / 삭제 */
export function TemplateCardActions({
  templateId,
  templateTitle,
}: {
  templateId: string;
  templateTitle: string;
}) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [confirmOpen, setConfirmOpen] = useState(false);

  async function instantiate() {
    setBusy(true);
    try {
      const res = await fetch(`/api/templates/${templateId}/instantiate`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({}),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? "생성에 실패했습니다.");
      toast.success("템플릿으로 새 문서를 만들었습니다.");
      router.push(`/editor/${json.data.id}`);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "생성에 실패했습니다.");
      setBusy(false);
    }
  }

  async function remove() {
    setBusy(true);
    try {
      const res = await fetch(`/api/templates/${templateId}`, {
        method: "DELETE",
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? "삭제에 실패했습니다.");
      toast.success("템플릿을 삭제했습니다.");
      setConfirmOpen(false);
      router.refresh();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "삭제에 실패했습니다.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <Button size="sm" className="flex-1" onClick={instantiate} disabled={busy}>
        <Sparkles className="size-3.5" />이 템플릿으로 새 문서
      </Button>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button
            variant="outline"
            size="icon"
            className="size-8"
            aria-label={`${templateTitle} 템플릿 메뉴`}
          >
            <MoreVertical className="size-4" />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end">
          <DropdownMenuItem
            variant="destructive"
            onClick={() => setConfirmOpen(true)}
          >
            <Trash2 className="size-4" />
            삭제
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>

      <Dialog open={confirmOpen} onOpenChange={setConfirmOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>템플릿 삭제</DialogTitle>
            <DialogDescription className="line-clamp-2">
              &lsquo;{templateTitle}&rsquo; 템플릿을 삭제할까요? 이미 만든 문서에는
              영향을 주지 않습니다.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setConfirmOpen(false)}
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

/** 빈 베이스 템플릿을 새로 만드는 버튼 + 다이얼로그 */
export function NewTemplateButton() {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [title, setTitle] = useState("");
  const [type, setType] = useState<DocumentType>("QUOTE");
  const [description, setDescription] = useState("");
  const [busy, setBusy] = useState(false);

  async function create() {
    if (!title.trim()) {
      toast.error("템플릿 제목을 입력해 주세요.");
      return;
    }
    setBusy(true);
    try {
      const res = await fetch("/api/templates", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ title: title.trim(), type, description }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? "생성에 실패했습니다.");
      toast.success("베이스 템플릿을 만들었습니다.");
      setOpen(false);
      setTitle("");
      setDescription("");
      setType("QUOTE");
      router.refresh();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "생성에 실패했습니다.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <Button onClick={() => setOpen(true)}>
        <FilePlus2 className="size-4" />새 템플릿
      </Button>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>새 베이스 템플릿</DialogTitle>
          <DialogDescription>
            자주 쓰는 문서를 표준 양식으로 등록해 두면 새 문서를 빠르게 만들 수
            있습니다.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-3">
          <div className="space-y-1.5">
            <Label htmlFor="tpl-title">제목</Label>
            <Input
              id="tpl-title"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="예: 표준 IT 구축 견적서"
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="tpl-type">문서 종류</Label>
            <Select value={type} onValueChange={(v) => setType(v as DocumentType)}>
              <SelectTrigger id="tpl-type" className="w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {DOCUMENT_TYPES.map((t) => (
                  <SelectItem key={t} value={t}>
                    {DOCUMENT_TYPE_LABELS[t]}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="tpl-desc">설명 (선택)</Label>
            <Textarea
              id="tpl-desc"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="언제 쓰는 템플릿인지 간단히 적어 주세요."
              rows={3}
            />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => setOpen(false)} disabled={busy}>
            취소
          </Button>
          <Button onClick={create} disabled={busy}>
            만들기
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
