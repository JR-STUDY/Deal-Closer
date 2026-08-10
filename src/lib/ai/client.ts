/**
 * Anthropic SDK 클라이언트 싱글톤 (서버 전용).
 * 키가 없으면 AiNotConfiguredError 를 던진다 — 목업 폴백은 없다.
 */

import "server-only";
import Anthropic from "@anthropic-ai/sdk";
import { AiNotConfiguredError } from "./config";

// dev 리로드에서 클라이언트가 계속 새로 만들어지지 않도록 전역에 보관한다 (db.ts 와 동일 패턴)
const globalForAnthropic = globalThis as unknown as {
  anthropic?: Anthropic;
  anthropicKey?: string;
};

/** API 키가 설정돼 있는지 (UI 안내·사전 검사용) */
export function isAiConfigured(): boolean {
  return Boolean(process.env.ANTHROPIC_API_KEY?.trim());
}

/** Claude 클라이언트. 키가 없으면 AiNotConfiguredError. */
export function getAnthropic(): Anthropic {
  const apiKey = process.env.ANTHROPIC_API_KEY?.trim();
  if (!apiKey) throw new AiNotConfiguredError();

  // 키가 바뀌면 클라이언트를 새로 만든다
  if (!globalForAnthropic.anthropic || globalForAnthropic.anthropicKey !== apiKey) {
    globalForAnthropic.anthropic = new Anthropic({
      apiKey,
      // 429/5xx 는 SDK 가 지수 백오프로 재시도한다
      maxRetries: 2,
      // ms 단위 (TypeScript SDK). 문서 생성은 수십 초까지 걸릴 수 있다.
      timeout: 5 * 60 * 1000,
    });
    globalForAnthropic.anthropicKey = apiKey;
  }
  return globalForAnthropic.anthropic;
}
