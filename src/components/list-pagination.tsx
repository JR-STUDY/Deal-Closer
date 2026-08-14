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
import { ListPageJump } from "@/components/list-page-jump";

/**
 * 목록 페이지네이션 UI — 거래처 목록·기회 목록 공용 (거래처-3 · 기회-18).
 *
 * 이동은 전부 `<Link>` 다 — 서버 페이지네이션이라 클라이언트 상태가 필요 없고, 새 탭·뒤로가기·
 * 주소 공유가 그대로 동작한다. 검색·필터 파라미터는 `pageHref` 가 함께 실어 보낸다.
 * 상호작용 로직이 없으므로 서버 컴포넌트이며 클라이언트 번들을 늘리지 않는다.
 *
 * **1페이지뿐이어도 그린다** (이전·다음은 비활성). 결과 수에 따라 나타났다 사라지면 표 아래가
 * 들썩이고, 이 목록이 페이지로 나뉘는 화면인지조차 알 수 없다 (기회-18 · 거래처-3 보완).
 * 결과가 0건일 때만 그리지 않는다 — 나눌 페이지가 없고, 호출측이 그 자리에 빈 상태 안내를
 * 대신 띄운다. "총 0건 중 0–0번째" 는 안내가 아니라 소음이다.
 *
 * **이동 묶음은 화면 가운데에 선다** (4차 피드백 1). 좌우를 `1fr` 로 잡은 3열 격자를 쓰고
 * 좌측 칸에만 건수 문구를 둔다 — `justify-between` 으로 밀어내면 건수 문구의 길이(검색 여부·
 * 자릿수)에 따라 이동 묶음의 위치가 매번 달라져, 같은 자리를 두 번 누를 수 없다.
 * 우측 칸은 일부러 비워 둔 균형추다.
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

  // 빈 목록에는 페이지 UI 를 두지 않는다 (호출측이 빈 상태 안내를 대신 그린다)
  if (totalCount === 0) return null;

  return (
    <nav
      aria-label={label}
      className="grid items-center gap-x-4 gap-y-2 sm:grid-cols-[1fr_auto_1fr]"
    >
      <p className="text-center text-xs text-muted-foreground tabular-nums sm:text-left">
        총 {formatNumber(totalCount)}
        {unit} 중 {formatNumber(from)}–{formatNumber(to)}번째
      </p>

      {/* 번호 이동과 직접 입력을 한 묶음으로 둔다 — 둘 다 "페이지를 옮기는 길"이다 */}
      <div className="flex flex-wrap items-center justify-center gap-x-3 gap-y-2">
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

        {/*
          번호 목록 **옆**이다 (대체가 아니다). 번호는 이웃 페이지로 가는 한 번의 클릭,
          입력은 멀리 건너뛰는 길 — 역할이 달라 둘 다 남긴다. 1페이지뿐이어도 함께 그려
          이 화면이 어떻게 나뉘는지(= "/ 1")를 그대로 보여준다.
        */}
        <ListPageJump
          basePath={basePath}
          query={query}
          totalPages={totalPages}
        />
      </div>

      {/* 좌측 건수 문구와 균형을 맞춰 가운데 묶음을 정중앙에 세우는 빈 칸 */}
      <span aria-hidden="true" className="hidden sm:block" />
    </nav>
  );
}
