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

/**
 * Messages API 용 API 키인지 확인한다.
 *
 * `sk-ant-oat01-`(Claude Code 로그인 OAuth 토큰)이나 `sk-ant-admin01-`(Admin API 키)를
 * 넣으면 서버가 401 을 돌려주는데, 그대로 두면 "키가 없다"는 안내로 보여 원인을 찾기 어렵다.
 * → 호출 전에 걸러 어떤 키가 필요한지 알려준다.
 */
function apiKeyProblem(apiKey: string): string | null {
  if (apiKey.startsWith("sk-ant-api")) return null;
  if (apiKey.startsWith("sk-ant-oat")) {
    return "ANTHROPIC_API_KEY 에 Claude Code 로그인 토큰(sk-ant-oat…)이 들어가 있습니다. Anthropic 콘솔에서 발급한 API 키(sk-ant-api…)로 교체해주세요.";
  }
  if (apiKey.startsWith("sk-ant-admin")) {
    return "ANTHROPIC_API_KEY 에 Admin API 키(sk-ant-admin…)가 들어가 있습니다. 문서 생성에는 일반 API 키(sk-ant-api…)가 필요합니다.";
  }
  return "ANTHROPIC_API_KEY 형식이 올바르지 않습니다. Anthropic 콘솔에서 발급한 API 키(sk-ant-api…)인지 확인해주세요.";
}

/** 문서 생성에 쓸 수 있는 API 키가 설정돼 있는지 (UI 안내·사전 검사용) */
export function isAiConfigured(): boolean {
  const apiKey = process.env.ANTHROPIC_API_KEY?.trim();
  return Boolean(apiKey) && apiKeyProblem(apiKey!) === null;
}

/** Claude 클라이언트. 키가 없거나 형식이 맞지 않으면 AiNotConfiguredError. */
export function getAnthropic(): Anthropic {
  const apiKey = process.env.ANTHROPIC_API_KEY?.trim();
  if (!apiKey) throw new AiNotConfiguredError();

  const problem = apiKeyProblem(apiKey);
  if (problem) throw new AiNotConfiguredError(problem);

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
