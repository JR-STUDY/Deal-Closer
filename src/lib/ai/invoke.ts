/**
 * Claude 구조화 출력 호출 래퍼 (서버 전용).
 *
 * 모든 AI 경로가 이 함수를 지나간다:
 *  - 시스템 프롬프트는 프롬프트 캐시 breakpoint 를 붙여 반복 호출 비용을 줄인다
 *  - output_config.format(json_schema) 으로 응답 형식을 스키마에 고정한다
 *  - 거절(refusal)·토큰 초과·JSON 파싱 실패를 모두 AiGenerationError 로 정규화한다
 */

import "server-only";
import Anthropic from "@anthropic-ai/sdk";
import { getAnthropic } from "./client";
import {
  AI_MAX_TOKENS,
  AiGenerationError,
  AiNotConfiguredError,
} from "./config";

export type StructuredCall = {
  model: string;
  /** 시스템 프롬프트 (캐시 대상) */
  system: string;
  /** 사용자 메시지 content 블록 */
  content: Anthropic.ContentBlockParam[];
  /** 응답 JSON Schema */
  schema: Record<string, unknown>;
  /** 추론 강도. 생략 시 모델 기본값(high) */
  effort?: "low" | "medium" | "high" | "xhigh" | "max";
  maxTokens?: number;
};

export type StructuredResult = {
  /** JSON.parse 결과 (검증은 호출부의 parseXxx 가 담당) */
  value: unknown;
  model: string;
  usage: {
    inputTokens: number;
    outputTokens: number;
    cacheReadInputTokens: number;
  };
};

/** 응답에서 텍스트 블록만 이어붙인다 (구조화 출력은 text 블록으로 온다) */
function textOf(message: Anthropic.Message): string {
  return message.content
    .filter((block): block is Anthropic.TextBlock => block.type === "text")
    .map((block) => block.text)
    .join("")
    .trim();
}

export async function callStructured(call: StructuredCall): Promise<StructuredResult> {
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
      messages: [{ role: "user", content: call.content }],
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

  const raw = textOf(message);
  if (!raw) {
    throw new AiGenerationError("AI 응답이 비어 있습니다. 다시 시도해주세요.");
  }

  let value: unknown;
  try {
    value = JSON.parse(raw);
  } catch (error) {
    throw new AiGenerationError(
      "AI 응답을 해석하지 못했습니다. 다시 시도해주세요.",
      error,
    );
  }

  return {
    value,
    model: message.model,
    usage: {
      inputTokens: message.usage.input_tokens,
      outputTokens: message.usage.output_tokens,
      cacheReadInputTokens: message.usage.cache_read_input_tokens ?? 0,
    },
  };
}
