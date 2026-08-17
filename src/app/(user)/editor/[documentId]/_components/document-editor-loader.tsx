"use client";

import dynamic from "next/dynamic";
import type { EditorDoc, CatalogOption } from "@/lib/editor-schema";
import type { AiModelOption } from "@/lib/ai/models";
import type { DocumentEditLock } from "@/lib/document-edit";

// 무거운 클라이언트 에디터(react-rnd 포함)를 동적 로드한다 (REACT_BEST_PRACTICES: bundle-dynamic-imports).
// 서버 컴포넌트(page.tsx)에서는 ssr:false 를 쓸 수 없어 이 클라이언트 경계에서 로드한다.
const DocumentEditor = dynamic(
  () => import("./document-editor").then((m) => m.DocumentEditor),
  {
    ssr: false,
    loading: () => (
      <div className="flex flex-1 items-center justify-center text-sm text-muted-foreground">
        에디터를 불러오는 중입니다…
      </div>
    ),
  },
);

export function DocumentEditorLoader(props: {
  documentId: string;
  initialTitle: string;
  initialStatus: string;
  initialDoc: EditorDoc;
  /** 저장된 Document.amount — 저장 시 금액이 0 으로 떨어지는지 판단하는 기준 */
  initialAmount: number;
  catalog: CatalogOption[];
  version: number;
  isConfirmed: boolean;
  /** 본문 편집 잠금 (발송·계약완료·확정본·폐기) — 서버 PATCH 와 같은 판정 */
  lock: DocumentEditLock;
  /** 선택 가능한 AI 모델 (AI 부분 재작성용) */
  models: AiModelOption[];
  defaultModel: string;
  mockProvider: boolean;
}) {
  return <DocumentEditor {...props} />;
}
