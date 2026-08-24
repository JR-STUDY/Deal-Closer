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

// ─────────────────── 연결되지 않은 묶음 조건 (NULL · 규모 함정) ───────────────────

/*
 * 이 조건은 두 번 깨졌다. 둘 다 "묶음 키를 목록으로 모아 `notIn` 으로 뺀다" 는 방식
 * 때문이었다 — v1 은 `rootId` 가 NULL 이라 부정 필터에서 사라지고(후보 38건 → 0건),
 * 붙은 문서가 늘면 바인딩 한계를 넘어 쿼리 자체가 죽는다(문서 1,200건에서 P2029).
 * 그래서 여기서 보는 것은 모양이 아니라 **성질**이다: 목록을 받지 않고, 두 방향의
 * 형제를 모두 보고, NULL(v1)을 명시적으로 통과시킨다.
 */
const where = unlinkedVersionGroupWhere();

check(
  where,
  {
    AND: [
      { versions: { none: { opportunityId: { not: null } } } },
      {
        OR: [
          { rootId: null },
          {
            root: {
              opportunityId: null,
              versions: { none: { opportunityId: { not: null } } },
            },
          },
        ],
      },
    ],
  },
  "묶음 조건은 두 방향의 형제를 보고 v1(rootId=null)을 통과시킨다",
);

// 목록을 받지 않는다 — 인자를 받는 순간 호출측이 다시 붙은 문서를 모아 오게 된다
check(
  unlinkedVersionGroupWhere.length,
  0,
  "묶음 조건은 인자를 받지 않는다 (붙은 문서 목록을 만들지 않는다)",
);

// 조건 어디에도 `in`·`notIn` 이 없어야 한다 — 규모에 따라 커지는 조건이 다시 들어오면
// 데이터가 늘었을 때만 터지는 회귀가 되어, 개발용 소량 DB 에서는 눈에 띄지 않는다.
const serialized = JSON.stringify(where);
assert.ok(
  !/"(not)?[iI]n"/.test(serialized),
  "묶음 조건에 in·notIn 목록이 있으면 안 된다 (붙은 문서 수만큼 바인딩이 늘어난다)",
);
passed += 1;

// v1 을 통과시키는 분기가 남아 있는지 — Prisma 의 부정 필터는 NULL 행을 돌려주지 않는다
const rootBranch = (where.AND as { OR?: unknown[] }[])[1]?.OR;
assert.ok(
  Array.isArray(rootBranch) &&
    rootBranch.some(
      (one) => JSON.stringify(one) === JSON.stringify({ rootId: null }),
    ),
  "rootId 조건에는 반드시 `{ rootId: null }` 분기가 있어야 한다",
);
passed += 1;

console.log(`document-version: ${passed} checks passed`);
