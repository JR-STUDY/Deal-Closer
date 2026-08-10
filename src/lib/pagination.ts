/**
 * 목록 페이지네이션 — 순수 함수 (거래처-3 · 기회-18).
 *
 * 거래처 목록과 기회 목록이 **같은 규칙**을 쓰도록 계산을 한 곳에 모은다
 * (`@/lib/pipeline` 을 대시보드·캘린더가 공유하는 것과 같은 이유).
 * DB 에 접근하지 않고 `server-only` 도 import 하지 않으므로 서버 컴포넌트·클라이언트 툴바
 * 어디서든 쓴다.
 *
 * 페이지는 **URL 쿼리(`?page=`)** 로 주고받는다 — 새로고침·공유·뒤로가기에서 같은 화면이 나오고,
 * 검색·필터 파라미터와 자연히 함께 보존된다.
 */

import { LIST_PAGE_SIZE } from "./constants";

/** 페이지 번호를 담는 쿼리 키 */
export const PAGE_PARAM = "page";

/**
 * Radix Select 는 빈 문자열 value 를 허용하지 않아 "전체" 를 표현할 표식이 필요하다.
 * 이 값이 오면 해당 파라미터를 지운다 (= 필터 해제).
 */
export const ALL_FILTER_VALUE = "ALL";

/**
 * 값이 바뀌어도 페이지를 유지해도 되는 파라미터.
 * 보기 전환(목록↔칸반)은 **결과 집합을 바꾸지 않으므로** 3페이지를 보던 사람을 1페이지로
 * 되돌릴 이유가 없다. 그 외(검색어·단계·담당자)는 결과가 줄어들 수 있어 반드시 되돌린다.
 */
const PAGE_PRESERVING_KEYS: readonly string[] = ["view", PAGE_PARAM];

export type Pagination = {
  /** 실제로 보여줄 페이지 (1부터. 총 페이지 수 안으로 클램프됨) */
  page: number;
  pageSize: number;
  /** 필터를 적용한 전체 건수 */
  totalCount: number;
  /** 총 페이지 수. 결과가 없어도 1 이다 (빈 1페이지). */
  totalPages: number;
  /** Prisma `skip` */
  skip: number;
  /** Prisma `take` */
  take: number;
  /** 이 페이지가 보여주는 첫 행의 순번 (1부터). 결과가 없으면 0. */
  from: number;
  /** 이 페이지가 보여주는 마지막 행의 순번. 결과가 없으면 0. */
  to: number;
  hasPrev: boolean;
  hasNext: boolean;
  /**
   * 요청한 페이지가 범위를 벗어났는지 (예: 2페이지뿐인데 `?page=9`).
   * 호출측이 클램프된 페이지로 돌려보낼 근거로 쓴다 — 빈 표를 보여주지 않는다.
   */
  isOutOfRange: boolean;
};

/**
 * `?page=` 값을 1 이상 정수로 좁힌다.
 * 비었거나 숫자가 아니거나 0·음수·소수면 1 로 본다 (주소를 손으로 고쳐도 깨지지 않게).
 */
export function parsePageParam(raw?: string | null): number {
  const trimmed = raw?.trim() ?? "";
  if (!/^\d+$/.test(trimmed)) return 1;
  const value = Number(trimmed);
  if (!Number.isSafeInteger(value) || value < 1) return 1;
  return value;
}

/**
 * 총 건수를 아직 모르는 상태에서 쓸 조회 구간.
 *
 * 건수 조회와 목록 조회를 **병렬**로 돌리려면 skip·take 를 먼저 정해야 한다. 범위를 벗어난
 * 페이지였는지는 두 조회가 끝난 뒤 `resolvePagination` 이 알려주므로, 그때 되돌리면 된다.
 */
export function pageQueryRange(
  requestedPage: number,
  pageSize = LIST_PAGE_SIZE,
): { skip: number; take: number } {
  const safeSize = Math.max(1, Math.trunc(pageSize));
  const page = Math.max(1, Math.trunc(requestedPage));
  return { skip: (page - 1) * safeSize, take: safeSize };
}

/**
 * 전체 건수와 요청 페이지로 조회 구간·표시 범위를 정한다.
 *
 * 총 페이지 수를 넘는 요청은 마지막 페이지로 클램프하고 `isOutOfRange` 를 세운다 —
 * 조회는 목록·건수를 **병렬**로 돌린 뒤 판정하므로, 벗어난 경우에만 호출측이 되돌린다.
 */
export function resolvePagination({
  totalCount,
  requestedPage,
  pageSize = LIST_PAGE_SIZE,
}: {
  totalCount: number;
  requestedPage: number;
  pageSize?: number;
}): Pagination {
  const safeSize = Math.max(1, Math.trunc(pageSize));
  const safeTotal = Math.max(0, Math.trunc(totalCount));
  const totalPages = Math.max(1, Math.ceil(safeTotal / safeSize));
  const wanted = Math.max(1, Math.trunc(requestedPage));
  const page = Math.min(wanted, totalPages);
  const skip = (page - 1) * safeSize;
  const from = safeTotal === 0 ? 0 : skip + 1;
  const to = safeTotal === 0 ? 0 : Math.min(skip + safeSize, safeTotal);

  return {
    page,
    pageSize: safeSize,
    totalCount: safeTotal,
    totalPages,
    skip,
    take: safeSize,
    from,
    to,
    hasPrev: page > 1,
    hasNext: page < totalPages,
    isOutOfRange: wanted > totalPages,
  };
}

/** 페이지 번호 목록의 생략 표식 */
export const PAGE_GAP = "gap" as const;
export type PageItem = number | typeof PAGE_GAP;

/**
 * 페이지 번호 버튼 목록. 첫·마지막 페이지와 현재 주변을 남기고 나머지는 생략(`gap`)한다.
 * `maxSlots` 는 번호·생략을 합친 칸 수이며 5 미만은 5 로 올린다 (첫·현재·마지막 + 생략 2칸).
 */
export function pageItems(
  page: number,
  totalPages: number,
  maxSlots = 7,
): PageItem[] {
  const total = Math.max(1, Math.trunc(totalPages));
  const current = Math.min(Math.max(1, Math.trunc(page)), total);
  const slots = Math.max(5, Math.trunc(maxSlots));

  if (total <= slots) {
    return Array.from({ length: total }, (_, index) => index + 1);
  }

  // 첫·마지막 페이지와 생략 표식 2칸을 뺀 나머지를 현재 주변에 배분한다
  const windowSize = slots - 4;
  const half = Math.floor(windowSize / 2);
  let start = current - half;
  let end = start + windowSize - 1;

  // 양 끝에 붙으면 창을 안쪽으로 밀어 칸 수를 유지한다
  if (start < 2) {
    start = 2;
    end = start + windowSize - 1;
  }
  if (end > total - 1) {
    end = total - 1;
    start = end - windowSize + 1;
  }

  const items: PageItem[] = [1];
  if (start > 2) items.push(PAGE_GAP);
  for (let value = start; value <= end; value += 1) items.push(value);
  if (end < total - 1) items.push(PAGE_GAP);
  items.push(total);
  return items;
}

/**
 * 검색·필터를 유지한 페이지 이동 주소.
 * 1페이지는 파라미터를 지운다 — 기본 상태의 주소가 지저분해지지 않는다.
 */
export function pageHref(
  basePath: string,
  query: Readonly<Record<string, string>>,
  page: number,
): string {
  const sp = new URLSearchParams();
  for (const [key, value] of Object.entries(query)) {
    if (key === PAGE_PARAM) continue;
    const trimmed = value?.trim() ?? "";
    if (trimmed) sp.set(key, trimmed);
  }
  if (page > 1) sp.set(PAGE_PARAM, String(page));
  const qs = sp.toString();
  return qs ? `${basePath}?${qs}` : basePath;
}

/**
 * 툴바가 검색·필터를 바꿀 때 만들 새 쿼리 문자열.
 *
 * 결과 집합을 바꾸는 파라미터가 하나라도 건드려지면 `page` 를 지워 1페이지로 되돌린다 —
 * 3페이지에 머문 채 조건을 좁히면 결과가 있는데도 빈 화면이 뜬다.
 * 빈 값과 "전체"(`ALL`) 는 파라미터를 지우는 것으로 본다.
 */
export function nextListSearch(
  current: string,
  patch: Readonly<Record<string, string>>,
): string {
  const sp = new URLSearchParams(current);
  let resetsPage = false;

  for (const [key, value] of Object.entries(patch)) {
    const trimmed = value?.trim() ?? "";
    if (trimmed && trimmed !== ALL_FILTER_VALUE) sp.set(key, trimmed);
    else sp.delete(key);
    if (!PAGE_PRESERVING_KEYS.includes(key)) resetsPage = true;
  }

  if (resetsPage) sp.delete(PAGE_PARAM);
  return sp.toString();
}
