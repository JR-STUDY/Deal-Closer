"use client";

import { useState } from "react";
import { FolderOpen, Search, Check } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { DocTypeBadge } from "@/components/status-badge";
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { formatKRW, formatDate } from "@/lib/format";
import { MAX_REFERENCES } from "@/lib/constants";

/** 보관함 문서 선택용 최소 필드 (generator/page.tsx 에서 select 로 조회) */
export type LibraryDoc = {
  id: string;
  title: string;
  type: string;
  status: string;
  clientName: string | null;
  amount: number;
  createdAt: Date;
};

type DocumentPickerProps = {
  documents: LibraryDoc[];
  selectedIds: string[];
  onConfirm: (ids: string[]) => void;
  disabled?: boolean;
};

/** 문서 보관함에서 참고 문서를 다중 선택하는 다이얼로그 */
export function DocumentPicker({
  documents,
  selectedIds,
  onConfirm,
  disabled,
}: DocumentPickerProps) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [draft, setDraft] = useState<string[]>(selectedIds);

  // 다이얼로그를 열 때마다 현재 선택 상태로 초기화
  const handleOpenChange = (next: boolean) => {
    if (next) {
      setDraft(selectedIds);
      setQuery("");
    }
    setOpen(next);
  };

  const toggle = (id: string) => {
    setDraft((prev) => {
      if (prev.includes(id)) return prev.filter((x) => x !== id);
      if (prev.length >= MAX_REFERENCES) {
        toast.error(
          `참고 문서는 최대 ${MAX_REFERENCES}개까지 선택할 수 있습니다.`,
        );
        return prev;
      }
      return [...prev, id];
    });
  };

  const q = query.trim().toLowerCase();
  const filtered = q
    ? documents.filter(
        (d) =>
          d.title.toLowerCase().includes(q) ||
          (d.clientName ?? "").toLowerCase().includes(q),
      )
    : documents;

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogTrigger asChild>
        <Button
          type="button"
          variant="outline"
          className="w-full"
          disabled={disabled}
        >
          <FolderOpen className="size-4" />
          문서 보관함에서 가져오기
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>참고할 문서 선택</DialogTitle>
          <DialogDescription>
            보관함의 기존 문서를 선택하면 초안 생성 시 참고 자료로 사용됩니다.
            (최대 {MAX_REFERENCES}개)
          </DialogDescription>
        </DialogHeader>

        <div className="relative">
          <Search className="pointer-events-none absolute top-1/2 left-2.5 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="제목·거래처 검색"
            className="pl-8"
            aria-label="문서 검색"
          />
        </div>

        <ul className="max-h-72 space-y-1.5 overflow-y-auto">
          {filtered.length === 0 ? (
            <li className="py-8 text-center text-sm text-muted-foreground">
              문서가 없습니다.
            </li>
          ) : (
            filtered.map((doc) => {
              const checked = draft.includes(doc.id);
              return (
                <li key={doc.id}>
                  <button
                    type="button"
                    onClick={() => toggle(doc.id)}
                    aria-pressed={checked}
                    className={`flex min-h-11 w-full items-center gap-3 rounded-md border px-3 py-2 text-left transition-colors ${
                      checked
                        ? "border-primary bg-primary/5"
                        : "border-input hover:bg-muted/50"
                    }`}
                  >
                    <span
                      aria-hidden="true"
                      className={`flex size-5 shrink-0 items-center justify-center rounded border ${
                        checked
                          ? "border-primary bg-primary text-primary-foreground"
                          : "border-input"
                      }`}
                    >
                      {checked && <Check className="size-3.5" />}
                    </span>
                    <div className="min-w-0 flex-1">
                      <div className="truncate text-sm font-medium">
                        {doc.title}
                      </div>
                      <div className="mt-1 flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
                        <DocTypeBadge type={doc.type} />
                        {doc.clientName ? (
                          <span className="truncate">{doc.clientName}</span>
                        ) : null}
                        <span className="tabular-nums">
                          {formatKRW(doc.amount)}
                        </span>
                        <span className="tabular-nums">
                          {formatDate(doc.createdAt)}
                        </span>
                      </div>
                    </div>
                  </button>
                </li>
              );
            })
          )}
        </ul>

        <DialogFooter>
          <DialogClose asChild>
            <Button type="button" variant="outline">
              취소
            </Button>
          </DialogClose>
          <Button
            type="button"
            onClick={() => {
              onConfirm(draft);
              setOpen(false);
            }}
          >
            {draft.length > 0 ? `${draft.length}개 선택 완료` : "선택 완료"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
