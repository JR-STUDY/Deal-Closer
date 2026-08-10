import Link from "next/link";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { cn } from "@/lib/utils";
import { formatNumber } from "@/lib/format";
import {
  PAGE_GAP,
  pageHref,
  pageItems,
  type Pagination,
} from "@/lib/pagination";

/**
 * 목록 페이지네이션 UI — 거래처 목록·기회 목록 공용 (거래처-3 · 기회-18).
 *
 * 이동은 전부 `<Link>` 다 — 서버 페이지네이션이라 클라이언트 상태가 필요 없고, 새 탭·뒤로가기·
 * 주소 공유가 그대로 동작한다. 검색·필터 파라미터는 `pageHref` 가 함께 실어 보낸다.
 * 상호작용 로직이 없으므로 서버 컴포넌트이며 클라이언트 번들을 늘리지 않는다.
 *
 * 페이지가 하나뿐이면 아무것도 그리지 않는다 (총 건수는 검색란 우측에 이미 있다).
 */

const BOX =
  "flex h-8 min-w-8 items-center justify-center rounded-md border px-2 text-sm tabular-nums transition-colors";
const LINK_BOX = `${BOX} hover:bg-accent hover:text-accent-foreground focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none`;
/** 더 갈 곳이 없을 때 — 누를 수 없으니 초점도 받지 않고 읽히지도 않는다 (ACC_*) */
const DISABLED_BOX = `${BOX} text-muted-foreground/50`;

export function ListPagination({
  pagination,
  basePath,
  query,
  label,
  unit = "건",
}: {
  pagination: Pagination;
  /** 페이지 링크의 기준 경로 (예: `/accounts`) */
  basePath: string;
  /** 페이지를 옮겨도 유지할 현재 쿼리 (page 는 넣어도 무시된다) */
  query: Readonly<Record<string, string>>;
  /** 스크린리더가 읽을 영역 이름 (예: "거래처 목록 페이지") */
  label: string;
  /** 건수 단위 — 거래처는 "곳", 기회는 "건" */
  unit?: string;
}) {
  const { page, totalPages, totalCount, from, to, hasPrev, hasNext } =
    pagination;

  if (totalPages <= 1) return null;

  return (
    <nav
      aria-label={label}
      className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2"
    >
      <p className="text-xs text-muted-foreground tabular-nums">
        총 {formatNumber(totalCount)}
        {unit} 중 {formatNumber(from)}–{formatNumber(to)}번째
      </p>

      <ul className="flex flex-wrap items-center gap-1">
        <li>
          {hasPrev ? (
            <Link
              href={pageHref(basePath, query, page - 1)}
              aria-label="이전 페이지로 이동"
              className={LINK_BOX}
            >
              <ChevronLeft className="size-4" aria-hidden="true" />
            </Link>
          ) : (
            <span aria-hidden="true" className={DISABLED_BOX}>
              <ChevronLeft className="size-4" />
            </span>
          )}
        </li>

        {pageItems(page, totalPages).map((item, index) =>
          item === PAGE_GAP ? (
            // 생략 구간 — 앞뒤 두 곳에 나올 수 있어 위치를 key 에 섞는다
            <li key={`${PAGE_GAP}-${index}`}>
              <span aria-hidden="true" className="px-1 text-muted-foreground">
                …
              </span>
            </li>
          ) : (
            <li key={item}>
              {item === page ? (
                <span
                  aria-current="page"
                  className={cn(
                    BOX,
                    "border-primary bg-primary font-medium text-primary-foreground",
                  )}
                >
                  {formatNumber(item)}
                  <span className="sr-only">페이지 (현재 페이지)</span>
                </span>
              ) : (
                <Link
                  href={pageHref(basePath, query, item)}
                  aria-label={`${formatNumber(item)}페이지로 이동`}
                  className={LINK_BOX}
                >
                  {formatNumber(item)}
                </Link>
              )}
            </li>
          ),
        )}

        <li>
          {hasNext ? (
            <Link
              href={pageHref(basePath, query, page + 1)}
              aria-label="다음 페이지로 이동"
              className={LINK_BOX}
            >
              <ChevronRight className="size-4" aria-hidden="true" />
            </Link>
          ) : (
            <span aria-hidden="true" className={DISABLED_BOX}>
              <ChevronRight className="size-4" />
            </span>
          )}
        </li>
      </ul>
    </nav>
  );
}
