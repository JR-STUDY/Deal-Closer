/**
 * AI SDK 클라이언트 싱글톤 (서버 전용).
 *
 * 키가 없거나 형식이 맞지 않으면 AiNotConfiguredError 를 던진다 — 목업 폴백은 없다.
 * 키 형식을 미리 검사하는 이유: 잘못된 종류의 키를 넣으면 서버가 401 을 돌려주는데
 * 그대로 두면 "키가 없다"는 안내로 보여 원인을 찾기 어렵다.
 */

import "server-only";
import Anthropic from "@anthropic-ai/sdk";
import OpenAI from "openai";
import { AiNotConfiguredError, type AiProvider } from "./config";

/** 문서 생성은 수십 초까지 걸릴 수 있다 (ms) */
const REQUEST_TIMEOUT_MS = 5 * 60 * 1000;
/** 429/5xx 는 SDK 가 지수 백오프로 재시도한다 */
const MAX_RETRIES = 2;

// dev 리로드에서 클라이언트가 계속 새로 만들어지지 않도록 전역에 보관한다 (db.ts 와 동일 패턴)
const globalForAi = globalThis as unknown as {
  anthropic?: Anthropic;
  anthropicKey?: string;
  openai?: OpenAI;
  openaiKey?: string;
};

// ===================== 키 형식 검사 =====================

/**
 * Messages API 용 Anthropic 키인지 확인한다.
 * `sk-ant-oat…`(Claude Code 로그인 OAuth 토큰)·`sk-ant-admin…`(Admin API 키)는 쓸 수 없다.
 */
function anthropicKeyProblem(apiKey: string): string | null {
  if (apiKey.startsWith("sk-ant-api")) return null;
  if (apiKey.startsWith("sk-ant-oat")) {
    return "ANTHROPIC_API_KEY 에 Claude Code 로그인 토큰(sk-ant-oat…)이 들어가 있습니다. Anthropic 콘솔에서 발급한 API 키(sk-ant-api…)로 교체해주세요.";
  }
  if (apiKey.startsWith("sk-ant-admin")) {
    return "ANTHROPIC_API_KEY 에 Admin API 키(sk-ant-admin…)가 들어가 있습니다. 문서 생성에는 일반 API 키(sk-ant-api…)가 필요합니다.";
  }
  return "ANTHROPIC_API_KEY 형식이 올바르지 않습니다. Anthropic 콘솔에서 발급한 API 키(sk-ant-api…)인지 확인해주세요.";
}

/** OpenAI 키인지 확인한다 (일반 sk-… · 프로젝트 sk-proj-… · 서비스계정 sk-svcacct-…) */
function openaiKeyProblem(apiKey: string): string | null {
  if (apiKey.startsWith("sk-ant-")) {
    return "OPENAI_API_KEY 에 Anthropic 키(sk-ant-…)가 들어가 있습니다. OpenAI 플랫폼에서 발급한 키(sk-…)로 교체해주세요.";
  }
  if (!apiKey.startsWith("sk-")) {
    return "OPENAI_API_KEY 형식이 올바르지 않습니다. OpenAI 플랫폼에서 발급한 키(sk-…)인지 확인해주세요.";
  }
  return null;
}

/** 프로바이더별 환경변수 이름 (안내 문구용) */
const KEY_ENV_NAME: Record<AiProvider, string> = {
  anthropic: "ANTHROPIC_API_KEY",
  openai: "OPENAI_API_KEY",
};

function readKey(provider: AiProvider): { key: string } | { problem: string } {
  const envName = KEY_ENV_NAME[provider];
  const apiKey = process.env[envName]?.trim();
  if (!apiKey) {
    return {
      problem: `AI 연동이 설정되지 않았습니다. 관리자에게 ${envName} 설정을 요청해주세요.`,
    };
  }
  const problem =
    provider === "anthropic"
      ? anthropicKeyProblem(apiKey)
      : openaiKeyProblem(apiKey);
  return problem ? { problem } : { key: apiKey };
}

/** 해당 프로바이더로 문서 생성이 가능한 상태인지 (UI 안내·사전 검사용) */
export function isAiConfigured(provider: AiProvider): boolean {
  return "key" in readKey(provider);
}

// ===================== 클라이언트 =====================

/** Claude 클라이언트. 키가 없거나 형식이 맞지 않으면 AiNotConfiguredError. */
export function getAnthropic(): Anthropic {
  const result = readKey("anthropic");
  if ("problem" in result) throw new AiNotConfiguredError(result.problem);

  // 키가 바뀌면 클라이언트를 새로 만든다
  if (!globalForAi.anthropic || globalForAi.anthropicKey !== result.key) {
    globalForAi.anthropic = new Anthropic({
      apiKey: result.key,
      maxRetries: MAX_RETRIES,
      timeout: REQUEST_TIMEOUT_MS,
    });
    globalForAi.anthropicKey = result.key;
  }
  return globalForAi.anthropic;
}

/** GPT 클라이언트. 키가 없거나 형식이 맞지 않으면 AiNotConfiguredError. */
export function getOpenAI(): OpenAI {
  const result = readKey("openai");
  if ("problem" in result) throw new AiNotConfiguredError(result.problem);

  if (!globalForAi.openai || globalForAi.openaiKey !== result.key) {
    globalForAi.openai = new OpenAI({
      apiKey: result.key,
      maxRetries: MAX_RETRIES,
      timeout: REQUEST_TIMEOUT_MS,
      // 조직·프로젝트를 분리해 쓰는 계정이면 지정한다 (없으면 기본값)
      organization: process.env.OPENAI_ORG_ID?.trim() || null,
      project: process.env.OPENAI_PROJECT_ID?.trim() || null,
    });
    globalForAi.openaiKey = result.key;
  }
  return globalForAi.openai;
}
