/**
 * 표준 양식 AI 세팅 (PRD F-203) + 변수 필드 정의 (F-204).
 *
 * 업로드한 기존 양식(PDF·이미지·엑셀·CSV)과 자연어 지시를 Claude 에 함께 넣어
 * ① 재사용 가능한 양식 본문(EditorDoc)과 ② 변수 필드 목록을 한 번에 받는다.
 * 변수 목록만 다시 뽑는 경로는 경량 모델(AI_MODEL_BATCH)로 분리한다.
 */

import "server-only";
import type { EditorDoc } from "@/lib/editor-schema";
import type { DocumentType } from "@/lib/constants";
import { AI_MODEL_BATCH, AI_MODEL_GENERATE } from "./config";
import { callStructured } from "./invoke";
import {
  TEMPLATE_SPEC_SCHEMA,
  VARIABLES_SCHEMA,
  parseTemplateSpec,
  parseVariables,
  specToEditorDoc,
  type SpecVariable,
  type TemplateSpec,
} from "./doc-spec";
import {
  buildTemplateSetupContent,
  buildVariablesContent,
  SYSTEM_TEMPLATE_SETUP,
  SYSTEM_VARIABLES,
  type TemplateSetupContentInput,
} from "./prompts";
import { documentDate } from "./today";

export type SetupTemplateInput = Omit<TemplateSetupContentInput, "today"> & {
  /** 사용자가 UI 에서 고른 모델. 없으면 기본값(AI_MODEL_GENERATE) */
  model?: string | null;
};

export type SetupTemplateResult = {
  spec: TemplateSpec;
  editorDoc: EditorDoc;
  contentJson: string;
  documentType: DocumentType;
  variables: SpecVariable[];
  summary: string;
  model: string;
  usage: { inputTokens: number; outputTokens: number; cacheReadInputTokens: number };
};

/** 업로드 양식 + 프롬프트 → 표준 문서 세팅 (F-203 · F-204) */
export async function setupTemplate(
  input: SetupTemplateInput,
): Promise<SetupTemplateResult> {
  const result = await callStructured({
    model: input.model?.trim() || AI_MODEL_GENERATE,
    system: SYSTEM_TEMPLATE_SETUP,
    content: buildTemplateSetupContent({ ...input, today: documentDate() }),
    schema: TEMPLATE_SPEC_SCHEMA,
    schemaName: "template_spec",
  });

  const spec = parseTemplateSpec(result.value, input.documentType ?? "QUOTE");
  // 양식은 항상 새로 조립한다 (베이스가 될 기존 양식이 없다)
  const editorDoc = specToEditorDoc(spec, { base: null, company: input.company });

  return {
    spec,
    editorDoc,
    contentJson: JSON.stringify(editorDoc),
    documentType: spec.documentType,
    variables: spec.variables,
    summary: spec.summary,
    model: result.model,
    usage: result.usage,
  };
}

/** 이미 세팅된 양식에서 변수 필드만 다시 추출한다 (F-204, 경량 모델) */
export async function extractTemplateVariables(input: {
  name: string;
  type: string;
  contentJson?: string | null;
}): Promise<{ variables: SpecVariable[]; model: string }> {
  const result = await callStructured({
    model: AI_MODEL_BATCH,
    system: SYSTEM_VARIABLES,
    content: buildVariablesContent(input),
    schema: VARIABLES_SCHEMA,
    schemaName: "template_variables",
    effort: "medium",
    // 추론 토큰도 이 상한에 포함되므로 변수 목록(수백 토큰)보다 넉넉히 잡는다
    maxTokens: 12_000,
  });

  const value = (
    typeof result.value === "object" && result.value !== null ? result.value : {}
  ) as Record<string, unknown>;

  return { variables: parseVariables(value.variables), model: result.model };
}
