"use client";

import { useState, type ReactNode } from "react";
import { DocumentPreviewDialog } from "@/components/document/document-preview-dialog";

/**
 * 이력 한 줄에 붙는 문서 — 눌러도 편집 화면으로 가지 않고 **미리보기 팝업**을 연다
 * (3차 피드백 2).
 *
 * 이력을 훑는 중에 알고 싶은 것은 "그때 그 문서가 무엇이었나" 이지 "고치겠다" 가 아니다.
 * 편집 화면으로 바로 넘기면 상세에서 하던 일이 끊기고 되돌아와야 한다 — 편집으로 가는 길은
 * 미리보기 안의 `편집 바로가기` 에 그대로 있다.
 *
 * 미리보기는 예상 금액 옆·연관 문서 목록과 **같은 컴포넌트**를 쓴다. 경로마다 다른 미리보기가
 * 뜨면 같은 문서가 어디서 눌렀는지에 따라 달라 보인다.
 *
 * 이력 목록 자체는 서버 컴포넌트다 — 상호작용이 생기는 이 한 줄만 클라이언트로 내려간다.
 */
export function TimelineDocumentButton({
  documentId,
  title,
  children,
}: {
  documentId: string;
  /** 팝업 제목에 쓰는 문서 제목 */
  title: string;
  /** 서버에서 렌더한 요약(아이콘·제목·종류·금액) */
  children: ReactNode;
}) {
  const [isOpen, setIsOpen] = useState(false);

  return (
    <>
      <button
        type="button"
        onClick={() => setIsOpen(true)}
        className="mt-1 inline-flex max-w-full items-center gap-1.5 rounded text-xs font-medium text-primary transition-colors hover:underline focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
      >
        {children}
        <span className="sr-only"> — 미리보기 열기</span>
      </button>

      <DocumentPreviewDialog
        id={documentId}
        title={title}
        open={isOpen}
        onOpenChange={setIsOpen}
      />
    </>
  );
}
