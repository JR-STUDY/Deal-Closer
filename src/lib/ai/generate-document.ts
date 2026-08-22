/**
 * AI 문서 초안 생성 (PRD F-212 · F-213).
 *
 * 흐름: 프롬프트 조립 → Claude 구조화 출력(DocSpec) → 에디터 문서(EditorDoc) 조립 → 총액 재계산.
 * 총액은 항상 서버가 수량×단가로 다시 계산한다 (모델이 계산한 값은 신뢰하지 않는다).
 */

import "server-only";
import { parseContentJson, type EditorDoc } from "@/lib/editor-schema";
import type { DocumentType } from "@/lib/constants";
import { AI_MODEL_GENERATE } from "./config";
import { callStructured } from "./invoke";
import {
  DOC_SPEC_SCHEMA,
  docTotal,
  extractItemRows,
  parseDocSpec,
  specToEditorDoc,
  type DocSpec,
  type SpecItem,
} from "./doc-spec";
import { buildGenerateContent, SYSTEM_GENERATE, type GenerateContentInput } from "./prompts";
import { documentDate } from "./today";

export type GenerateDocumentInput = Omit<GenerateContentInput, "today"> & {
  /** 사용자가 UI 에서 고른 모델. 없으면 기본값(AI_MODEL_GENERATE) */
  model?: string | null;
};

export type GeneratedDocument = {
  spec: DocSpec;
  editorDoc: EditorDoc;
  contentJson: string;
  /** 서버가 재계산한 총액 (KRW 정수) */
  amount: number;
  /** 최종 본문에서 도출한 품목 행 (DocumentItem 동기화용) */
  items: SpecItem[];
  title: string;
  clientName: string | null;
  documentType: DocumentType;
  /** 사용자에게 보여줄 생성 요약 */
  summary: string;
  model: string;
  usage: { inputTokens: number; outputTokens: number; cacheReadInputTokens: number };
};

export async function generateDocument(
  input: GenerateDocumentInput,
): Promise<GeneratedDocument> {
  const result = await callStructured({
    model: input.model?.trim() || AI_MODEL_GENERATE,
    system: SYSTEM_GENERATE,
    content: buildGenerateContent({ ...input, today: documentDate() }),
    schema: DOC_SPEC_SCHEMA,
    schemaName: "document_spec",
  });

  const spec = parseDocSpec(result.value, input.documentType ?? "QUOTE");

  // 양식 본문이 있으면 그 레이아웃을 베이스로 값만 채운다 (F-212)
  const base = parseContentJson(input.template?.contentJson);
  /*
   * 회사 정보는 프롬프트(무엇을 쓸지)와 조립(어디에 넣을지)이 **같은 값**을 봐야 한다 —
   * 갈라지면 "AI 에게 준 공급자" 와 "문서에 박힌 공급자" 가 달라진다.
   */
  const editorDoc = specToEditorDoc(spec, { base, company: input.company });

  return {
    spec,
    editorDoc,
    contentJson: JSON.stringify(editorDoc),
    amount: docTotal(editorDoc),
    items: extractItemRows(editorDoc),
    title: spec.title,
    clientName: spec.clientName || input.client?.name?.trim() || null,
    documentType: spec.documentType,
    summary: spec.summary,
    model: result.model,
    usage: result.usage,
  };
}
