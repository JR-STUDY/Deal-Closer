/**
 * 기회 부분 수정 병합 검증 — `withOpportunityDefaults()` (네트워크·DB 없이 순수 함수만).
 * 실행: pnpm test:opportunity-patch
 *
 * 인라인 실시간 수정(기회-7)은 **고친 필드 하나만** 보낸다. 이 병합이 어긋나면 한 칸을 고쳤을
 * 뿐인데 다른 칸이 비워지는 사고가 난다. 그래서 다음 두 가지를 집중적으로 본다.
 *  ① 보내지 않은 키는 현재 값이 그대로 남는가
 *  ② **빈 문자열은 "비움"이라는 뜻**이라 현재 값으로 덮이지 않는가 (키 존재 여부로만 판단)
 * 병합 결과가 `parseOpportunityInput()` 을 그대로 통과하는지도 함께 확인해, 다이얼로그 저장과
 * 인라인 저장의 제약이 갈라지지 않게 한다.
 */

import assert from "node:assert/strict";
import {
  parseOpportunityInput,
  withOpportunityDefaults,
  type OpportunityCurrentValues,
} from "../src/lib/opportunity";

let checks = 0;
function check(actual: unknown, expected: unknown, message: string) {
  assert.deepEqual(actual, expected, message);
  checks += 1;
}

/** 현재 저장된 값 (합성 데이터) */
const CURRENT: OpportunityCurrentValues = {
  accountId: "acc_1",
  ownerId: "user_1",
  name: "2026 그룹웨어 도입",
  expectedAmount: 12_000_000,
  expectedCloseDate: new Date(2026, 8, 30), // 2026-09-30 (로컬 자정)
  memo: "1차 미팅 완료",
};

/** 마감일·메모가 비어 있는 경우 */
const CURRENT_EMPTY: OpportunityCurrentValues = {
  ...CURRENT,
  expectedCloseDate: null,
  memo: null,
};

// ─────────────────── 빈 본문 — 무엇도 바뀌지 않는다 ───────────────────
check(
  withOpportunityDefaults({}, CURRENT),
  {
    accountId: "acc_1",
    ownerId: "user_1",
    name: "2026 그룹웨어 도입",
    expectedAmount: 12_000_000,
    expectedCloseDate: "2026-09-30",
    memo: "1차 미팅 완료",
  },
  "빈 본문은 현재 값을 그대로 돌려준다",
);

check(
  withOpportunityDefaults({}, CURRENT_EMPTY),
  {
    accountId: "acc_1",
    ownerId: "user_1",
    name: "2026 그룹웨어 도입",
    expectedAmount: 12_000_000,
    expectedCloseDate: "",
    memo: "",
  },
  "비어 있던 마감일·메모는 빈 문자열로 옮겨진다 (폼 값 형식)",
);

// ─────────────────── 한 필드만 보낸다 — 나머지는 유지 ───────────────────
const BASELINE = withOpportunityDefaults({}, CURRENT);

for (const [key, value, label] of [
  ["name", "2026 그룹웨어 도입(수정)", "기회명"],
  ["accountId", "acc_2", "거래처"],
  ["ownerId", "user_2", "영업 담당자"],
  ["expectedAmount", "9,900,000", "예상 금액"],
  ["expectedCloseDate", "2026-12-31", "예상 마감일"],
  ["memo", "결재 라인 확인 필요", "메모"],
] as const) {
  const merged = withOpportunityDefaults({ [key]: value }, CURRENT);
  check(merged[key], value, `${label} 만 보내면 그 값이 반영된다`);
  check(
    Object.entries(merged).filter(([k]) => k !== key),
    Object.entries(BASELINE).filter(([k]) => k !== key),
    `${label} 을 고쳐도 나머지 필드는 현재 값 그대로다`,
  );
}

// ────────────── 빈 문자열은 "비움" — 현재 값으로 덮이지 않는다 ──────────────
check(
  withOpportunityDefaults({ expectedCloseDate: "" }, CURRENT).expectedCloseDate,
  "",
  "마감일을 비우면 현재 값으로 되돌아가지 않는다",
);
check(
  withOpportunityDefaults({ memo: "" }, CURRENT).memo,
  "",
  "메모를 비우면 현재 값으로 되돌아가지 않는다",
);
check(
  withOpportunityDefaults({ expectedAmount: "" }, CURRENT).expectedAmount,
  "",
  "금액을 비우면 현재 값으로 되돌아가지 않는다 (0원으로 저장된다)",
);

// ─────────── 정의 밖 키는 무시한다 (본문에 무엇이 오든 모양은 고정) ───────────
check(
  Object.keys(
    withOpportunityDefaults(
      { stage: "WON", id: "opp_x", orgId: "org_x" },
      CURRENT,
    ),
  ).sort(),
  [
    "accountId",
    "expectedAmount",
    "expectedCloseDate",
    "memo",
    "name",
    "ownerId",
  ],
  "stage·id·orgId 같은 키는 병합 결과에 섞이지 않는다",
);

// ─────────── 병합 결과는 기존 검증 함수를 그대로 통과한다 ───────────
const parsedFull = parseOpportunityInput(
  withOpportunityDefaults({ memo: "" }, CURRENT),
);
assert.ok(!("error" in parsedFull), "메모를 비운 병합 결과는 검증을 통과한다");
checks += 1;
check(parsedFull.memo, null, "빈 메모는 null 로 저장된다");
check(
  parsedFull.expectedCloseDate?.getFullYear(),
  2026,
  "마감일은 로컬 기준 Date 로 되살아난다",
);
check(parsedFull.expectedAmount, 12_000_000, "금액은 현재 값이 유지된다");

const parsedAmount = parseOpportunityInput(
  withOpportunityDefaults({ expectedAmount: "9,900,000" }, CURRENT),
);
assert.ok(
  !("error" in parsedAmount),
  "금액만 고친 병합 결과도 검증을 통과한다",
);
checks += 1;
check(
  parsedAmount.expectedAmount,
  9_900_000,
  "구분 기호가 섞여도 정수로 좁힌다",
);

// 필수 값을 지우려는 요청은 (다이얼로그 저장과 똑같이) 거부돼야 한다
const parsedBlankName = parseOpportunityInput(
  withOpportunityDefaults({ name: "   " }, CURRENT),
);
check(
  "error" in parsedBlankName,
  true,
  "기회명을 공백으로 비우면 인라인 저장도 거부된다",
);

console.log(`\nopportunity-patch: ${checks}건 검증 통과`);
