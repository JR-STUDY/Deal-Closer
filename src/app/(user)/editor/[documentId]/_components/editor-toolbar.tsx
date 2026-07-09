"use client";

import Link from "next/link";
import { Send, Save, Eye, Plus, Minus } from "lucide-react";
import { Button } from "@/components/ui/button";

type Props = {
  documentId: string;
  dirty: boolean;
  saving: boolean;
  onSave: () => void;
  pages: number;
  onAddPage: () => void;
  onRemovePage: () => void;
  onPreview: () => void;
};

export function EditorToolbar({
  documentId,
  dirty,
  saving,
  onSave,
  pages,
  onAddPage,
  onRemovePage,
  onPreview,
}: Props) {
  return (
    <div className="flex items-center gap-2">
      {/* 페이지 컨트롤 (#8) */}
      <div className="flex items-center gap-0.5 rounded-md border px-1">
        <Button
          variant="ghost"
          size="icon"
          className="size-7"
          aria-label="페이지 삭제"
          onClick={onRemovePage}
          disabled={pages <= 1}
        >
          <Minus className="size-4" />
        </Button>
        <span className="min-w-14 text-center text-xs tabular-nums">
          {pages}페이지
        </span>
        <Button
          variant="ghost"
          size="icon"
          className="size-7"
          aria-label="페이지 추가"
          onClick={onAddPage}
        >
          <Plus className="size-4" />
        </Button>
      </div>

      <Button variant="outline" onClick={onPreview}>
        <Eye className="size-4" />
        미리보기
      </Button>

      {dirty ? (
        <span className="text-xs text-muted-foreground">
          저장되지 않은 변경사항
        </span>
      ) : null}
      <Button onClick={onSave} disabled={saving || !dirty}>
        <Save className="size-4" />
        {saving ? "저장 중…" : "저장"}
      </Button>
      <Button asChild variant="outline">
        <Link href={`/sender/${documentId}`}>
          <Send className="size-4" />
          발송하기
        </Link>
      </Button>
    </div>
  );
}
