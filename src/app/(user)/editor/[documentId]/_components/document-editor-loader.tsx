"use client";

import dynamic from "next/dynamic";
import type { EditorDoc } from "@/lib/editor-schema";

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
}) {
  return <DocumentEditor {...props} />;
}
