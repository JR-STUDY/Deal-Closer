/**
 * AI 부분 재작성 (PRD F-215) — "결제조건을 30일로 변경" 같은 자연어 수정 요청.
 *
 * 전체 재생성이 아니라 블록 단위 diff 를 받아 적용하므로 사용자가 손으로 고친
 * 다른 부분은 그대로 남는다. 결과는 새 버전 문서로 저장한다(F-214).
 */

import "server-only";
import type { EditorDoc } from "@/lib/editor-schema";
import { AI_MODEL_GENERATE } from "./config";
import { callStructured } from "./invoke";
import { docTotal, extractItemRows, type SpecItem } from "./doc-spec";
import { describeEditorDocWithIds } from "./describe";
import { buildReviseContent, SYSTEM_REVISE } from "./prompts";
import {
  applyRevision,
  parseRevisionSpec,
  REVISION_SPEC_SCHEMA,
  type RevisionSpec,
} from "./revision-spec";
import { documentDate } from "./today";

export type ReviseDocumentResult = {
  spec: RevisionSpec;
  editorDoc: EditorDoc;
  contentJson: string;
  amount: number;
  /** 수정 후 본문에서 도출한 품목 행 (DocumentItem 동기화용) */
  items: SpecItem[];
  /** 실제로 바뀐 내용이 있는지 (false 면 새 버전을 만들 필요가 없다) */
  changed: boolean;
  summary: string;
  model: string;
  usage: { inputTokens: number; outputTokens: number; cacheReadInputTokens: number };
};

export async function reviseDocument(input: {
  instruction: string;
  documentTitle: string;
  documentType: string;
  doc: EditorDoc;
}): Promise<ReviseDocumentResult> {
  const result = await callStructured({
    model: AI_MODEL_GENERATE,
    system: SYSTEM_REVISE,
    content: buildReviseContent({
      instruction: input.instruction,
      documentTitle: input.documentTitle,
      documentType: input.documentType,
      blockOutline: describeEditorDocWithIds(input.doc),
      today: documentDate(),
    }),
    schema: REVISION_SPEC_SCHEMA,
  });

  const spec = parseRevisionSpec(result.value);
  const applied = applyRevision(input.doc, spec);

  return {
    spec,
    editorDoc: applied.doc,
    contentJson: JSON.stringify(applied.doc),
    amount: docTotal(applied.doc),
    items: extractItemRows(applied.doc),
    changed: applied.changed,
    summary: spec.summary,
    model: result.model,
    usage: result.usage,
  };
}
