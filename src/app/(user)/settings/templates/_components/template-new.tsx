"use client";

import { useRouter } from "next/navigation";
import { TemplateEditor } from "./template-editor";

/** 새 메일 템플릿 생성 (전체 화면) — 저장하면 상세로, 취소하면 목록으로 이동. */
export function TemplateNew() {
  const router = useRouter();
  return (
    <TemplateEditor
      initial={{ name: "", subject: "", body: "", shared: false }}
      onSaved={(saved) => {
        router.push(`/settings/templates/${saved.id}`);
        router.refresh();
      }}
      onCancel={() => router.push("/settings/templates")}
    />
  );
}
