/**
 * `src/lib/document-version.ts` 검증 (네트워크·DB 없이 순수 함수만).
 * 실행: pnpm test:document-version
 *
 * 이 모듈이 틀리는 자리는 하나다 — **v1 의 `rootId` 가 NULL** 이라는 사실을 잊는 것.
 * 묶음 키는 `rootId ?? id` 이므로 v1 은 자기 id 로만 걸리고, Prisma 의 부정 필터는
 * NULL 인 행을 돌려주지 않는다. 실제로 연결 후보 조회가 그 함정에 빠져 후보 38건이
 * 0건으로 나왔다(화면에는 "연결할 수 있는 문서가 없습니다" 만 떴다).
 * 그래서 `unlinkedVersionGroupWhere` 가 NULL 분기를 **명시적으로** 갖고 있는지 본다.
 */

import assert from "node:assert/strict";
import {
  latestVersionsOnly,
  multiVersionRootIds,
  rootIdOf,
  unlinkedVersionGroupWhere,
  versionGroupWhere,
} from "../src/lib/document-version";

let passed = 0;
function check(actual: unknown, expected: unknown, label: string) {
  assert.deepEqual(actual, expected, label);
  passed += 1;
}

// ─────────────────────────── 묶음 키 ───────────────────────────

check(rootIdOf({ id: "v1" }), "v1", "rootId 가 없으면 자기 자신이 뿌리다");
check(rootIdOf({ id: "v2", rootId: null }), "v2", "rootId 가 null 이어도 자기 자신이다");
check(rootIdOf({ id: "v2", rootId: "v1" }), "v1", "후속 버전은 rootId 가 묶음 키다");

check(
  versionGroupWhere("v1"),
  { OR: [{ id: "v1" }, { rootId: "v1" }] },
  "묶음 조회는 뿌리 자신과 그 뿌리를 가리키는 버전을 함께 본다",
);

// ─────────────────────────── 최신본 · 다중 버전 ───────────────────────────

const group = [
  { id: "v1", rootId: null, version: 1 },
  { id: "v2", rootId: "v1", version: 2 },
  { id: "solo", rootId: null, version: 1 },
];

check(
  latestVersionsOnly(group).map((doc) => doc.id),
  ["v2", "solo"],
  "묶음마다 가장 높은 버전만 남는다",
);
check(
  [...multiVersionRootIds(group)],
  ["v1"],
  "버전이 2개 이상인 묶음만 배지 대상이다",
);

// ─────────────────── 연결되지 않은 묶음 조건 (NULL 함정) ───────────────────

check(
  unlinkedVersionGroupWhere([]),
  {},
  "제외할 묶음이 없으면 조건을 붙이지 않는다 — 빈 배열에 부정 필터를 걸지 않는다",
);

const where = unlinkedVersionGroupWhere(["linked-root"]);

check(
  where,
  {
    AND: [
      { id: { notIn: ["linked-root"] } },
      { OR: [{ rootId: null }, { rootId: { notIn: ["linked-root"] } }] },
    ],
  },
  "묶음 제외 조건은 rootId 가 NULL 인 v1 을 명시적으로 통과시킨다",
);

/*
 * 아래는 표현이 아니라 **성질**을 본다 — 조건 모양을 손대도 이 성질이 깨지면 실패한다.
 * `rootId: { notIn: [...] }` 하나만 남기는 회귀(=옛 `NOT` 판)를 막는 자리다.
 */
const rootIdBranch = (where.AND as { OR?: unknown[] }[])[1]?.OR;
assert.ok(
  Array.isArray(rootIdBranch) &&
    rootIdBranch.some(
      (one) => JSON.stringify(one) === JSON.stringify({ rootId: null }),
    ),
  "rootId 조건에는 반드시 `{ rootId: null }` 분기가 있어야 한다 (Prisma 의 부정 필터는 NULL 행을 돌려주지 않는다)",
);
passed += 1;

// 여러 묶음을 제외해도 같은 모양을 유지한다 (배열만 늘어난다)
check(
  unlinkedVersionGroupWhere(["a", "b"]),
  {
    AND: [
      { id: { notIn: ["a", "b"] } },
      { OR: [{ rootId: null }, { rootId: { notIn: ["a", "b"] } }] },
    ],
  },
  "제외 대상이 여러 개여도 조건 모양은 같다",
);

console.log(`document-version: ${passed} checks passed`);
