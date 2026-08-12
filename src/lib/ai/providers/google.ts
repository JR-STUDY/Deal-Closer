/**
 * Gemini(Google GenAI) 어댑터 (서버 전용).
 *
 * - 구조화 출력은 `responseJsonSchema` + `responseMimeType: "application/json"` 으로 고정한다.
 *   Gemini 는 JSON Schema 부분집합을 지원하는데, 지원 키워드가
 *   `type · properties · required · additionalProperties · enum · items · anyOf · minimum/maximum` 등이고
 *   `allOf · not · if/then/else` 는 지원하지 않는다 → 기존 스펙 스키마가 그대로 통과한다.
 * - 시스템 프롬프트는 `systemInstruction` 으로 넣는다 (요청마다 동일하므로 암묵적 캐시 대상).
 * - PDF·이미지는 `inlineData`(base64)로 원본 그대로 전달한다.
 */

import "server-only";
import { ApiError, ThinkingLevel, type Content, type Part } from "@google/genai";
import { getGoogle } from "../client";
import { AI_MAX_TOKENS, AiGenerationError, AiNotConfiguredError } from "../config";
import type { AiContentBlock } from "../blocks";
import type { StructuredCall, StructuredResult } from "../invoke";

/** 중립 블록 → Gemini Part */
function toParts(blocks: AiContentBlock[]): Part[] {
  return blocks.map((block): Part => {
    switch (block.type) {
      case "text":
        return { text: block.text };
      case "image":
        return { inlineData: { mimeType: block.mediaType, data: block.dataBase64 } };
      case "pdf":
        return {
          inlineData: { mimeType: "application/pdf", data: block.dataBase64 },
        };
    }
  });
}

/**
 * 응답이 정상 종료되지 않은 이유를 사용자 문구로 바꾼다.
 * 정상(STOP)이거나 판단 불가면 null.
 */
function finishProblem(reason: string | undefined): string | null {
  switch (reason) {
    case undefined:
    case "":
    case "STOP":
      return null;
    case "MAX_TOKENS":
      return "생성 결과가 너무 길어 완성되지 못했습니다. 요청 범위를 줄여 다시 시도해주세요.";
    case "SAFETY":
    case "PROHIBITED_CONTENT":
    case "BLOCKLIST":
    case "SPII":
      return "AI 가 이 요청의 생성을 거절했습니다. 요청 내용을 조정해 다시 시도해주세요.";
    case "RECITATION":
      return "AI 응답이 저작권 보호 정책에 걸려 중단되었습니다. 요청 내용을 바꿔 다시 시도해주세요.";
    default:
      return `AI 응답이 완성되지 못했습니다. (${reason})`;
  }
}

/** HTTP 상태로 예외를 분류한다 (Gemini SDK 는 ApiError 하나로 올라온다) */
function toAiError(error: unknown, model: string): Error {
  if (error instanceof ApiError) {
    const status = error.status;
    if (status === 401 || status === 403) {
      return new AiNotConfiguredError(
        "AI 연동 인증에 실패했습니다. GEMINI_API_KEY 를 확인해주세요.",
      );
    }
    if (status === 404) {
      return new AiNotConfiguredError(
        `모델 "${model}" 을 찾을 수 없습니다. AI_MODEL_GENERATE / AI_MODEL_BATCH 설정을 확인해주세요.`,
      );
    }
    if (status === 429) {
      return new AiGenerationError(
        "AI 요청이 일시적으로 몰렸습니다. 잠시 후 다시 시도해주세요.",
        error,
      );
    }
    return new AiGenerationError(
      `AI 호출이 실패했습니다. (${status ?? "network"})`,
      error,
    );
  }
  return new AiGenerationError(undefined, error);
}

export async function callGoogle(call: StructuredCall): Promise<StructuredResult> {
  const ai = getGoogle();

  const contents: Content[] = [{ role: "user", parts: toParts(call.content) }];

  let response;
  try {
    response = await ai.models.generateContent({
      model: call.model,
      contents,
      config: {
        systemInstruction: call.system,
        responseMimeType: "application/json",
        responseJsonSchema: call.schema,
        maxOutputTokens: call.maxTokens ?? AI_MAX_TOKENS,
        ...(call.effort ? { thinkingConfig: { thinkingLevel: thinkingLevelOf(call.effort) } } : {}),
      },
    });
  } catch (error) {
    throw toAiError(error, call.model);
  }

  // 프롬프트 자체가 차단된 경우 candidates 가 비어 있다
  const blockReason = response.promptFeedback?.blockReason;
  if (blockReason) {
    throw new AiGenerationError(
      "AI 가 이 요청의 생성을 거절했습니다. 요청 내용을 조정해 다시 시도해주세요.",
    );
  }

  const problem = finishProblem(response.candidates?.[0]?.finishReason);
  if (problem) throw new AiGenerationError(problem);

  const usage = response.usageMetadata;
  return {
    raw: (response.text ?? "").trim(),
    // 응답에 모델 버전이 실려오면 그것을 쓴다 (요청한 별칭이 실제로 어느 버전인지 남는다)
    model: response.modelVersion ?? call.model,
    usage: {
      inputTokens: usage?.promptTokenCount ?? 0,
      outputTokens: usage?.candidatesTokenCount ?? 0,
      cacheReadInputTokens: usage?.cachedContentTokenCount ?? 0,
    },
  };
}

/** 공통 effort → Gemini thinkingLevel (xhigh·max 는 HIGH 로 접는다) */
function thinkingLevelOf(
  effort: NonNullable<StructuredCall["effort"]>,
): ThinkingLevel {
  switch (effort) {
    case "low":
      return ThinkingLevel.LOW;
    case "medium":
      return ThinkingLevel.MEDIUM;
    default:
      return ThinkingLevel.HIGH;
  }
}
