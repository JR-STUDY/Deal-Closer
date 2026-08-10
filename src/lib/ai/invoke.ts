/**
 * 구조화 출력 호출 래퍼 (서버 전용).
 *
 * 모든 AI 경로가 이 함수를 지나간다. 모델 이름으로 프로바이더를 골라
 * Claude(Messages API) 또는 GPT(Responses API) 어댑터로 넘기고,
 * 응답 JSON 파싱과 예외 정규화를 공통으로 처리한다.
 * (스키마 검증은 호출부의 parseXxx 가 담당한다)
 */

import "server-only";
import { AiGenerationError, providerOf, type AiEffort } from "./config";
import type { AiContentBlock } from "./blocks";

export type StructuredCall = {
  /** 모델 이름 — 이 값으로 프로바이더가 결정된다 */
  model: string;
  /** 시스템 프롬프트 (프롬프트 캐시 대상 → 가변값 금지) */
  system: string;
  /** 사용자 메시지 블록 (프로바이더 중립) */
  content: AiContentBlock[];
  /** 응답 JSON Schema */
  schema: Record<string, unknown>;
  /** 스키마 이름 (GPT 의 json_schema.name — 로그 식별용) */
  schemaName?: string;
  /** 추론 강도. 생략 시 모델 기본값 */
  effort?: AiEffort;
  maxTokens?: number;
};

/** 어댑터가 돌려주는 원본 결과 */
export type StructuredResult = {
  /** 모델이 낸 JSON 문자열 */
  raw: string;
  model: string;
  usage: {
    inputTokens: number;
    outputTokens: number;
    cacheReadInputTokens: number;
  };
};

export type StructuredValue = Omit<StructuredResult, "raw"> & {
  /** JSON.parse 결과 (검증은 호출부의 parseXxx 가 담당) */
  value: unknown;
};

export async function callStructured(call: StructuredCall): Promise<StructuredValue> {
  // 어댑터는 필요할 때만 로드한다 (쓰지 않는 SDK 를 서버 번들에 끌어오지 않도록)
  const result =
    providerOf(call.model) === "openai"
      ? await (await import("./providers/openai")).callOpenAI(call)
      : await (await import("./providers/anthropic")).callAnthropic(call);

  if (!result.raw) {
    throw new AiGenerationError("AI 응답이 비어 있습니다. 다시 시도해주세요.");
  }

  let value: unknown;
  try {
    value = JSON.parse(result.raw);
  } catch (error) {
    throw new AiGenerationError(
      "AI 응답을 해석하지 못했습니다. 다시 시도해주세요.",
      error,
    );
  }

  return { value, model: result.model, usage: result.usage };
}
