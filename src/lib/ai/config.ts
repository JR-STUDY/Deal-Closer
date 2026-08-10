/**
 * Claude API 연동 설정 (서버 전용).
 *
 * 모델은 용도별로 분리한다 (환경변수로 오버라이드 가능):
 *  - AI_MODEL_GENERATE: 문서 초안 생성(F-212) · 양식 AI 세팅(F-203) · 부분 재작성(F-215)
 *    → 문서 구조·금액 추론 정확도가 중요한 경로. 기본 claude-opus-5.
 *  - AI_MODEL_BATCH: 변수 필드 추출(F-204) 등 반복·경량 경로. 기본 claude-sonnet-5.
 */

import "server-only";

/** 문서 생성·재작성·양식 세팅에 사용하는 모델 */
export const AI_MODEL_GENERATE =
  process.env.AI_MODEL_GENERATE?.trim() || "claude-opus-5";

/** 변수 추출 등 경량·반복 작업에 사용하는 모델 */
export const AI_MODEL_BATCH =
  process.env.AI_MODEL_BATCH?.trim() || "claude-sonnet-5";

/**
 * 응답 최대 토큰.
 * 비스트리밍 요청이므로 SDK HTTP 타임아웃에 걸리지 않는 범위로 잡는다.
 * (스트리밍 없이 안전한 상한 — claude-api 가이드 권장 16K)
 */
export const AI_MAX_TOKENS = 16_000;

/** ANTHROPIC_API_KEY 가 설정되지 않았을 때 (호출 자체가 불가) → HTTP 503 */
export class AiNotConfiguredError extends Error {
  constructor(
    message = "AI 연동이 설정되지 않았습니다. 관리자에게 ANTHROPIC_API_KEY 설정을 요청해주세요.",
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
