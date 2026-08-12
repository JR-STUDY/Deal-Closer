/**
 * AI 연동 설정 (서버 전용).
 *
 * 프로바이더는 Claude(Anthropic) · GPT(OpenAI) · Gemini(Google) 셋을 지원한다.
 * 선택 가능한 모델 목록은 `models.ts` 카탈로그가 단일 소스이고,
 * 이 파일은 **환경변수에서 읽는 기본값**만 담당한다.
 *
 * 모델은 용도별로 분리한다:
 *  - AI_MODEL_GENERATE: 문서 초안 생성(F-212) · 양식 AI 세팅(F-203) · 부분 재작성(F-215)
 *    → 사용자가 UI 에서 고르지 않았을 때의 기본값.
 *  - AI_MODEL_BATCH: 변수 필드 추출(F-204) 등 반복·경량 경로 (선택기 없음).
 */

import "server-only";
import { DEFAULT_MODELS, providerOfModel, type AiProvider } from "./models";

export type {
  AiLiveProvider,
  AiModelOption,
  AiModelTier,
  AiProvider,
} from "./models";
export { providerOfModel } from "./models";

/**
 * 사용할 기본 프로바이더를 결정한다.
 *
 * 우선순위:
 *  1. AI_PROVIDER 를 명시했으면 그대로 따른다. (mock 포함)
 *  2. AI_MODEL_GENERATE 모델명으로 판별한다. (예: gemini-3.6-flash → google)
 *  3. 쓸 수 있는 키가 하나뿐이면 그 프로바이더를 쓴다.
 *  4. 그래도 모르면 anthropic.
 *
 * mock 은 절대 자동 선택되지 않는다 — 명시해야만 켜진다.
 */
function detectProvider(): AiProvider {
  const explicit = process.env.AI_PROVIDER?.trim().toLowerCase();
  if (
    explicit === "anthropic" ||
    explicit === "openai" ||
    explicit === "google" ||
    explicit === "mock"
  ) {
    return explicit;
  }

  const fromModel = providerOfModel(process.env.AI_MODEL_GENERATE ?? "");
  if (fromModel) return fromModel;

  // Messages API 로 쓸 수 있는 Anthropic 키인지까지 본다 (sk-ant-oat… 로그인 토큰은 제외)
  const configured: AiProvider[] = [];
  if (process.env.ANTHROPIC_API_KEY?.trim().startsWith("sk-ant-api")) {
    configured.push("anthropic");
  }
  if (process.env.OPENAI_API_KEY?.trim()) configured.push("openai");
  if (process.env.GEMINI_API_KEY?.trim()) configured.push("google");

  return configured.length === 1 ? configured[0] : "anthropic";
}

/** 기본 프로바이더 — 모델명으로 판별되지 않을 때의 폴백 */
export const AI_PROVIDER: AiProvider = detectProvider();

/** 사용자가 고르지 않았을 때 쓰는 생성 모델 */
export const AI_MODEL_GENERATE =
  process.env.AI_MODEL_GENERATE?.trim() || DEFAULT_MODELS[AI_PROVIDER].generate;

/** 변수 추출 등 경량·반복 작업에 사용하는 모델 (선택기 없음) */
export const AI_MODEL_BATCH =
  process.env.AI_MODEL_BATCH?.trim() || DEFAULT_MODELS[AI_PROVIDER].batch;

/**
 * 이 모델을 어느 프로바이더로 보낼지.
 *
 * AI_PROVIDER=mock 이면 **모델과 무관하게 목으로 보낸다** — UI 에서 모델을 골라도
 * 로컬 검증이 유지되도록 (그렇지 않으면 모델명 판별이 목 설정을 덮어써서 실제 호출이 나간다).
 */
export function providerOf(model: string): AiProvider {
  if (AI_PROVIDER === "mock") return "mock";
  return providerOfModel(model) ?? AI_PROVIDER;
}

/**
 * 응답 최대 토큰.
 * 비스트리밍 요청이므로 SDK HTTP 타임아웃에 걸리지 않는 범위로 잡는다.
 */
export const AI_MAX_TOKENS = 16_000;

/** 추론 강도 — 세 프로바이더가 공통으로 받는 값만 노출한다 */
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
