"use client";

import Link from "next/link";
import {
  Send,
  Save,
  Eye,
  Download,
  Plus,
  Minus,
  Undo2,
  Redo2,
  AlertTriangle,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { AiReviseDialog } from "./ai-revise-dialog";
import type { AiModelOption } from "@/lib/ai/models";

type Props = {
  /** 문서일 때만 있다 — 없으면(표준 양식) 발송·AI 재작성을 감춘다 */
  documentId: string | null;
  /** 본문이 잠긴 문서면 편집 도구를 감춘다 — 미리보기·발송은 남긴다 (진단 3) */
  locked: boolean;
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
  /** 내용이 잘린 블록 수 (진단 4) — 0 이면 표시하지 않는다 */
  clippedCount: number;
  onFitAll: () => void;
  /** 확대 배율 (진단 5) */
  zoom: number | "fit";
  onZoomChange: (zoom: number | "fit") => void;
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
  locked,
  dirty,
  saving,
  onSave,
  canUndo,
  canRedo,
  onUndo,
  onRedo,
  clippedCount,
  onFitAll,
  zoom,
  onZoomChange,
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
    // 버튼이 늘어나 1280 폭에서 저장·발송이 잘렸다 — 넘치면 다음 줄로 내린다.
    // 오른쪽 묶음(저장·발송)이 항상 보여야 하므로 flex-1 스페이서 앞뒤로 나눠 감싼다.
    <div className="flex w-full flex-wrap items-center gap-x-2 gap-y-2">
      {/* 되돌리기·다시 실행 (진단 2) — 편집이 막힌 문서에서는 쓸 일이 없다 */}
      {locked ? null : (
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
      )}

      {/* 페이지 컨트롤 (#8) */}
      {locked ? null : (
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
      )}

      {/* 확대/축소 — 794px 캔버스가 노트북 폭에 안 들어가 가로 스크롤이 걸렸다 */}
      <select
        aria-label="확대 배율"
        className="h-9 shrink-0 rounded-md border bg-background px-2 text-sm"
        value={zoom === "fit" ? "fit" : String(zoom)}
        onChange={(e) =>
          onZoomChange(e.target.value === "fit" ? "fit" : Number(e.target.value))
        }
      >
        <option value="fit">폭 맞춤</option>
        <option value="0.5">50%</option>
        <option value="0.75">75%</option>
        <option value="1">100%</option>
        <option value="1.5">150%</option>
      </select>

      <Button variant="outline" onClick={onPreview} className="shrink-0">
        <Eye className="size-4" />
        미리보기
      </Button>

      {/*
        PDF 다운로드 (F-223) — 발송 첨부와 **같은 재료·같은 렌더러**를 쓰는 라우트다
        (`@/lib/document-render` → `@/lib/pdf`). 그래서 여기서 내려받아 확인한 파일이
        고객에게 첨부되는 파일과 같다.
        **표준 양식에는 두지 않는다** — 양식은 값이 빈 껍데기라 "문서 PDF" 라는 개념이 없다.
        `<a download>` 이 아니라 그냥 링크다: 파일명은 서버가 `Content-Disposition` 으로
        정하므로(한글 파일명 `filename*` 포함) 화면이 다시 정할 이유가 없다.
        저장하지 않은 편집은 담기지 않는다 — 서버가 저장된 `contentJson` 을 렌더한다.
      */}
      {documentId ? (
        <Button asChild variant="outline" className="shrink-0">
          <a href={`/api/documents/${documentId}/pdf`}>
            <Download className="size-4" />
            PDF 다운로드
          </a>
        </Button>
      ) : null}

      {/* AI 부분 재작성 (F-215) — 결과는 새 버전으로 저장된다 (문서 전용) */}
      {locked || !documentId ? null : (
      <AiReviseDialog
        documentId={documentId}
        getContentJson={getContentJson}
        onRevised={onRevised}
        models={models}
        defaultModel={defaultModel}
        mockProvider={mockProvider}
      />
      )}

      {/* 잘린 블록 안내 — 자동으로 늘리지 않고(겹침이 된다) 한 번에 맞출 길만 준다 */}
      {clippedCount > 0 && !locked ? (
        <Button
          variant="outline"
          onClick={onFitAll}
          className="shrink-0 border-amber-500/60 text-amber-900 hover:bg-amber-50 dark:text-amber-100"
        >
          <AlertTriangle className="size-4" />
          잘린 블록 {clippedCount}개 · 모두 맞추기
        </Button>
      ) : null}

      <div className="flex-1" />

      {dirty && !locked ? (
        <span
          className="size-2 shrink-0 rounded-full bg-amber-500"
          title="저장되지 않은 변경사항"
          aria-label="저장되지 않은 변경사항"
        />
      ) : null}
      {locked ? null : (
        <Button
          onClick={onSave}
          disabled={saving || !dirty}
          className="shrink-0"
        >
          <Save className="size-4" />
          {saving ? "저장 중…" : "저장"}
        </Button>
      )}
      {/* 발송은 문서에만 있다 — 양식은 발송 대상이 아니다 */}
      {documentId ? (
        <Button asChild variant="outline" className="shrink-0">
          <Link href={`/sender/${documentId}`}>
            <Send className="size-4" />
            발송하기
          </Link>
        </Button>
      ) : null}
    </div>
  );
}
