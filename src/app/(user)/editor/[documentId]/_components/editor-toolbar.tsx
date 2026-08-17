"use client";

import Link from "next/link";
import { Send, Save, Eye, Plus, Minus, Undo2, Redo2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { AiReviseDialog } from "./ai-revise-dialog";
import type { AiModelOption } from "@/lib/ai/models";

type Props = {
  documentId: string;
  /** 선택 가능한 AI 모델 (AI 부분 재작성용) */
  models: AiModelOption[];
  defaultModel: string;
  mockProvider: boolean;
  dirty: boolean;
  saving: boolean;
  onSave: () => void;
  /** 되돌리기·다시 실행 — 키보드만 쓰는 사용자를 위해 버튼도 반드시 둔다 (ACC_*) */
  canUndo: boolean;
  canRedo: boolean;
  onUndo: () => void;
  onRedo: () => void;
  pages: number;
  onAddPage: () => void;
  onRemovePage: () => void;
  onPreview: () => void;
  /** 편집 중인 현재 본문 (AI 부분 재작성 입력) */
  getContentJson: () => string;
  /** AI 재작성으로 새 버전이 생겼을 때 이동 처리 */
  onRevised: (documentId: string) => void;
};

export function EditorToolbar({
  documentId,
  dirty,
  saving,
  onSave,
  canUndo,
  canRedo,
  onUndo,
  onRedo,
  pages,
  onAddPage,
  onRemovePage,
  onPreview,
  getContentJson,
  onRevised,
  models,
  defaultModel,
  mockProvider,
}: Props) {
  return (
    <div className="flex w-full items-center gap-2">
      {/* 되돌리기·다시 실행 (진단 2) */}
      <div className="flex shrink-0 items-center gap-0.5 rounded-md border px-1">
        <Button
          variant="ghost"
          size="icon"
          className="size-7"
          aria-label="되돌리기"
          title="되돌리기 (⌘Z)"
          onClick={onUndo}
          disabled={!canUndo}
        >
          <Undo2 className="size-4" />
        </Button>
        <Button
          variant="ghost"
          size="icon"
          className="size-7"
          aria-label="다시 실행"
          title="다시 실행 (⌘⇧Z)"
          onClick={onRedo}
          disabled={!canRedo}
        >
          <Redo2 className="size-4" />
        </Button>
      </div>

      {/* 페이지 컨트롤 (#8) */}
      <div className="flex shrink-0 items-center gap-0.5 rounded-md border px-1">
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

      <Button variant="outline" onClick={onPreview} className="shrink-0">
        <Eye className="size-4" />
        미리보기
      </Button>

      {/* AI 부분 재작성 (F-215) — 결과는 새 버전으로 저장된다 */}
      <AiReviseDialog
        documentId={documentId}
        getContentJson={getContentJson}
        onRevised={onRevised}
        models={models}
        defaultModel={defaultModel}
        mockProvider={mockProvider}
      />


      <div className="flex-1" />

      {dirty ? (
        <span
          className="size-2 shrink-0 rounded-full bg-amber-500"
          title="저장되지 않은 변경사항"
          aria-label="저장되지 않은 변경사항"
        />
      ) : null}
      <Button
        onClick={onSave}
        disabled={saving || !dirty}
        className="shrink-0"
      >
        <Save className="size-4" />
        {saving ? "저장 중…" : "저장"}
      </Button>
      <Button asChild variant="outline" className="shrink-0">
        <Link href={`/sender/${documentId}`}>
          <Send className="size-4" />
          발송하기
        </Link>
      </Button>
    </div>
  );
}
