"use client";

import { useState } from "react";
import { FileText } from "lucide-react";
import { DocumentPreviewDialog } from "@/components/document/document-preview-dialog";
import { DocTypeBadge, StatusBadge } from "@/components/status-badge";
import { formatDate, formatKRW } from "@/lib/format";

/**
 * 거래처의 문서 목록 (F-103).
 *
 * 문서를 누르면 편집 화면으로 가지 않고 **미리보기 팝업**이 뜬다 (3차 피드백 2) —
 * 기회 상세의 연관 문서·이력과 **같은 컴포넌트**를 쓴다. 여기서 문서를 누르는 이유는
 * 대개 "무슨 문서인지 확인" 이고, 고칠 때는 팝업의 `편집 바로가기` 로 넘어간다.
 *
 * 제목은 링크가 아니라 버튼이지만 Tab 으로 닿고 Enter·Space 로 열린다 (정책 ACC_*).
 * 이 목록은 행 전체 클릭(RowLink)을 쓰지 않으므로 덮개와 부딪히지 않는다.
 */

export type RelatedDocument = {
  id: string;
  title: string;
  type: string;
  status: string;
  /** 총액 (KRW 정수) */
  amount: number;
  /** ISO 8601 — 서버 컴포넌트가 직렬화해 넘긴다 (Date 를 그대로 넘기지 않는다) */
  createdAt: string;
};

export function AccountDocumentList({
  documents,
}: {
  documents: RelatedDocument[];
}) {
  const [preview, setPreview] = useState<RelatedDocument | null>(null);

  if (documents.length === 0) {
    return (
      <p className="rounded-md border border-dashed p-8 text-center text-sm text-muted-foreground">
        이 거래처의 기회에 연결된 문서가 아직 없습니다. 기회에서 문서를 만들면
        여기에 모입니다.
      </p>
    );
  }

  return (
    <>
      <ul className="divide-y rounded-md border">
        {documents.map((document) => (
          <li
            key={document.id}
            className="flex items-center justify-between gap-4 p-4"
          >
            <div className="min-w-0">
              <button
                type="button"
                onClick={() => setPreview(document)}
                className="flex min-w-0 max-w-full items-center gap-1.5 rounded text-left font-medium transition-colors hover:text-primary hover:underline focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
              >
                <FileText
                  className="size-4 shrink-0 text-muted-foreground"
                  aria-hidden="true"
                />
                <span className="truncate">{document.title}</span>
                <span className="sr-only"> — 미리보기 열기</span>
              </button>
              <p className="mt-0.5 text-xs text-muted-foreground">
                {formatDate(document.createdAt)} 생성
              </p>
            </div>
            <div className="flex shrink-0 items-center gap-2">
              <span className="text-sm font-medium tabular-nums">
                {formatKRW(document.amount)}
              </span>
              <DocTypeBadge type={document.type} />
              <StatusBadge status={document.status} />
            </div>
          </li>
        ))}
      </ul>

      {preview ? (
        <DocumentPreviewDialog

          id={preview.id}
          title={preview.title}
          open
          onOpenChange={(open) => {
            if (!open) setPreview(null);
          }}
        />
      ) : null}
    </>
  );
}
