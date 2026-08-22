/**
 * 지시문 예시 프리셋 규칙 검증 (DB 없이 실행).
 *
 * 지키려는 경계는 셋이다.
 *  ① **기본 예시는 목록에서 사라지지 않는다** — 내 예시가 없어도, 많아도 앞에 그대로 있다.
 *  ② **같은 문구가 두 번 뜨지 않는다** — 기본 예시와 같은 것도, 내 것끼리도.
 *  ③ **화면과 서버가 같은 판정을 쓴다** — 개수 상한·길이 상한이 한 함수에서 나온다.
 */

import {
  DEFAULT_PROMPT_PRESETS,
  FOLDER_SCENARIO_PROMPT,
  PROMPT_PRESET_MAX_COUNT,
  PROMPT_PRESET_MAX_LENGTH,
  canAddPromptPreset,
  nextPromptPresetOrder,
  parsePromptPreset,
  promptPresetItems,
  type PromptPresetDTO,
} from "../src/lib/prompt-preset";

let checks = 0;
let failed = 0;

function check(label: string, actual: unknown, expected: unknown) {
  checks += 1;
  const a = JSON.stringify(actual);
  const e = JSON.stringify(expected);
  if (a !== e) {
    failed += 1;
    console.error(`  ✗ ${label}\n      기대: ${e}\n      실제: ${a}`);
  }
}

const preset = (id: string, text: string, sortOrder: number): PromptPresetDTO => ({
  id,
  text,
  sortOrder,
});

// ─────────────────── ① 기본 예시는 언제나 목록 앞에 있다 ───────────────────

check("내 예시가 없으면 기본 셋만", promptPresetItems([]).length, DEFAULT_PROMPT_PRESETS.length);
check(
  "기본 예시는 kind=default",
  promptPresetItems([]).every((item) => item.kind === "default"),
  true,
);
check(
  "기본 예시 순서는 코드 순서 그대로",
  promptPresetItems([]).map((item) => item.text),
  [...DEFAULT_PROMPT_PRESETS],
);

const mine = [preset("b", "두 번째", 2), preset("a", "첫 번째", 1)];
const items = promptPresetItems(mine);
check("내 예시는 기본 뒤에 붙는다", items.length, DEFAULT_PROMPT_PRESETS.length + 2);
check(
  "내 예시는 sortOrder 순서다",
  items.slice(DEFAULT_PROMPT_PRESETS.length).map((item) => item.text),
  ["첫 번째", "두 번째"],
);
check(
  "sortOrder 가 같으면 id 로 안정 정렬한다",
  promptPresetItems([preset("z", "지", 1), preset("a", "에이", 1)])
    .slice(DEFAULT_PROMPT_PRESETS.length)
    .map((item) => item.text),
  ["에이", "지"],
);
check(
  "내 예시에는 id 가 있다 — 고칠 대상이므로",
  items.slice(DEFAULT_PROMPT_PRESETS.length).every((item) => item.kind === "custom" && item.id),
  true,
);
// 원본 배열을 건드리면 서버 컴포넌트가 넘긴 값이 렌더 중에 바뀐다
check("입력 배열을 정렬하지 않는다", mine.map((p) => p.id), ["b", "a"]);

// ─────────────────── ② 같은 문구가 두 번 뜨지 않는다 ───────────────────

check("빈 문구 거절", parsePromptPreset(""), {
  ok: false,
  error: "예시 문구를 입력해 주세요.",
});
check("공백만 있는 문구 거절", parsePromptPreset("   \n  ").ok, false);
check("문자열이 아니면 거절", parsePromptPreset(undefined).ok, false);
check("앞뒤 공백은 걷어낸다", parsePromptPreset("  견적서 만들어줘  "), {
  ok: true,
  text: "견적서 만들어줘",
});
// 여러 줄 지시문이 있다 — 줄바꿈을 지우면 문장이 붙어 버린다
check(
  "가운데 줄바꿈은 살린다",
  parsePromptPreset("첫 줄\n둘째 줄"),
  { ok: true, text: "첫 줄\n둘째 줄" },
);

check(
  "기본 예시와 같은 문구는 거절",
  parsePromptPreset(DEFAULT_PROMPT_PRESETS[0]).ok,
  false,
);
check(
  "기본 예시와 같은 문구를 공백만 붙여 우회할 수 없다",
  parsePromptPreset(`  ${FOLDER_SCENARIO_PROMPT}  `).ok,
  false,
);
check(
  "내 예시끼리 중복도 거절",
  parsePromptPreset("있는 예시", { existing: ["있는 예시"] }).ok,
  false,
);
check(
  "다른 문구는 통과",
  parsePromptPreset("새 예시", { existing: ["있는 예시"] }),
  { ok: true, text: "새 예시" },
);
// 수정 경로는 자기 자신을 existing 에서 빼고 부른다 — 문구를 그대로 두고 저장할 수 있어야 한다
check(
  "자기 자신을 뺀 목록이면 같은 문구로 저장된다",
  parsePromptPreset("있는 예시", { existing: [] }).ok,
  true,
);

// ─────────────────── ③ 상한은 한 함수에서 나온다 ───────────────────

check("길이 상한까지는 통과", parsePromptPreset("가".repeat(PROMPT_PRESET_MAX_LENGTH)).ok, true);
check("길이 상한을 넘으면 거절", parsePromptPreset("가".repeat(PROMPT_PRESET_MAX_LENGTH + 1)).ok, false);
// 지시문 입력칸과 같은 값이어야 한다 — 다르면 붙여넣고 저장할 수 없는 예시가 생긴다
check("길이 상한은 지시문 입력칸과 같다", PROMPT_PRESET_MAX_LENGTH, 2000);

check("빈 목록이면 추가할 수 있다", canAddPromptPreset(0), true);
check("상한 직전이면 추가할 수 있다", canAddPromptPreset(PROMPT_PRESET_MAX_COUNT - 1), true);
check("상한이면 추가할 수 없다", canAddPromptPreset(PROMPT_PRESET_MAX_COUNT), false);
check("상한을 넘겼어도 추가할 수 없다", canAddPromptPreset(PROMPT_PRESET_MAX_COUNT + 5), false);

check("첫 예시의 순서는 1", nextPromptPresetOrder([]), 1);
check(
  "새 예시는 목록 끝에 붙는다",
  nextPromptPresetOrder([preset("a", "가", 3), preset("b", "나", 7)]),
  8,
);
// 지우고 다시 담아도 순서가 앞으로 끼어들지 않는다
check(
  "가운데를 지워도 다음 순서는 최댓값 + 1",
  nextPromptPresetOrder([preset("a", "가", 1), preset("c", "다", 9)]),
  10,
);

if (failed > 0) {
  console.error(`\nprompt-preset: ${failed}건 실패 / ${checks}건`);
  process.exit(1);
}
console.log(`prompt-preset: ${checks}건 검증 통과`);
