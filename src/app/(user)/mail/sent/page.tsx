import { Suspense } from "react";
import Link from "next/link";
import { redirect } from "next/navigation";
import { SearchX, Send } from "lucide-react";
import { prisma } from "@/lib/db";
import { getCurrentUser } from "@/lib/session";
import {
  EMAIL_LOG_ROW_SELECT,
  emailLogOrderBy,
  emailLogSortParams,
  emailLogsWhere,
  hasEmailLogFilter,
  parseEmailLogFilters,
  parseEmailLogSort,
} from "@/lib/email-log";
import {
  pageHref,
  pageQueryRange,
  parsePageParam,
  resolvePagination,
} from "@/lib/pagination";
import { formatNumber } from "@/lib/format";
import { PageHeader } from "@/components/page-header";
import { InfoHint } from "@/components/info-hint";
import { ListPagination } from "@/components/list-pagination";
import { Button } from "@/components/ui/button";
import { SentMailToolbar } from "./_components/sent-mail-toolbar";
import { SentMailTable } from "./_components/sent-mail-table";

const LIST_HREF = "/mail/sent";

/**
 * 메일 발송 이력 (F-234 · 메일-1) — 보낸 날짜 · 제목 · 문서 · 기회 · 받는 사람 · 상태 · 열람 확인.
 *
 * 검색어·상태·열람 확인·정렬·페이지는 URL 쿼리(`?q=&status=&opened=&sort=&dir=&page=`)로 받는다
 * (기회·거래처 목록과 같은 규칙 — 새로고침·뒤로가기·주소 공유에서 같은 화면이 나온다).
 * 조회 조건·정렬은 `@/lib/email-log` **순수 함수가 단일 기준**이고 이 페이지는 결과를 그린다.
 *
 * **조직 범위는 `EmailLog.document.orgId` 를 경유한다** — `EmailLog` 에는 `orgId` 컬럼이 없다.
 * 조건을 `emailLogsWhere()` 안에 넣어 목록·건수 두 조회가 같은 범위를 쓰게 했다.
 *
 * 발송은 **이 화면에서 하지 않는다** — 문서 발송은 `/sender/:documentId` 하나뿐이고 여기는
 * 지난 발송을 되짚는 자리다(읽기 전용). 그래서 헤더에 "새 발송" 같은 버튼을 두지 않는다.
 */
export default async function SentMailPage({
  searchParams,
}: {
  searchParams: Promise<{
    q?: string;
    status?: string;
    opened?: string;
    sort?: string;
    dir?: string;
    page?: string;
  }>;
}) {
  // searchParams 와 세션 조회는 서로 독립 → 병렬 처리
  const [params, user] = await Promise.all([searchParams, getCurrentUser()]);
  const filters = parseEmailLogFilters(params);
  const sort = parseEmailLogSort(params);
  const requestedPage = parsePageParam(params.page);
  const where = emailLogsWhere(user.orgId, filters);
  const { skip, take } = pageQueryRange(requestedPage);

  // 목록과 총 건수는 서로 독립 조회다 → 병렬로 돌린다 (건수는 **필터를 적용한 전체** 기준)
  const [logs, totalCount] = await Promise.all([
    prisma.emailLog.findMany({
      where,
      orderBy: emailLogOrderBy(sort),
      select: EMAIL_LOG_ROW_SELECT,
      skip,
      take,
    }),
    prisma.emailLog.count({ where }),
  ]);

  const pagination = resolvePagination({ totalCount, requestedPage });
  const isFiltering = hasEmailLogFilter(filters);

  // 페이지를 옮겨도 유지할 쿼리. 정렬도 함께 실어야 페이지를 넘겨도 같은 순서가 유지된다
  // (기본 정렬이면 빈 값이라 주소에서 지워진다)
  const listQuery = {
    q: filters.query,
    status: filters.status ?? "",
    opened: filters.opened ?? "",
    ...emailLogSortParams(sort),
  };
  // 범위를 벗어난 페이지(`?page=9` 인데 2쪽뿐)는 빈 표를 보여주지 않고 되돌린다
  if (pagination.isOutOfRange) {
    redirect(pageHref(LIST_HREF, listQuery, pagination.page));
  }

  return (
    <>
      <PageHeader
        title="발송 이력"
        description="문서를 메일로 보낸 기록입니다. 받는 사람·본문과 열람이 확인된 시각을 다시 보실 수 있습니다."
      />

      {/* scrollbar-gutter: 스크롤바가 생겼다 사라지며 본문 폭이 흔들리는 것을 막는다 */}
      <div className="flex-1 space-y-4 overflow-auto p-8 [scrollbar-gutter:stable]">
        <Suspense fallback={<div className="h-9" />}>
          <SentMailToolbar>
            {pagination.totalCount > 0 ? (
              <p className="flex items-center gap-1.5 text-xs text-muted-foreground">
                <span>총 {formatNumber(pagination.totalCount)}건</span>
                {isFiltering ? (
                  <InfoHint label="건수 기준 안내">
                    검색·필터를 적용한 결과 전체를 기준으로 낸 건수입니다. 현재
                    페이지에 보이는 행만 센 값이 아닙니다.
                  </InfoHint>
                ) : null}
              </p>
            ) : null}
          </SentMailToolbar>
        </Suspense>

        {pagination.totalCount === 0 ? (
          <div className="flex flex-col items-center justify-center gap-3 rounded-lg border border-dashed py-20 text-center">
            {isFiltering ? (
              <>
                <SearchX className="size-10 text-muted-foreground" />
                <p className="text-sm text-muted-foreground">
                  조건에 맞는 발송 이력이 없습니다. 검색어나 필터를 바꿔
                  찾아보세요.
                </p>
              </>
            ) : (
              <>
                <Send className="size-10 text-muted-foreground" />
                <p className="text-sm text-muted-foreground">
                  아직 발송한 메일이 없습니다. 문서 보관함에서 문서를 열어
                  발송하시면 그 기록이 여기에 모입니다.
                </p>
                <Button asChild variant="outline">
                  <Link href="/library">문서 보관함으로 이동</Link>
                </Button>
              </>
            )}
          </div>
        ) : (
          <>
            <SentMailTable
              logs={logs}
              sort={sort}
              basePath={LIST_HREF}
              listQuery={listQuery}
            />
            <ListPagination
              pagination={pagination}
              basePath={LIST_HREF}
              query={listQuery}
              label="발송 이력 목록 페이지"
            />
          </>
        )}
      </div>
    </>
  );
}
