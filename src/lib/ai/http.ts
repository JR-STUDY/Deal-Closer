/** AI 예외 → 표준 실패 응답 매핑 (라우트 핸들러 공용) */

import "server-only";
import { fail } from "@/lib/api";
import { AiGenerationError, AiNotConfiguredError } from "./config";

/**
 * AI 호출 예외를 HTTP 응답으로 바꾼다.
 *  - 키 미설정·인증 실패 → 503 (설정 문제, 재시도 무의미)
 *  - 생성 실패·거절·형식 오류 → 502 (재시도 가능)
 * 그 외 예외는 null 을 반환하므로 호출부에서 다시 던진다.
 */
export function aiErrorResponse(error: unknown) {
  if (error instanceof AiNotConfiguredError) return fail(error.message, 503);
  if (error instanceof AiGenerationError) return fail(error.message, 502);
  return null;
}
