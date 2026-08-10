/**
 * AI 연동 설정 (서버 전용).
 *
 * 프로바이더는 Claude(Anthropic)와 GPT(OpenAI) 둘을 지원한다.
 * 모델은 용도별로 분리한다 (환경변수로 오버라이드 가능):
 *  - AI_MODEL_GENERATE: 문서 초안 생성(F-212) · 양식 AI 세팅(F-203) · 부분 재작성(F-215)
 *    → 문서 구조·금액 추론 정확도가 중요한 경로. 각 프로바이더의 상위 모델.
 *  - AI_MODEL_BATCH: 변수 필드 추출(F-204) 등 반복·경량 경로. 중간 등급 모델.
 */

import "server-only";

export type AiProvider = "anthropic" | "openai";

/** 프로바이더별 기본 모델 */
const DEFAULT_MODELS: Record<AiProvider, { generate: string; batch: string }> = {
  anthropic: { generate: "claude-opus-5", batch: "claude-sonnet-5" },
  openai: { generate: "gpt-5.6-sol", batch: "gpt-5.6-terra" },
};

/** 모델 이름만 보고 프로바이더를 판별한다 (판별 불가면 null) */
export function providerOfModel(model: string): AiProvider | null {
  const name = model.trim().toLowerCase();
  if (!name) return null;
  if (name.startsWith("claude")) return "anthropic";
  if (
    name.startsWith("gpt") ||
    name.startsWith("chatgpt") ||
    /^o\d/.test(name) // o1 · o3 · o4 계열 추론 모델
  ) {
    return "openai";
  }
  return null;
}

/**
 * 사용할 프로바이더를 결정한다.
 *
 * 우선순위:
 *  1. AI_PROVIDER 를 명시했으면 그대로 따른다.
 *  2. AI_MODEL_GENERATE 모델명으로 판별한다. (예: gpt-5.6-sol → openai)
 *  3. 쓸 수 있는 키가 한쪽만 있으면 그쪽을 쓴다.
 *  4. 그래도 모르면 anthropic.
 */
function detectProvider(): AiProvider {
  const explicit = process.env.AI_PROVIDER?.trim().toLowerCase();
  if (explicit === "openai" || explicit === "anthropic") return explicit;

  const fromModel = providerOfModel(process.env.AI_MODEL_GENERATE ?? "");
  if (fromModel) return fromModel;

  // Messages API 로 쓸 수 있는 Anthropic 키인지까지 본다 (sk-ant-oat… 로그인 토큰은 제외)
  const hasAnthropic = Boolean(
    process.env.ANTHROPIC_API_KEY?.trim().startsWith("sk-ant-api"),
  );
  const hasOpenai = Boolean(process.env.OPENAI_API_KEY?.trim());
  if (hasOpenai && !hasAnthropic) return "openai";
  if (hasAnthropic && !hasOpenai) return "anthropic";

  return "anthropic";
}

/** 기본 프로바이더 — 모델명으로 판별되지 않을 때의 폴백 */
export const AI_PROVIDER: AiProvider = detectProvider();

/** 문서 생성·재작성·양식 세팅에 사용하는 모델 */
export const AI_MODEL_GENERATE =
  process.env.AI_MODEL_GENERATE?.trim() || DEFAULT_MODELS[AI_PROVIDER].generate;

/** 변수 추출 등 경량·반복 작업에 사용하는 모델 */
export const AI_MODEL_BATCH =
  process.env.AI_MODEL_BATCH?.trim() || DEFAULT_MODELS[AI_PROVIDER].batch;

/** 이 모델을 어느 프로바이더로 보낼지 (판별 불가면 기본 프로바이더) */
export function providerOf(model: string): AiProvider {
  return providerOfModel(model) ?? AI_PROVIDER;
}

/**
 * 응답 최대 토큰.
 * 비스트리밍 요청이므로 SDK HTTP 타임아웃에 걸리지 않는 범위로 잡는다.
 */
export const AI_MAX_TOKENS = 16_000;

/** 추론 강도 — 두 프로바이더가 공통으로 받는 값만 노출한다 */
export type AiEffort = "low" | "medium" | "high" | "xhigh" | "max";

/** API 키가 없거나 형식이 맞지 않을 때 (호출 자체가 불가) → HTTP 503 */
export class AiNotConfiguredError extends Error {
  constructor(
    message = "AI 연동이 설정되지 않았습니다. 관리자에게 API 키 설정을 요청해주세요.",
  ) {
    super(message);
    this.name = "AiNotConfiguredError";
  }
}

/** 호출 실패·응답 형식 오류 등 생성 실패 (재시도 가능) → HTTP 502 */
export class AiGenerationError extends Error {
  constructor(
    message = "AI 생성에 실패했습니다. 잠시 후 다시 시도해주세요.",
    readonly cause?: unknown,
  ) {
    super(message);
    this.name = "AiGenerationError";
  }
}
