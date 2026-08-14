/**
 * `src/lib/opportunity-sort.ts` 검증 (네트워크·DB 없이 순수 함수만).
 * 실행: pnpm test:opportunity-sort
 *
 * 지켜야 할 것을 집중적으로 본다 (2차 피드백 14 · 15) —
 * ① 기본은 최근 수정일 내림차순 · ② 모르는 값이 와도 안전하게 떨어진다 ·
 * ③ 같은 컬럼을 두 번 누르면 원래대로 돌아온다 · ④ 정렬을 바꾸면 page 가 1로 되돌아간다 ·
 * ⑤ 검색·필터는 그대로 실려 간다 · ⑥ 마감일 미정(null)은 어느 방향이든 뒤로 간다.
 */

import assert from "node:assert/strict";
import {
  DEFAULT_OPPORTUNITY_SORT,
  OPPORTUNITY_SORT_KEYS,
  SORT_DIR_PARAM,
  SORT_PARAM,
  isDefaultOpportunitySort,
  isOpportunitySortKey,
  nextOpportunitySort,
  opportunityOrderBy,
  opportunitySortHref,
  opportunitySortParams,
  parseOpportunitySort,
  sortStateOf,
  type OpportunitySort,
  type OpportunitySortKey,
} from "../src/lib/opportunity-sort";

let checks = 0;
function check(actual: unknown, expected: unknown, message: string) {
  assert.deepEqual(actual, expected, message);
  checks += 1;
}

const LIST = "/opportunities";
/** 검색·필터가 걸린 상태 (정렬을 바꿔도 그대로 실려 가야 한다) */
const FILTERED = { q: "테크", stage: "PROPOSAL", owner: "user_1" };

// ────────────────────────── 정렬 가능한 컬럼 ──────────────────────────
// 자연스러운 순서가 있는 값만 연다. 단계·영업 담당자는 필터가 맡는다.
check(
  [...OPPORTUNITY_SORT_KEYS],
  ["updatedAt", "name", "account", "amount", "closeDate"],
  "정렬 가능한 컬럼은 다섯 개다",
);
for (const key of ["stage", "owner", "ownerId", "actions", ""]) {
  check(isOpportunitySortKey(key), false, `"${key}" 는 정렬 키가 아니다`);
}
for (const key of OPPORTUNITY_SORT_KEYS) {
  check(isOpportunitySortKey(key), true, `"${key}" 는 정렬 키다`);
}

// ────────────────────────── parseOpportunitySort ──────────────────────────
// 기본은 최근 수정일 내림차순 (2차 피드백 14)
check(
  DEFAULT_OPPORTUNITY_SORT,
  { key: "updatedAt", direction: "desc" },
  "기본 정렬: 최근 수정일 내림차순",
);
for (const params of [
  {},
  { sort: undefined, dir: undefined },
  { sort: null, dir: null },
  { sort: "", dir: "" },
  { sort: "   ", dir: "asc" },
  { sort: "stage", dir: "asc" }, // 정렬을 열지 않은 컬럼
  { sort: "owner", dir: "desc" },
  { sort: "expectedAmount", dir: "asc" }, // DB 필드명은 정렬 키가 아니다
  { sort: "DROP TABLE", dir: "asc" },
]) {
  check(
    parseOpportunitySort(params),
    DEFAULT_OPPORTUNITY_SORT,
    `모르는 키(${JSON.stringify(params)})는 기본 정렬로 떨어진다`,
  );
}

check(
  parseOpportunitySort({ sort: "amount", dir: "asc" }),
  { key: "amount", direction: "asc" },
  "키·방향이 모두 유효하면 그대로 쓴다",
);
check(
  parseOpportunitySort({ sort: " name ", dir: " DESC " }),
  { key: "name", direction: "desc" },
  "공백·대문자는 다듬어 읽는다",
);

// 키는 맞고 방향만 이상하면 → 그 컬럼의 **기본 방향**으로 본다 (빈 화면 대신 납득할 순서)
check(
  parseOpportunitySort({ sort: "amount", dir: "up" }),
  { key: "amount", direction: "desc" },
  "금액의 기본 방향은 내림차순(큰 금액 먼저)",
);
check(
  parseOpportunitySort({ sort: "closeDate", dir: "" }),
  { key: "closeDate", direction: "asc" },
  "마감일의 기본 방향은 오름차순(임박한 것 먼저)",
);
check(
  parseOpportunitySort({ sort: "name", dir: "?" }),
  { key: "name", direction: "asc" },
  "기회명의 기본 방향은 오름차순(가나다)",
);
check(
  parseOpportunitySort({ sort: "account", dir: "1" }),
  { key: "account", direction: "asc" },
  "거래처의 기본 방향은 오름차순",
);
check(
  parseOpportunitySort({ sort: "updatedAt", dir: "x" }),
  { key: "updatedAt", direction: "desc" },
  "최근 수정일의 기본 방향은 내림차순",
);

// ────────────────────────── nextOpportunitySort ──────────────────────────
// 같은 컬럼: 방향만 뒤집는다 → 두 번 누르면 원래대로 (되돌릴 수 없으면 안 된다)
for (const key of OPPORTUNITY_SORT_KEYS) {
  const first = parseOpportunitySort({ sort: key });
  const flipped = nextOpportunitySort(first, key);
  check(
    flipped.direction,
    first.direction === "asc" ? "desc" : "asc",
    `${key}: 같은 컬럼을 누르면 방향이 뒤집힌다`,
  );
  check(
    nextOpportunitySort(flipped, key),
    first,
    `${key}: 두 번 누르면 원래 상태로 돌아온다`,
  );
}

// 다른 컬럼: 그 컬럼의 기본 방향으로 (직전 방향을 물려받지 않는다)
check(
  nextOpportunitySort({ key: "name", direction: "desc" }, "amount"),
  { key: "amount", direction: "desc" },
  "다른 컬럼으로 옮기면 그 컬럼의 기본 방향",
);
check(
  nextOpportunitySort({ key: "amount", direction: "asc" }, "closeDate"),
  { key: "closeDate", direction: "asc" },
  "마감일로 옮기면 오름차순(임박한 것 먼저)",
);
check(
  nextOpportunitySort({ key: "closeDate", direction: "desc" }, "updatedAt"),
  DEFAULT_OPPORTUNITY_SORT,
  "최근 수정일로 돌아오면 기본 정렬과 같아진다",
);

// ────────────────────────── sortStateOf (aria-sort) ──────────────────────────
const byAmountAsc: OpportunitySort = { key: "amount", direction: "asc" };
check(sortStateOf(byAmountAsc, "amount"), "asc", "정렬 중인 칸만 방향을 알린다");
for (const key of OPPORTUNITY_SORT_KEYS.filter((k) => k !== "amount")) {
  check(sortStateOf(byAmountAsc, key), "none", `${key}: 정렬 중이 아니다`);
}

// ────────────────────── 파라미터 — 기본 정렬은 주소에 남기지 않는다 ──────────────────────
check(
  isDefaultOpportunitySort(DEFAULT_OPPORTUNITY_SORT),
  true,
  "기본 정렬 판정",
);
check(
  isDefaultOpportunitySort({ key: "updatedAt", direction: "asc" }),
  false,
  "같은 키라도 방향이 다르면 기본이 아니다",
);
check(
  opportunitySortParams(DEFAULT_OPPORTUNITY_SORT),
  { [SORT_PARAM]: "", [SORT_DIR_PARAM]: "" },
  "기본 정렬이면 빈 값 → 주소에서 지워진다",
);
check(
  opportunitySortParams(byAmountAsc),
  { [SORT_PARAM]: "amount", [SORT_DIR_PARAM]: "asc" },
  "기본이 아니면 키·방향을 싣는다",
);

// ────────────────────── opportunitySortHref — page 리셋 · 필터 보존 ──────────────────────
check(
  opportunitySortHref(LIST, {}, DEFAULT_OPPORTUNITY_SORT),
  LIST,
  "기본 정렬 + 조건 없음 → 주소가 깨끗하다",
);
check(
  opportunitySortHref(LIST, {}, byAmountAsc),
  `${LIST}?sort=amount&dir=asc`,
  "정렬만 걸리면 sort·dir 만 남는다",
);

// 3쪽에서 정렬을 바꾸면 1쪽으로 (page 파라미터가 사라진다)
check(
  opportunitySortHref(
    LIST,
    { ...FILTERED, page: "3" },
    { key: "name", direction: "asc" },
  ),
  `${LIST}?q=%ED%85%8C%ED%81%AC&stage=PROPOSAL&owner=user_1&sort=name&dir=asc`,
  "정렬을 바꾸면 page 가 사라지고 검색·필터는 그대로 실린다",
);

// 이미 다른 정렬이 걸린 주소에서 눌러도 새 값이 덮어쓴다 (같은 키가 두 번 남지 않는다)
const currentQuery = {
  ...FILTERED,
  ...opportunitySortParams({ key: "amount", direction: "desc" }),
  page: "5",
};
check(
  opportunitySortHref(LIST, currentQuery, { key: "amount", direction: "asc" }),
  `${LIST}?q=%ED%85%8C%ED%81%AC&stage=PROPOSAL&owner=user_1&sort=amount&dir=asc`,
  "같은 컬럼을 다시 눌러 방향을 뒤집어도 파라미터는 하나뿐이다",
);
check(
  opportunitySortHref(LIST, currentQuery, DEFAULT_OPPORTUNITY_SORT),
  `${LIST}?q=%ED%85%8C%ED%81%AC&stage=PROPOSAL&owner=user_1`,
  "기본 정렬로 돌아오면 sort·dir 이 주소에서 사라진다",
);

// 보기(view)는 정렬과 무관하게 유지된다 — 칸반에서 돌아와도 같은 정렬을 본다
check(
  opportunitySortHref(LIST, { view: "board" }, byAmountAsc),
  `${LIST}?view=board&sort=amount&dir=asc`,
  "보기 파라미터는 그대로 실려 간다",
);

// ────────────────────────── opportunityOrderBy ──────────────────────────
check(
  opportunityOrderBy(DEFAULT_OPPORTUNITY_SORT),
  [{ updatedAt: "desc" }, { id: "asc" }],
  "기본 정렬: 최근 수정일 내림차순 + id 안정화",
);
check(
  opportunityOrderBy({ key: "updatedAt", direction: "asc" }),
  [{ updatedAt: "asc" }, { id: "asc" }],
  "최근 수정일 기준일 때 같은 필드를 두 번 얹지 않는다",
);
check(
  opportunityOrderBy({ key: "name", direction: "asc" }),
  [{ name: "asc" }, { updatedAt: "desc" }, { id: "asc" }],
  "기회명: 같은 이름끼리는 최근 수정 순 → id 순",
);
check(
  opportunityOrderBy({ key: "account", direction: "desc" }),
  [{ account: { companyName: "desc" } }, { updatedAt: "desc" }, { id: "asc" }],
  "거래처: 관계 필드(회사명)로 정렬한다",
);
check(
  opportunityOrderBy({ key: "amount", direction: "desc" }),
  [{ expectedAmount: "desc" }, { updatedAt: "desc" }, { id: "asc" }],
  "예상 금액: 큰 금액 먼저",
);

// 마감일 미정(null)은 **어느 방향이든** 뒤로 — 방향을 뒤집었다고 값 없는 행이 올라오면
// 정렬을 건 사람이 보려던 것(가장 늦은 마감일)이 아래로 밀린다.
for (const direction of ["asc", "desc"] as const) {
  check(
    opportunityOrderBy({ key: "closeDate", direction }),
    [
      { expectedCloseDate: { sort: direction, nulls: "last" } },
      { updatedAt: "desc" },
      { id: "asc" },
    ],
    `예상 마감일(${direction}): 미정은 항상 뒤로`,
  );
}

// 어떤 정렬이든 마지막 기준은 id — 페이지를 넘길 때 같은 행이 두 번 나오거나 빠지지 않는다
for (const key of OPPORTUNITY_SORT_KEYS) {
  for (const direction of ["asc", "desc"] as const) {
    const orderBy = opportunityOrderBy({ key, direction });
    check(
      orderBy[orderBy.length - 1],
      { id: "asc" },
      `${key}/${direction}: 마지막 정렬 기준은 id`,
    );
  }
}

// 주소 왕복 — 머리글을 눌러 만든 주소를 다시 읽으면 같은 상태가 나온다
for (const key of OPPORTUNITY_SORT_KEYS) {
  for (const direction of ["asc", "desc"] as const) {
    const sort: OpportunitySort = { key, direction };
    const params = opportunitySortParams(sort);
    check(
      parseOpportunitySort({
        sort: params[SORT_PARAM],
        dir: params[SORT_DIR_PARAM],
      }),
      sort,
      `${key}/${direction}: 주소로 나갔다 돌아와도 같은 상태`,
    );
  }
}

// 정렬 키 목록은 읽기 전용이어야 한다 (화면이 실수로 늘리지 못하게)
const keys: readonly OpportunitySortKey[] = OPPORTUNITY_SORT_KEYS;
check(keys.length, 5, "정렬 키는 다섯 개로 고정");

console.log(`opportunity-sort: ${checks}건 검증 통과`);
