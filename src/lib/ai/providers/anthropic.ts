/**
 * Claude(Anthropic Messages API) 어댑터 (서버 전용).
 *
 * - 시스템 프롬프트에 캐시 breakpoint 를 붙여 반복 호출 비용을 줄인다
 * - output_config.format(json_schema) 으로 응답 형식을 스키마에 고정한다
 * - 거절(refusal)·토큰 초과·JSON 파싱 실패를 AiGenerationError 로 정규화한다
 */

import "server-only";
import Anthropic from "@anthropic-ai/sdk";
import { getAnthropic } from "../client";
import { AI_MAX_TOKENS, AiGenerationError, AiNotConfiguredError } from "../config";
import type { AiContentBlock } from "../blocks";
import type { StructuredCall, StructuredResult } from "../invoke";

/** 중립 블록 → Claude content 블록 */
function toContentBlocks(blocks: AiContentBlock[]): Anthropic.ContentBlockParam[] {
  return blocks.map((block): Anthropic.ContentBlockParam => {
    switch (block.type) {
      case "text":
        return { type: "text", text: block.text };
      case "image":
        return {
          type: "image",
          source: {
            type: "base64",
            media_type: block.mediaType,
            data: block.dataBase64,
          },
        };
      case "pdf":
        return {
          type: "document",
          source: {
            type: "base64",
            media_type: "application/pdf",
            data: block.dataBase64,
          },
        };
    }
  });
}

/** 응답에서 텍스트 블록만 이어붙인다 (구조화 출력은 text 블록으로 온다) */
function textOf(message: Anthropic.Message): string {
  return message.content
    .filter((block): block is Anthropic.TextBlock => block.type === "text")
    .map((block) => block.text)
    .join("")
    .trim();
}

export async function callAnthropic(call: StructuredCall): Promise<StructuredResult> {
  const client = getAnthropic();

  let message: Anthropic.Message;
  try {
    message = await client.messages.create({
      model: call.model,
      max_tokens: call.maxTokens ?? AI_MAX_TOKENS,
      // 시스템 프롬프트는 요청마다 동일 → 캐시 breakpoint 를 걸어 재사용한다
      system: [
        {
          type: "text",
          text: call.system,
          cache_control: { type: "ephemeral" },
        },
      ],
      output_config: {
        format: { type: "json_schema", schema: call.schema },
        ...(call.effort ? { effort: call.effort } : {}),
      },
      messages: [{ role: "user", content: toContentBlocks(call.content) }],
    });
  } catch (error) {
    // 키 문제(401/403)는 "설정 안 됨"으로 올려 503 으로 내려간다
    if (
      error instanceof Anthropic.AuthenticationError ||
      error instanceof Anthropic.PermissionDeniedError
    ) {
      throw new AiNotConfiguredError(
        "AI 연동 인증에 실패했습니다. ANTHROPIC_API_KEY 를 확인해주세요.",
      );
    }
    if (error instanceof Anthropic.NotFoundError) {
      throw new AiNotConfiguredError(
        `모델 "${call.model}" 을 찾을 수 없습니다. AI_MODEL_GENERATE / AI_MODEL_BATCH 설정을 확인해주세요.`,
      );
    }
    if (error instanceof Anthropic.RateLimitError) {
      throw new AiGenerationError(
        "AI 요청이 일시적으로 몰렸습니다. 잠시 후 다시 시도해주세요.",
        error,
      );
    }
    if (error instanceof Anthropic.APIConnectionError) {
      throw new AiGenerationError("AI 서버에 연결하지 못했습니다.", error);
    }
    if (error instanceof Anthropic.APIError) {
      throw new AiGenerationError(
        `AI 호출이 실패했습니다. (${error.status ?? "network"})`,
        error,
      );
    }
    throw new AiGenerationError(undefined, error);
  }

  // 안전 분류기 거절 — content 가 비어 있거나 일부만 온다
  if (message.stop_reason === "refusal") {
    throw new AiGenerationError(
      "AI 가 이 요청의 생성을 거절했습니다. 요청 내용을 조정해 다시 시도해주세요.",
    );
  }
  if (message.stop_reason === "max_tokens") {
    throw new AiGenerationError(
      "생성 결과가 너무 길어 완성되지 못했습니다. 요청 범위를 줄여 다시 시도해주세요.",
    );
  }

  return {
    raw: textOf(message),
    model: message.model,
    usage: {
      inputTokens: message.usage.input_tokens,
      outputTokens: message.usage.output_tokens,
      cacheReadInputTokens: message.usage.cache_read_input_tokens ?? 0,
    },
  };
}
