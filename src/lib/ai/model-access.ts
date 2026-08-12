/**
 * 모델 선택 검증·노출 (서버 전용).
 *
 * 사용자가 UI 에서 모델을 고르므로 두 가지를 서버가 통제한다:
 *  ① 노출 — 키가 설정된 프로바이더의 모델만 선택기에 내려보낸다.
 *  ② 검증 — 요청으로 들어온 모델 id 가 카탈로그에 있는지 확인한다.
 *     (클라이언트가 보낸 임의 문자열을 그대로 호출하면 비용·오류를 통제할 수 없다)
 */

import "server-only";
import { isAiConfigured } from "./client";
import { AI_MODEL_GENERATE, AI_PROVIDER } from "./config";
import {
  AI_MODEL_CATALOG,
  findModel,
  PROVIDER_KEY_ENV,
  type AiModelOption,
} from "./models";

/**
 * 선택기에 내려보낼 모델 목록 + 기본 선택값.
 *
 * mock 모드에서는 카탈로그 전체를 내려보낸다 — 어느 모델을 골라도 목으로 가므로
 * 선택기 UI 자체를 키 없이 검증할 수 있다.
 */
export function availableModels(): {
  models: AiModelOption[];
  defaultModel: string;
  /** 목 모드로 동작 중인지 (UI 에 알려 실제 호출이 아님을 표시한다) */
  mock: boolean;
} {
  const mock = AI_PROVIDER === "mock";
  const models = mock
    ? [...AI_MODEL_CATALOG]
    : AI_MODEL_CATALOG.filter((option) => isAiConfigured(option.provider));

  // 기본값이 목록에 없으면(환경변수로 카탈로그 밖 모델을 지정한 경우 등) 첫 항목으로 맞춘다
  const defaultModel = models.some((m) => m.id === AI_MODEL_GENERATE)
    ? AI_MODEL_GENERATE
    : (models[0]?.id ?? AI_MODEL_GENERATE);

  return { models, defaultModel, mock };
}

export type ModelResolution =
  | { model: string }
  | { problem: string; status: number };

/**
 * 요청으로 들어온 모델 id 를 검증한다.
 *
 * - 비어 있으면 기본 모델을 쓴다 (선택기를 안 쓰는 호출 경로 호환).
 * - 카탈로그에 없으면 400 — 임의 모델 호출을 막는다.
 * - 카탈로그에 있지만 키가 없으면 503 — 어느 키가 필요한지 알려준다.
 */
export function resolveRequestedModel(requested: unknown): ModelResolution {
  const id = typeof requested === "string" ? requested.trim() : "";
  if (!id) return { model: AI_MODEL_GENERATE };

  const option = findModel(id);
  if (!option) {
    return { problem: "지원하지 않는 AI 모델입니다.", status: 400 };
  }

  // mock 모드에서는 키 검사를 건너뛴다 (어차피 목으로 간다)
  if (AI_PROVIDER !== "mock" && !isAiConfigured(option.provider)) {
    return {
      problem: `${option.label} 을 쓰려면 ${PROVIDER_KEY_ENV[option.provider]} 설정이 필요합니다. 다른 모델을 선택해주세요.`,
      status: 503,
    };
  }

  return { model: option.id };
}
