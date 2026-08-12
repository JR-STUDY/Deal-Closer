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
import { GoogleGenAI } from "@google/genai";
import { AiNotConfiguredError } from "./config";
import { PROVIDER_KEY_ENV, type AiLiveProvider, type AiProvider } from "./models";

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
  google?: GoogleGenAI;
  googleKey?: string;
};

// ===================== 키 형식 검사 =====================

/**
 * 키 접두사로 "어느 프로바이더 키인지" 추정한다 (모르면 null).
 *
 * 형식을 화이트리스트로 검사하지 않는 이유: 각 사가 키 형식을 늘리기 때문이다
 * (예: Google AI Studio 는 `AIza…` 외에 `AQ.…` 형식도 발급한다).
 * 접두사를 맞히려 들면 정상 키를 막게 되므로, **다른 프로바이더 키를 잘못 넣은 경우만**
 * 잡아내고 나머지는 서버 응답(401)에 맡긴다.
 */
type KeyKind = AiLiveProvider | "anthropic-oauth" | "anthropic-admin";

function guessKeyKind(apiKey: string): KeyKind | null {
  if (apiKey.startsWith("sk-ant-oat")) return "anthropic-oauth";
  if (apiKey.startsWith("sk-ant-admin")) return "anthropic-admin";
  if (apiKey.startsWith("sk-ant-")) return "anthropic";
  if (apiKey.startsWith("sk-")) return "openai";
  if (apiKey.startsWith("AIza") || apiKey.startsWith("AQ.")) return "google";
  return null;
}

/** 사람이 읽는 프로바이더 이름 (오배치 안내 문구용) */
const KIND_LABELS: Record<KeyKind, string> = {
  anthropic: "Anthropic",
  "anthropic-oauth": "Claude Code 로그인 토큰",
  "anthropic-admin": "Anthropic Admin",
  openai: "OpenAI",
  google: "Google",
};

/** 이 프로바이더 자리에 이 키를 써도 되는지. 문제가 있으면 안내 문구 */
function keyProblem(provider: AiLiveProvider, apiKey: string): string | null {
  const envName = PROVIDER_KEY_ENV[provider];
  const kind = guessKeyKind(apiKey);

  // 형식을 못 알아보면 통과시킨다 (신형 키일 수 있다 — 틀리면 서버가 401 을 준다)
  if (kind === null || kind === provider) return null;

  // Messages API 에 쓸 수 없는 Anthropic 자격증명 — 원인을 콕 집어 알려준다
  if (provider === "anthropic") {
    if (kind === "anthropic-oauth") {
      return `${envName} 에 Claude Code 로그인 토큰(sk-ant-oat…)이 들어가 있습니다. Anthropic 콘솔에서 발급한 API 키(sk-ant-api…)로 교체해주세요.`;
    }
    if (kind === "anthropic-admin") {
      return `${envName} 에 Admin API 키(sk-ant-admin…)가 들어가 있습니다. 문서 생성에는 일반 API 키(sk-ant-api…)가 필요합니다.`;
    }
  }

  return `${envName} 에 ${KIND_LABELS[kind]} 키가 들어가 있습니다. ${KIND_LABELS[provider]} 키로 교체해주세요.`;
}

function readKey(provider: AiLiveProvider): { key: string } | { problem: string } {
  const envName = PROVIDER_KEY_ENV[provider];
  const apiKey = process.env[envName]?.trim();
  if (!apiKey) {
    return {
      problem: `AI 연동이 설정되지 않았습니다. 관리자에게 ${envName} 설정을 요청해주세요.`,
    };
  }
  const problem = keyProblem(provider, apiKey);
  return problem ? { problem } : { key: apiKey };
}

/** 해당 프로바이더로 문서 생성이 가능한 상태인지 (선택기 노출·사전 검사용) */
export function isAiConfigured(provider: AiProvider): boolean {
  // mock 은 키가 필요 없다 (단, 프로덕션에서는 어댑터가 거부한다)
  if (provider === "mock") return process.env.NODE_ENV !== "production";
  return "key" in readKey(provider);
}

/** 설정되지 않은 이유 (선택기 안내 문구용). 정상이면 null */
export function aiConfigProblem(provider: AiLiveProvider): string | null {
  const result = readKey(provider);
  return "problem" in result ? result.problem : null;
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

/** Gemini 클라이언트. 키가 없거나 형식이 맞지 않으면 AiNotConfiguredError. */
export function getGoogle(): GoogleGenAI {
  const result = readKey("google");
  if ("problem" in result) throw new AiNotConfiguredError(result.problem);

  if (!globalForAi.google || globalForAi.googleKey !== result.key) {
    globalForAi.google = new GoogleGenAI({
      apiKey: result.key,
      httpOptions: {
        timeout: REQUEST_TIMEOUT_MS,
        // Gemini 는 인기 모델에서 일시적 503(high demand)을 자주 돌려준다.
        // 기본 재시도가 보장되지 않아 명시한다 — 다른 두 SDK 의 maxRetries 와 같은 횟수.
        // 사용자 요청을 오래 붙잡지 않도록 백오프 상한은 짧게 둔다.
        retryOptions: {
          attempts: 1 + MAX_RETRIES,
          initialDelay: 1,
          maxDelay: 8,
          httpStatusCodes: [408, 429, 500, 502, 503, 504],
        },
      },
    });
    globalForAi.googleKey = result.key;
  }
  return globalForAi.google;
}
