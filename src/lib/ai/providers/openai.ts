/**
 * GPT(OpenAI Responses API) 어댑터 (서버 전용).
 *
 * Chat Completions 대신 Responses API 를 쓰는 이유:
 *  - PDF 를 base64(input_file)로 그대로 넣을 수 있다 (별도 파서 불필요)
 *  - 구조화 출력이 text.format.json_schema + strict 로 스키마에 고정된다
 *  - 시스템 프롬프트(instructions)가 프리픽스라 프롬프트 캐시가 자동 적용된다
 *    → 시스템 프롬프트에 가변값을 넣지 않는 규칙이 Claude 와 동일하게 유효하다
 */

import "server-only";
import OpenAI from "openai";
import { getOpenAI } from "../client";
import { AI_MAX_TOKENS, AiGenerationError, AiNotConfiguredError } from "../config";
import { dataUrl, type AiContentBlock } from "../blocks";
import type { StructuredCall, StructuredResult } from "../invoke";

/** json_schema 이름 제약: a-z A-Z 0-9 _ - (최대 64자) */
function safeSchemaName(name: string): string {
  const cleaned = name.replace(/[^a-zA-Z0-9_-]/g, "_").slice(0, 64);
  return cleaned || "result";
}

/** 중립 블록 → Responses API input content */
function toInputContent(
  blocks: AiContentBlock[],
): OpenAI.Responses.ResponseInputMessageContentList {
  return blocks.map((block) => {
    switch (block.type) {
      case "text":
        return { type: "input_text" as const, text: block.text };
      case "image":
        return {
          type: "input_image" as const,
          detail: "auto" as const,
          image_url: dataUrl(block.mediaType, block.dataBase64),
        };
      case "pdf":
        return {
          type: "input_file" as const,
          filename: block.fileName,
          file_data: dataUrl("application/pdf", block.dataBase64),
        };
    }
  });
}

/** 응답 output 에서 거절 사유를 찾는다 (있으면 문자열) */
function refusalOf(response: OpenAI.Responses.Response): string | null {
  for (const item of response.output) {
    if (item.type !== "message") continue;
    for (const part of item.content) {
      if (part.type === "refusal") return part.refusal;
    }
  }
  return null;
}

export async function callOpenAI(call: StructuredCall): Promise<StructuredResult> {
  const client = getOpenAI();

  let response: OpenAI.Responses.Response;
  try {
    response = await client.responses.create({
      model: call.model,
      instructions: call.system,
      input: [{ role: "user", content: toInputContent(call.content) }],
      text: {
        format: {
          type: "json_schema",
          name: safeSchemaName(call.schemaName ?? "result"),
          schema: call.schema,
          // 스키마 준수를 강제한다 (모든 object 에 additionalProperties:false + 전 필드 required 필요)
          strict: true,
        },
      },
      ...(call.effort ? { reasoning: { effort: call.effort } } : {}),
      max_output_tokens: call.maxTokens ?? AI_MAX_TOKENS,
    });
  } catch (error) {
    if (
      error instanceof OpenAI.AuthenticationError ||
      error instanceof OpenAI.PermissionDeniedError
    ) {
      throw new AiNotConfiguredError(
        "AI 연동 인증에 실패했습니다. OPENAI_API_KEY 를 확인해주세요.",
      );
    }
    if (error instanceof OpenAI.NotFoundError) {
      throw new AiNotConfiguredError(
        `모델 "${call.model}" 을 찾을 수 없습니다. AI_MODEL_GENERATE / AI_MODEL_BATCH 설정을 확인해주세요.`,
      );
    }
    if (error instanceof OpenAI.RateLimitError) {
      throw new AiGenerationError(
        "AI 요청이 일시적으로 몰렸습니다. 잠시 후 다시 시도해주세요.",
        error,
      );
    }
    if (error instanceof OpenAI.APIConnectionError) {
      throw new AiGenerationError("AI 서버에 연결하지 못했습니다.", error);
    }
    if (error instanceof OpenAI.APIError) {
      throw new AiGenerationError(
        `AI 호출이 실패했습니다. (${error.status ?? "network"})`,
        error,
      );
    }
    throw new AiGenerationError(undefined, error);
  }

  const refusal = refusalOf(response);
  if (refusal) {
    throw new AiGenerationError(
      "AI 가 이 요청의 생성을 거절했습니다. 요청 내용을 조정해 다시 시도해주세요.",
    );
  }

  if (response.status === "incomplete") {
    const reason = response.incomplete_details?.reason;
    throw new AiGenerationError(
      reason === "max_output_tokens"
        ? "생성 결과가 너무 길어 완성되지 못했습니다. 요청 범위를 줄여 다시 시도해주세요."
        : "AI 응답이 완성되지 못했습니다. 다시 시도해주세요.",
    );
  }

  return {
    raw: response.output_text.trim(),
    model: response.model,
    usage: {
      inputTokens: response.usage?.input_tokens ?? 0,
      outputTokens: response.usage?.output_tokens ?? 0,
      cacheReadInputTokens: response.usage?.input_tokens_details.cached_tokens ?? 0,
    },
  };
}
