/**
 * 지시문 예시("이렇게 말해보세요") — 기본 예시와 내가 더한 예시의 **규칙**.
 *
 * ## 기본 예시는 코드에 있고 지울 수 없다
 *
 * 처음 온 담당자에게 이 화면은 "무엇을 어떻게 적으면 되는지" 를 알려 주는 유일한 단서다.
 * 그래서 기본 예시 셋은 코드에 두고 **삭제·수정 대상에서 뺀다** — 표에 넣으면 지워질 수
 * 있고, 지워진 뒤에는 빈 레일만 남아 새 사람이 배울 곳이 없어진다. 대신 마음에 들지 않으면
 * `복사해서 내 예시로 만들기` 로 가져와 고친다(원본은 남는다).
 *
 * 내가 더한 예시만 `PromptPreset` 표에 담긴다. 그래서 목록은 언제나
 * **기본 셋 + 내 것들** 이고, 화면은 둘을 구분해 그린다(고칠 수 있는 것과 없는 것을
 * 같게 보여 주면 왜 어떤 것은 × 가 없는지 알 수 없다).
 *
 * ## 조직 단위다
 *
 * `EmailTemplate` 의 팀 공용 프리셋과 같은 판단이다 — 예시 지시문은 "우리 팀이 이렇게
 * 쓴다" 는 관행이라 사람마다 따로 쌓을 이유가 없다. MVP 에는 인증이 없어(`session.ts` 가
 * 데모 사용자 1명 고정) 소유자를 나눌 주체도 없다. 개인 프리셋이 필요해지면
 * `EmailTemplate.ownerId` 처럼 옵셔널 소유자를 더하는 것이 다음 단계다.
 *
 * server-only 를 import 하지 않는다 — 화면(레일·관리 다이얼로그)과 서버(라우트)가 같은
 * 검증을 지나야 "화면에서만 막은 것" 이 되지 않는다.
 */

/** 지시문 한 건의 길이 상한 — 지시문 입력칸(`MAX_LENGTH`)과 같은 값이어야 한다 */
export const PROMPT_PRESET_MAX_LENGTH = 2000;

/**
 * 내가 더할 수 있는 예시의 최대 개수.
 *
 * 레일은 좁고 스크롤 없이 곁눈질하는 자리다. 스무 개가 넘으면 목록에서 찾는 것이
 * 지시문을 직접 적는 것보다 느려진다 — 그때는 예시가 아니라 표준 양식으로 만들 일이다.
 */
export const PROMPT_PRESET_MAX_COUNT = 20;

/**
 * 폴더를 첨부하고 이 지시문을 그대로 쓰면 데모 일괄 변환 화면으로 넘어간다.
 *
 * 기본 예시의 하나이면서 동시에 **동작을 트리거하는 문자열**이라 여기 둔다 — 화면과
 * 트리거 판정이 각자 문자열을 들고 있으면 한쪽만 고쳤을 때 예시를 눌러도 아무 일이
 * 일어나지 않는다. (`/api/generate/batch` 는 아직 목업이다 — AGENTS.md MVP 범위 참고)
 */
export const FOLDER_SCENARIO_PROMPT =
  "이전에 쓰던 견적서 양식을 첨부해, 같은 형식으로 새로 만들어줘 (파일 첨부)";

/** 기본 예시 — 코드에 있고 지울 수 없다 */
export const DEFAULT_PROMPT_PRESETS: readonly string[] = [
  "A사에 서버 인스턴스 5대와 유지보수 1년 포함한 견적서",
  "협력사 견적서 기준으로 마진 20%를 붙인 견적서 (파일 첨부)",
  FOLDER_SCENARIO_PROMPT,
];

/** 화면이 그리는 예시 한 줄 — 기본 예시는 id 가 없다(고칠 대상이 아니므로) */
export type PromptPresetItem =
  | { kind: "default"; text: string }
  | { kind: "custom"; id: string; text: string };

/** 저장된 내 예시 (DTO) */
export type PromptPresetDTO = { id: string; text: string; sortOrder: number };

/** 기본 예시 + 내 예시를 화면 순서대로 — 기본이 먼저다(배우는 순서) */
export function promptPresetItems(
  custom: readonly PromptPresetDTO[],
): PromptPresetItem[] {
  return [
    ...DEFAULT_PROMPT_PRESETS.map((text) => ({ kind: "default" as const, text })),
    ...[...custom]
      .sort((a, b) => a.sortOrder - b.sortOrder || a.id.localeCompare(b.id))
      .map((preset) => ({ kind: "custom" as const, id: preset.id, text: preset.text })),
  ];
}

/** 검증 결과 — 통과하면 저장할 값을, 아니면 사람이 읽는 이유를 준다 */
export type PromptPresetParse =
  | { ok: true; text: string }
  | { ok: false; error: string };

/**
 * 예시 한 건을 검증·정규화한다.
 *
 * 줄바꿈은 살린다(여러 줄 지시문이 있다) — 대신 **앞뒤 공백만** 걷어낸다.
 * 기본 예시와 똑같은 문장은 거절한다: 레일에 같은 줄이 두 번 뜨면 어느 것을 눌러야
 * 하는지 알 수 없고, 지울 수 있는 것과 없는 것이 구분되지 않는다.
 */
export function parsePromptPreset(
  raw: unknown,
  options: { existing?: readonly string[] } = {},
): PromptPresetParse {
  const text = typeof raw === "string" ? raw.trim() : "";
  if (!text) return { ok: false, error: "예시 문구를 입력해 주세요." };
  if (text.length > PROMPT_PRESET_MAX_LENGTH) {
    return {
      ok: false,
      error: `예시는 ${PROMPT_PRESET_MAX_LENGTH.toLocaleString("ko-KR")}자까지 저장할 수 있습니다.`,
    };
  }
  if (DEFAULT_PROMPT_PRESETS.some((preset) => preset === text)) {
    return { ok: false, error: "기본 예시와 같은 문구입니다. 기본 예시는 이미 목록에 있습니다." };
  }
  if ((options.existing ?? []).some((existing) => existing === text)) {
    return { ok: false, error: "이미 같은 예시가 있습니다." };
  }
  return { ok: true, text };
}

/** 더 담을 수 있는지 — 화면(추가 버튼)과 서버(POST)가 같은 판정을 쓴다 */
export function canAddPromptPreset(count: number): boolean {
  return count < PROMPT_PRESET_MAX_COUNT;
}

/** 상한을 넘겼을 때의 안내 문구 (화면·서버 공용) */
export const PROMPT_PRESET_LIMIT_MESSAGE =
  `예시는 ${PROMPT_PRESET_MAX_COUNT}개까지 저장할 수 있습니다. 쓰지 않는 예시를 지우고 다시 추가해 주세요.`;

/** 새 예시가 목록 끝에 붙도록 다음 순서를 정한다 */
export function nextPromptPresetOrder(custom: readonly PromptPresetDTO[]): number {
  return custom.reduce((max, preset) => Math.max(max, preset.sortOrder), 0) + 1;
}
