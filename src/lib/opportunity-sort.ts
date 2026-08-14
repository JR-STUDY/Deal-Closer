/**
 * 기회 목록 정렬 — 순수 함수 (2차 피드백 14 · 15).
 *
 * 정렬 상태는 **URL 쿼리(`?sort=&dir=`)** 로만 주고받는다 — 검색·필터·페이지와 같은 방식이라
 * 새로고침·뒤로가기·주소 공유가 그대로 되고, 서버 컴포넌트가 조회 조건으로 바로 쓴다
 * (`@/lib/pagination` 과 같은 설계).
 *
 * DB 에 접근하지 않고 `server-only` 도 import 하지 않으므로 서버 컴포넌트·API 라우트·표 머리글
 * 어디서든 쓴다. Prisma 타입은 `import type` 으로만 참조한다.
 *
 * **정렬을 바꾸면 page 를 1로 되돌린다** (`nextListSearch` 와 같은 규칙) — 3쪽에 머문 채
 * 정렬만 바꾸면 보고 있던 행과 무관한 구간이 뜬다. 되돌리는 자리는 `opportunitySortHref`
 * 한 곳이다.
 */

import type { Prisma } from "@/generated/prisma/client";
import { pageHref } from "./pagination";

/** 정렬 키를 담는 쿼리 키 */
export const SORT_PARAM = "sort";
/** 정렬 방향을 담는 쿼리 키 */
export const SORT_DIR_PARAM = "dir";

/**
 * 정렬할 수 있는 컬럼.
 *
 * **자연스러운 순서가 있는 값만 연다.** 단계(stage)는 DB 가 String 이라 정렬하면
 * 파이프라인 순서가 아니라 알파벳 순으로 서고(초기 → 제안 → 검토/협상 …이 아니다),
 * 순서를 SQL 로 표현하려면 SQLite 에 CASE 를 직접 써야 한다 — 게다가 단계는 이미 툴바
 * 필터가 더 정확히 해결한다. 영업 담당자도 같은 이유로 필터가 맡는다(사람 이름 가나다순은
 * 목록을 훑는 목적에 보탬이 되지 않는다). 관리(⋯) 칸은 값이 아니다.
 */
export const OPPORTUNITY_SORT_KEYS = [
  "updatedAt",
  "name",
  "account",
  "amount",
  "closeDate",
] as const;

export type OpportunitySortKey = (typeof OPPORTUNITY_SORT_KEYS)[number];
export type SortDirection = "asc" | "desc";
export type OpportunitySort = {
  key: OpportunitySortKey;
  direction: SortDirection;
};

/**
 * 기본 정렬 — **최근 수정일 내림차순** (2차 피드백 14).
 * 손을 댄 기회가 위로 온다. 예전 기본값(예상 마감일 오름차순)은 마감일을 비워 둔 기회를
 * 통째로 뒤로 밀어, 방금 만든 기회가 목록에서 보이지 않았다.
 */
export const DEFAULT_OPPORTUNITY_SORT: OpportunitySort = {
  key: "updatedAt",
  direction: "desc",
};

/**
 * 그 컬럼을 **처음 눌렀을 때**의 방향.
 * 날짜·금액은 "큰 것/최근 것 먼저"가, 이름은 가나다순이 사람이 기대하는 첫 결과다.
 * 마감일만 오름차순인데, 마감일에서 알고 싶은 것은 "임박한 것"이기 때문이다.
 */
const FIRST_DIRECTION: Record<OpportunitySortKey, SortDirection> = {
  updatedAt: "desc",
  name: "asc",
  account: "asc",
  amount: "desc",
  closeDate: "asc",
};

/** 정렬 키인지 (URL 을 손으로 고쳐도 깨지지 않게) */
export function isOpportunitySortKey(
  value: string,
): value is OpportunitySortKey {
  return (OPPORTUNITY_SORT_KEYS as readonly string[]).includes(value);
}

/**
 * URL 쿼리(`?sort=&dir=`) → 정렬 상태.
 *
 * 모르는 키는 기본 정렬로 떨어뜨리고, 방향만 이상하면 그 컬럼의 기본 방향으로 본다 —
 * 주소를 손으로 고치거나 오래된 링크를 열어도 빈 화면이 아니라 납득할 순서가 나온다.
 */
export function parseOpportunitySort(params: {
  sort?: string | null;
  dir?: string | null;
}): OpportunitySort {
  const key = params.sort?.trim() ?? "";
  if (!isOpportunitySortKey(key)) return DEFAULT_OPPORTUNITY_SORT;

  const dir = params.dir?.trim().toLowerCase() ?? "";
  const direction: SortDirection =
    dir === "asc" || dir === "desc" ? dir : FIRST_DIRECTION[key];
  return { key, direction };
}

/**
 * 머리글을 눌렀을 때의 다음 정렬 상태.
 * 같은 컬럼을 다시 누르면 방향만 뒤집고, 다른 컬럼이면 그 컬럼의 기본 방향으로 간다.
 * (누를 때마다 방향이 무작위로 바뀌면 두 번 눌러 원래대로 되돌릴 수 없다)
 */
export function nextOpportunitySort(
  current: OpportunitySort,
  key: OpportunitySortKey,
): OpportunitySort {
  if (current.key === key) {
    return { key, direction: current.direction === "asc" ? "desc" : "asc" };
  }
  return { key, direction: FIRST_DIRECTION[key] };
}

/** 기본 정렬 그대로인지 (주소에 파라미터를 남길지 판단) */
export function isDefaultOpportunitySort(sort: OpportunitySort): boolean {
  return (
    sort.key === DEFAULT_OPPORTUNITY_SORT.key &&
    sort.direction === DEFAULT_OPPORTUNITY_SORT.direction
  );
}

/**
 * 정렬 상태를 URL 파라미터로. **기본 정렬이면 빈 값**이라 주소에 남지 않는다
 * (1페이지에서 `?page=` 를 지우는 것과 같은 이유 — 기본 상태의 주소가 지저분해지지 않는다).
 */
export function opportunitySortParams(
  sort: OpportunitySort,
): Record<string, string> {
  if (isDefaultOpportunitySort(sort)) {
    return { [SORT_PARAM]: "", [SORT_DIR_PARAM]: "" };
  }
  return { [SORT_PARAM]: sort.key, [SORT_DIR_PARAM]: sort.direction };
}

/**
 * 머리글 링크의 주소 — 검색·필터는 그대로 두고 정렬만 바꾸며 **page 를 1로 되돌린다**.
 *
 * `pageHref(..., 1)` 이 `page` 를 지우므로 되돌리는 규칙이 여기 한 곳에만 있다.
 * `query` 에 이미 `sort`·`dir` 이 들어 있어도 새 값이 덮어쓴다.
 */
export function opportunitySortHref(
  basePath: string,
  query: Readonly<Record<string, string>>,
  sort: OpportunitySort,
): string {
  return pageHref(basePath, { ...query, ...opportunitySortParams(sort) }, 1);
}

/** `aria-sort` 에 넣을 값 — 지금 정렬 중인 컬럼만 방향을 알린다 (정책 ACC_*) */
export type SortState = "asc" | "desc" | "none";

export function sortStateOf(
  sort: OpportunitySort,
  key: OpportunitySortKey,
): SortState {
  return sort.key === key ? sort.direction : "none";
}

/**
 * 정렬 상태 → Prisma `orderBy`.
 *
 * 마감일은 **어느 방향이든 미정(null)을 뒤로** 보낸다. 방향을 뒤집었다고 값이 없는 행이
 * 맨 위로 올라오면, 정렬을 건 사람이 보려던 것(가장 늦은 마감일)이 아래로 밀린다.
 *
 * 마지막에 안정화 기준을 덧붙인다 — 같은 값이 여러 행이면 DB 가 순서를 보장하지 않아
 * 페이지를 넘길 때 같은 행이 두 번 나오거나 빠질 수 있다.
 */
export function opportunityOrderBy(
  sort: OpportunitySort,
): Prisma.OpportunityOrderByWithRelationInput[] {
  const { direction } = sort;
  const primary: Prisma.OpportunityOrderByWithRelationInput =
    sort.key === "updatedAt"
      ? { updatedAt: direction }
      : sort.key === "name"
        ? { name: direction }
        : sort.key === "account"
          ? { account: { companyName: direction } }
          : sort.key === "amount"
            ? { expectedAmount: direction }
            : { expectedCloseDate: { sort: direction, nulls: "last" } };

  return [
    primary,
    // 최근 수정일 자체가 기준이면 같은 값을 다시 얹을 이유가 없다
    ...(sort.key === "updatedAt"
      ? []
      : [{ updatedAt: "desc" } as Prisma.OpportunityOrderByWithRelationInput]),
    { id: "asc" },
  ];
}
