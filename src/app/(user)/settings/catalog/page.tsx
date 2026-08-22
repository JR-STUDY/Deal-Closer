import { Suspense } from "react";
import Link from "next/link";
import { redirect } from "next/navigation";
import { PackageSearch, SearchX } from "lucide-react";
import { prisma } from "@/lib/db";
import { getCurrentUser } from "@/lib/session";
import {
  CATEGORY_PARAM,
  catalogOrderBy,
  catalogSortHref,
  catalogSortParams,
  catalogSortStateOf,
  catalogWhere,
  nextCatalogSort,
  parseCatalogSort,
  type CatalogSortKey,
} from "@/lib/catalog";
import {
  pageHref,
  pageQueryRange,
  parsePageParam,
  resolvePagination,
} from "@/lib/pagination";
import { formatKRW, formatNumber } from "@/lib/format";
import { cn } from "@/lib/utils";
import { PageHeader } from "@/components/page-header";
import { InfoHint } from "@/components/info-hint";
import { ListPagination } from "@/components/list-pagination";
import { SortableHead } from "@/components/list-sort-header";
import { Badge } from "@/components/ui/badge";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { CatalogActions } from "./_components/catalog-actions";
import { CatalogToolbar } from "./_components/catalog-toolbar";

const LIST_HREF = "/settings/catalog";

/** "전체" 탭의 표식 — 카테고리 파라미터를 지운 상태다 */
const ALL_CATEGORY = "";

/**
 * 품목 카탈로그 (`/settings/catalog`) — 견적서 품목표가 고르는 상품·서비스 목록.
 *
 * 관리자 콘솔의 `마스터 데이터 관리`(`/catalog`) 에서 담당자 포털로 옮겨 왔다 (2.0.0).
 * 카탈로그를 실제로 쓰는 사람은 견적서를 쓰는 담당자이고, 에디터 품목표의 카탈로그
 * 자동완성(`catalog-combobox`)이 보는 데이터도 이것이다 — 고치는 자리와 쓰는 자리가
 * 다른 콘솔에 있을 이유가 없다.
 *
 * 옮기면서 **다른 목록과 같은 규칙**을 적용했다 (거래처·기회 목록과 동일):
 * 검색어·카테고리·정렬·페이지는 URL 쿼리로만 주고받고 서버가 잘라 내려준다.
 * 예전 화면은 조직의 카탈로그 **전체를 한 번에** 실었다 — 품목이 늘면 그대로 느려진다.
 *
 * 행 전체 클릭(`@/components/list-row-link`)은 **두지 않았다** — 품목 상세 화면이 없어
 * 갈 곳이 없다. 눌러도 아무 일이 없는 덮개는 사용자를 한 번 속인다(0건일 때 팝오버를
 * 붙이지 않는 것과 같은 판단). 품목 편집 화면이 생기면 그때 덮개를 붙인다.
 */
export default async function CatalogPage({
  searchParams,
}: {
  searchParams: Promise<{
    q?: string;
    category?: string;
    sort?: string;
    dir?: string;
    page?: string;
  }>;
}) {
  // searchParams 와 세션 조회는 서로 독립 → 병렬 처리
  const [params, user] = await Promise.all([searchParams, getCurrentUser()]);
  const query = params.q?.trim() ?? "";
  const category = params.category?.trim() ?? ALL_CATEGORY;
  const sort = parseCatalogSort(params);
  const requestedPage = parsePageParam(params.page);
  // 조직 범위·검색·카테고리는 목록·건수 양쪽에 같은 조건으로 걸린다
  const where = catalogWhere(user.orgId, query, category);
  const { skip, take } = pageQueryRange(requestedPage);

  /*
    카테고리 탭은 **필터를 걸지 않은 조직 전체**에서 뽑는다. 필터를 적용한 결과에서 뽑으면
    한 카테고리를 고른 순간 나머지 탭이 사라져 되돌아올 길이 없어진다.
    세 조회는 서로 독립이라 병렬로 돌린다 (docs/REACT_BEST_PRACTICES.md · async-parallel).
  */
  const [categoryRows, totalCount, items] = await Promise.all([
    prisma.catalogItem.findMany({
      where: { orgId: user.orgId },
      select: { category: true },
      distinct: ["category"],
      orderBy: { category: "asc" },
    }),
    prisma.catalogItem.count({ where }),
    prisma.catalogItem.findMany({
      where,
      orderBy: catalogOrderBy(sort),
      skip,
      take,
    }),
  ]);

  const pagination = resolvePagination({ totalCount, requestedPage });
  // 주소를 손으로 고쳤거나 그새 건수가 줄어 범위를 벗어난 페이지는 빈 표를 보여주지 않고 되돌린다
  /**
   * 페이지·정렬·필터 링크가 함께 실어 보낼 현재 쿼리.
   * 빈 값은 `pageHref` 가 알아서 지우므로 조건부로 빼지 않는다.
   */
  const listQuery: Record<string, string> = {
    q: query,
    [CATEGORY_PARAM]: category,
    ...catalogSortParams(sort),
  };
  if (pagination.isOutOfRange) {
    redirect(pageHref(LIST_HREF, listQuery, pagination.page));
  }

  const tabs = [
    { key: ALL_CATEGORY, label: "전체" },
    ...categoryRows.map((row) => ({ key: row.category, label: row.category })),
  ];
  const isFiltering = query.length > 0 || category.length > 0;
  /** 머리글 링크 — 검색·카테고리는 유지하고 정렬만 바꾸며 page 를 1로 되돌린다 */
  const sortHref = (key: CatalogSortKey) =>
    catalogSortHref(LIST_HREF, listQuery, nextCatalogSort(sort, key));

  return (
    <>
      <PageHeader
        title="품목 카탈로그"
        description="견적서 품목표에서 바로 고를 수 있는 상품·서비스 목록입니다."
        actions={<CatalogActions />}
      />

      {/* scrollbar-gutter: 스크롤바가 생겼다 사라지며 본문 폭이 흔들리는 것을 막는다 */}
      <div className="flex-1 space-y-4 overflow-auto p-8 [scrollbar-gutter:stable]">
        <Suspense fallback={<div className="h-9" />}>
          <CatalogToolbar>
            {totalCount > 0 ? (
              <p className="flex items-center gap-1.5 text-xs text-muted-foreground">
                <span>총 {formatNumber(totalCount)}개</span>
                {isFiltering ? (
                  <InfoHint label="건수 기준 안내">
                    검색·카테고리를 적용한 결과 전체를 기준으로 낸 건수입니다.
                    현재 페이지에 보이는 행 수가 아닙니다.
                  </InfoHint>
                ) : null}
              </p>
            ) : null}
          </CatalogToolbar>
        </Suspense>

        {/*
          카테고리 탭은 `<Link>` 다 — 주소를 바꾸는 이동이라 JS 없이 동작하고 새 탭·주소
          복사가 된다(정렬 머리글과 같은 규칙). `pageHref(..., 1)` 로 **page 를 1로**
          되돌린다 — 3페이지에 머문 채 카테고리를 좁히면 빈 화면이 뜬다.
        */}
        {tabs.length > 1 ? (
          <div
            className="flex flex-wrap gap-1 rounded-lg bg-muted p-1"
            role="group"
            aria-label="카테고리 필터"
          >
            {tabs.map((tab) => {
              const selected = tab.key === category;
              return (
                <Link
                  key={tab.key || "ALL"}
                  href={pageHref(
                    LIST_HREF,
                    { ...listQuery, [CATEGORY_PARAM]: tab.key },
                    1,
                  )}
                  aria-current={selected ? "true" : undefined}
                  className={cn(
                    "rounded-md px-3 py-1.5 text-sm font-medium transition-colors focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none",
                    selected
                      ? "bg-background text-foreground shadow-sm"
                      : "text-muted-foreground hover:text-foreground",
                  )}
                >
                  {tab.label}
                </Link>
              );
            })}
          </div>
        ) : null}

        {totalCount === 0 ? (
          <div className="flex flex-col items-center justify-center gap-3 rounded-lg border border-dashed py-20 text-center">
            {isFiltering ? (
              <>
                <SearchX className="size-10 text-muted-foreground" />
                <p className="text-sm text-muted-foreground">
                  조건과 일치하는 품목이 없습니다. 검색어를 줄이거나 카테고리를
                  &ldquo;전체&rdquo;로 바꿔 다시 찾아보세요.
                </p>
                <Link
                  href={LIST_HREF}
                  className="text-sm text-primary underline-offset-4 hover:underline"
                >
                  조건 모두 지우기
                </Link>
              </>
            ) : (
              <>
                <PackageSearch className="size-10 text-muted-foreground" />
                <p className="text-sm text-muted-foreground">
                  아직 등록된 품목이 없습니다. 품목을 등록하시면 견적서 품목표에서
                  바로 고를 수 있습니다.
                </p>
              </>
            )}
          </div>
        ) : (
          <>
            <div className="overflow-hidden rounded-lg border">
              {/*
                컬럼 폭 고정 — 거래처·기회 목록과 같은 규칙이다. 표 기본값은 그 페이지에 담긴
                내용으로 폭을 다시 계산해 검색·페이지 이동 때마다 칸 경계가 옮겨간다.
                폭을 적지 않은 칸(품목명)이 남는 폭을 흡수한다 — 설명이 함께 들어가므로
                넓어지는 만큼 실제로 더 읽히는 유일한 칸이다.
                min-w 는 고정 폭 합(160+140+80+140+96=616)에 품목명 최소 264px 를 더했다.
              */}
              <Table className="min-w-[880px] table-fixed">
                <TableHeader>
                  <TableRow>
                    <SortableHead
                      label="카테고리"
                      href={sortHref("category")}
                      state={catalogSortStateOf(sort, "category")}
                      className="w-[160px]"
                    />
                    {/* 폭 미지정 = 남는 폭 전부 (품목명 + 설명) */}
                    <SortableHead
                      label="품목명"
                      href={sortHref("name")}
                      state={catalogSortStateOf(sort, "name")}
                    />
                    <SortableHead
                      label="SKU"
                      href={sortHref("sku")}
                      state={catalogSortStateOf(sort, "sku")}
                      className="w-[140px]"
                    />
                    <TableHead className="w-[80px]">단위</TableHead>
                    <SortableHead
                      label="단가"
                      href={sortHref("unitPrice")}
                      state={catalogSortStateOf(sort, "unitPrice")}
                      align="right"
                      className="w-[140px]"
                    />
                    <TableHead className="w-[96px]">상태</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {items.map((item) => (
                    <TableRow key={item.id}>
                      <TableCell>
                        <Badge
                          variant="outline"
                          className="max-w-full truncate font-normal"
                          title={item.category}
                        >
                          {item.category}
                        </Badge>
                      </TableCell>
                      <TableCell>
                        <div className="truncate font-medium" title={item.name}>
                          {item.name}
                        </div>
                        {item.description ? (
                          <div
                            className="truncate text-xs text-muted-foreground"
                            title={item.description}
                          >
                            {item.description}
                          </div>
                        ) : null}
                      </TableCell>
                      <TableCell className="truncate text-muted-foreground">
                        {item.sku ?? "—"}
                      </TableCell>
                      <TableCell className="truncate text-muted-foreground">
                        {item.unit}
                      </TableCell>
                      {/* 금액은 자릿수마다 글자폭이 같아야 세로로 읽힌다 */}
                      <TableCell className="text-right font-medium tabular-nums">
                        {formatKRW(item.unitPrice)}
                      </TableCell>
                      <TableCell>
                        <Badge
                          className={cn(
                            "border-0",
                            item.isActive
                              ? "bg-emerald-100 text-emerald-800 dark:bg-emerald-500/15 dark:text-emerald-300"
                              : "bg-muted text-muted-foreground",
                          )}
                        >
                          {item.isActive ? "활성" : "비활성"}
                        </Badge>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>

            <ListPagination
              pagination={pagination}
              basePath={LIST_HREF}
              query={listQuery}
              label="품목 카탈로그 페이지"
              unit="개"
            />
          </>
        )}
      </div>
    </>
  );
}
