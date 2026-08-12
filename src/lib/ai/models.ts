/**
 * 선택 가능한 AI 모델 카탈로그.
 *
 * 사용자가 UI 에서 모델을 고르므로 **서버가 정한 목록 안에서만** 선택되게 한다.
 * 클라이언트가 보낸 임의의 모델 이름을 그대로 호출하면 비용·오류를 통제할 수 없다.
 *
 * (서버·클라이언트 공용 순수 모듈 — server-only import 금지.
 *  선택기 UI 가 라벨·설명을 그대로 쓴다)
 */

/** 실제 API 를 호출하는 프로바이더 (키가 필요하다) */
export type AiLiveProvider = "anthropic" | "openai" | "google";

/** mock = 로컬 검증용. 실제 호출 없이 스키마에 맞는 응답을 즉시 돌려준다 */
export type AiProvider = AiLiveProvider | "mock";

export const AI_LIVE_PROVIDERS: readonly AiLiveProvider[] = [
  "anthropic",
  "openai",
  "google",
] as const;

/** 선택기에 그룹 제목으로 표시할 이름 */
export const PROVIDER_LABELS: Record<AiLiveProvider, string> = {
  anthropic: "Claude (Anthropic)",
  openai: "GPT (OpenAI)",
  google: "Gemini (Google)",
};

/** 프로바이더별 API 키 환경변수 이름 */
export const PROVIDER_KEY_ENV: Record<AiLiveProvider, string> = {
  anthropic: "ANTHROPIC_API_KEY",
  openai: "OPENAI_API_KEY",
  google: "GEMINI_API_KEY",
};

/** 등급 — 비용·품질 트레이드오프를 사용자에게 알려주는 용도 */
export type AiModelTier = "premium" | "standard" | "economy";

export const TIER_LABELS: Record<AiModelTier, string> = {
  premium: "고급",
  standard: "표준",
  economy: "저가",
};

export type AiModelOption = {
  /** API 에 그대로 보내는 모델 id */
  id: string;
  /** 선택기에 표시할 이름 */
  label: string;
  provider: AiLiveProvider;
  tier: AiModelTier;
  /** 선택기 도움말 — 언제 이 모델을 고르면 되는지 */
  description: string;
};

/**
 * 선택 가능한 모델 목록. 프로바이더 → 등급(고급→저가) 순으로 정렬해 둔다.
 *
 * 모델 세대가 바뀌면 이 배열만 갱신한다 (호출 코드는 건드리지 않는다).
 */
export const AI_MODEL_CATALOG: readonly AiModelOption[] = [
  // ── Claude (Anthropic) ──
  {
    id: "claude-opus-5",
    label: "Claude Opus 5",
    provider: "anthropic",
    tier: "premium",
    description: "정확도 최우선. 조건이 복잡하거나 금액 계산이 많은 문서에 적합합니다.",
  },
  {
    id: "claude-sonnet-5",
    label: "Claude Sonnet 5",
    provider: "anthropic",
    tier: "standard",
    description: "품질과 속도의 균형. 일상적인 견적서·계약서 작성에 적합합니다.",
  },
  {
    id: "claude-haiku-4-5",
    label: "Claude Haiku 4.5",
    provider: "anthropic",
    tier: "economy",
    description: "가장 빠르고 저렴합니다. 단순한 문서나 반복 작업에 적합합니다.",
  },

  // ── GPT (OpenAI) ──
  {
    id: "gpt-5.6-sol",
    label: "GPT-5.6 Sol",
    provider: "openai",
    tier: "premium",
    description: "정확도 최우선. 복잡한 요구사항을 꼼꼼히 반영합니다.",
  },
  {
    id: "gpt-5.6-terra",
    label: "GPT-5.6 Terra",
    provider: "openai",
    tier: "standard",
    description: "품질과 비용의 균형. 대부분의 문서 작성에 적합합니다.",
  },
  {
    id: "gpt-5.6-luna",
    label: "GPT-5.6 Luna",
    provider: "openai",
    tier: "economy",
    description: "비용이 가장 낮습니다. 초안을 빠르게 뽑아볼 때 적합합니다.",
  },

  // ── Gemini (Google) ──
  {
    id: "gemini-3.1-pro-preview",
    label: "Gemini 3.1 Pro",
    provider: "google",
    tier: "premium",
    description: "정확도 최우선. 프리뷰 모델이라 응답이 바뀔 수 있습니다.",
  },
  {
    id: "gemini-3.6-flash",
    label: "Gemini 3.6 Flash",
    provider: "google",
    tier: "standard",
    description: "품질과 속도의 균형. 첨부 파일이 많은 문서에 강합니다.",
  },
  {
    id: "gemini-3.5-flash-lite",
    label: "Gemini 3.5 Flash Lite",
    provider: "google",
    tier: "economy",
    description: "비용이 가장 낮습니다. 초안을 빠르게 뽑아볼 때 적합합니다.",
  },
] as const;

/** 프로바이더별 기본 모델 (환경변수를 지정하지 않았을 때) */
export const DEFAULT_MODELS: Record<
  AiProvider,
  { generate: string; batch: string }
> = {
  anthropic: { generate: "claude-opus-5", batch: "claude-sonnet-5" },
  openai: { generate: "gpt-5.6-sol", batch: "gpt-5.6-terra" },
  google: { generate: "gemini-3.1-pro-preview", batch: "gemini-3.6-flash" },
  mock: { generate: "mock-local", batch: "mock-local" },
};

/**
 * 모델 이름만 보고 프로바이더를 판별한다 (판별 불가면 null).
 * 카탈로그에 없는 모델(환경변수로 지정한 신규 모델)도 접두사로 판별된다.
 */
export function providerOfModel(model: string): AiProvider | null {
  const name = model.trim().toLowerCase();
  if (!name) return null;
  if (name.startsWith("claude")) return "anthropic";
  if (name.startsWith("gemini")) return "google";
  if (name.startsWith("mock")) return "mock";
  if (
    name.startsWith("gpt") ||
    name.startsWith("chatgpt") ||
    /^o\d/.test(name) // o1 · o3 · o4 계열 추론 모델
  ) {
    return "openai";
  }
  return null;
}

/** 카탈로그에서 모델을 찾는다 (없으면 undefined — 선택 검증에 쓴다) */
export function findModel(id: string): AiModelOption | undefined {
  return AI_MODEL_CATALOG.find((option) => option.id === id);
}

/** 표시용 이름 — 카탈로그에 없으면 id 를 그대로 보여준다 */
export function modelLabel(id: string): string {
  return findModel(id)?.label ?? id;
}
