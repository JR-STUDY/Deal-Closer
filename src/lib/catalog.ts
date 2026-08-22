/**
 * 품목 카탈로그 목록 — 조회 조건·정렬 **순수 함수** (2.0.0 · 관리자 콘솔에서 이전).
 *
 * 카탈로그 화면은 관리자 콘솔의 `마스터 데이터 관리` 였고 **전체를 한 번에** 실었다.
 * 담당자 포털(`/settings/catalog`)로 옮기면서 다른 목록과 같은 규칙을 적용한다 —
 * 검색·필터·정렬·페이지는 모두 URL 쿼리로만 주고받고(`@/lib/pagination` ·
 * `@/lib/opportunity-sort` 와 같은 설계), 서버가 잘라서 내려준다.
 *
 * DB 에 접근하지 않고 `server-only` 도 import 하지 않으므로 서버 컴포넌트·표 머리글
 * 어디서든 쓴다. Prisma 타입은 `import type` 으로만 참조한다.
 */

import type { Prisma } from "@/generated/prisma/client";
import { pageHref } from "./pagination";
import {
  SORT_DIR_PARAM,
  SORT_PARAM,
  type SortDirection,
  type SortState,
} from "./opportunity-sort";

/** 카테고리 필터를 담는 쿼리 키 */
export const CATEGORY_PARAM = "category";

/**
 * 정렬할 수 있는 컬럼.
 *
 * **자연스러운 순서가 있는 값만 연다.** 상태(활성/비활성)는 두 값뿐이라 정렬보다 필터의
 * 일이고, 단위(EA·식·월)는 문자열 정렬이 사람이 기대하는 순서와 무관하다
 * (`OPPORTUNITY_SORT_KEYS` 가 단계·담당자를 열지 않은 것과 같은 이유).
 */
export const CATALOG_SORT_KEYS = [
  "category",
  "name",
  "sku",
  "unitPrice",
] as const;

export type CatalogSortKey = (typeof CATALOG_SORT_KEYS)[number];
export type CatalogSort = { key: CatalogSortKey; direction: SortDirection };

/**
 * 기본 정렬 — **카테고리 가나다순**. 옮겨오기 전 화면의 순서(카테고리 → 등록순)를 잇는다.
 * 카탈로그는 "무엇이 있는지" 훑는 목록이라 종류끼리 붙어 있는 편이 읽힌다.
 */
export const DEFAULT_CATALOG_SORT: CatalogSort = {
  key: "category",
  direction: "asc",
};

/** 그 컬럼을 **처음 눌렀을 때**의 방향 (단가만 "비싼 것 먼저"가 기대에 맞는다) */
const FIRST_DIRECTION: Record<CatalogSortKey, SortDirection> = {
  category: "asc",
  name: "asc",
  sku: "asc",
  unitPrice: "desc",
};

/** 정렬 키인지 (URL 을 손으로 고쳐도 깨지지 않게) */
export function isCatalogSortKey(value: string): value is CatalogSortKey {
  return (CATALOG_SORT_KEYS as readonly string[]).includes(value);
}

/** URL 쿼리(`?sort=&dir=`) → 정렬 상태 */
export function parseCatalogSort(params: {
  sort?: string | null;
  dir?: string | null;
}): CatalogSort {
  const key = params.sort?.trim() ?? "";
  if (!isCatalogSortKey(key)) return DEFAULT_CATALOG_SORT;

  const dir = params.dir?.trim().toLowerCase() ?? "";
  const direction: SortDirection =
    dir === "asc" || dir === "desc" ? dir : FIRST_DIRECTION[key];
  return { key, direction };
}

/**
 * 머리글을 눌렀을 때의 다음 정렬 상태.
 * 같은 컬럼을 다시 누르면 방향만 뒤집고, 다른 컬럼이면 그 컬럼의 기본 방향으로 간다.
 */
export function nextCatalogSort(
  current: CatalogSort,
  key: CatalogSortKey,
): CatalogSort {
  if (current.key === key) {
    return { key, direction: current.direction === "asc" ? "desc" : "asc" };
  }
  return { key, direction: FIRST_DIRECTION[key] };
}

/** 기본 정렬 그대로인지 (주소에 파라미터를 남길지 판단) */
export function isDefaultCatalogSort(sort: CatalogSort): boolean {
  return (
    sort.key === DEFAULT_CATALOG_SORT.key &&
    sort.direction === DEFAULT_CATALOG_SORT.direction
  );
}

/** 정렬 상태 → URL 파라미터. **기본 정렬이면 빈 값**이라 주소에 남지 않는다 */
export function catalogSortParams(sort: CatalogSort): Record<string, string> {
  if (isDefaultCatalogSort(sort)) {
    return { [SORT_PARAM]: "", [SORT_DIR_PARAM]: "" };
  }
  return { [SORT_PARAM]: sort.key, [SORT_DIR_PARAM]: sort.direction };
}

/**
 * 머리글 링크의 주소 — 검색·카테고리는 그대로 두고 정렬만 바꾸며 **page 를 1로 되돌린다**
 * (`pageHref(..., 1)` 이 `page` 를 지운다).
 */
export function catalogSortHref(
  basePath: string,
  query: Readonly<Record<string, string>>,
  sort: CatalogSort,
): string {
  return pageHref(basePath, { ...query, ...catalogSortParams(sort) }, 1);
}

/** `aria-sort` 에 넣을 값 — 지금 정렬 중인 컬럼만 방향을 알린다 (정책 ACC_*) */
export function catalogSortStateOf(
  sort: CatalogSort,
  key: CatalogSortKey,
): SortState {
  return sort.key === key ? sort.direction : "none";
}

/**
 * 정렬 상태 → Prisma `orderBy`.
 *
 * SKU 는 비어 있을 수 있어 **어느 방향이든 미정(null)을 뒤로** 보낸다 — 방향을 뒤집었다고
 * 값이 없는 행이 맨 위로 올라오면 정렬을 건 사람이 보려던 것이 아래로 밀린다
 * (기회 목록의 예상 마감일과 같은 처리).
 *
 * 마지막에 안정화 기준(`id`)을 덧붙인다 — 같은 값이 여러 행이면 DB 가 순서를 보장하지 않아
 * 페이지를 넘길 때 같은 행이 두 번 나오거나 빠질 수 있다.
 */
export function catalogOrderBy(
  sort: CatalogSort,
): Prisma.CatalogItemOrderByWithRelationInput[] {
  const { direction } = sort;
  const primary: Prisma.CatalogItemOrderByWithRelationInput =
    sort.key === "category"
      ? { category: direction }
      : sort.key === "name"
        ? { name: direction }
        : sort.key === "sku"
          ? { sku: { sort: direction, nulls: "last" } }
          : { unitPrice: direction };

  return [
    primary,
    // 묶음 안의 순서까지 정해 준다 (카테고리로 묶으면 그 안이 품목명 가나다순)
    ...(sort.key === "name"
      ? []
      : [{ name: "asc" } as Prisma.CatalogItemOrderByWithRelationInput]),
    { id: "asc" },
  ];
}

/**
 * 목록 조회 조건 — 조직 범위 + 검색어 + 카테고리 필터 (`accountsWhere` 와 같은 역할).
 *
 * 검색은 **품목명·SKU·설명** 부분 일치다. SQLite 는 `mode: "insensitive"` 를 지원하지 않아
 * 거래처 검색과 같은 방식(그대로 `contains`)으로 둔다.
 * 카테고리는 목록·건수 양쪽에 같은 조건이 걸려야 "총 N개"가 화면과 어긋나지 않는다.
 */
export function catalogWhere(
  orgId: string,
  query: string,
  category: string,
): Prisma.CatalogItemWhereInput {
  const q = query.trim();
  const cat = category.trim();
  return {
    orgId,
    ...(cat ? { category: cat } : {}),
    ...(q
      ? {
          OR: [
            { name: { contains: q } },
            { sku: { contains: q } },
            { description: { contains: q } },
          ],
        }
      : {}),
  };
}
