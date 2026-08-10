import { Suspense } from "react";
import Link from "next/link";
import { redirect } from "next/navigation";
import { SearchX, Target } from "lucide-react";
import { prisma } from "@/lib/db";
import { getCurrentUser } from "@/lib/session";
import {
  OPPORTUNITY_DTO_SELECT,
  OPPORTUNITY_LIST_ORDER_BY,
  hasOpportunityFilter,
  opportunitiesWhere,
  parseOpportunityFilters,
  toOpportunityDTO,
} from "@/lib/opportunity";
import {
  pageHref,
  pageQueryRange,
  parsePageParam,
  resolvePagination,
} from "@/lib/pagination";
import { summarizeByStage } from "@/lib/pipeline";
import { formatDate, formatKRW, formatNumber } from "@/lib/format";
import { PageHeader } from "@/components/page-header";
import { StageBadge } from "@/components/status-badge";
import { InfoHint } from "@/components/info-hint";
import { ListPagination } from "@/components/list-pagination";
import {
  ROW_LINK_ABOVE,
  ROW_LINK_ROW,
  RowLink,
} from "@/components/list-row-link";
import { NewOpportunityButton } from "@/components/opportunity/new-opportunity-button";
import { StageFlowGuide } from "@/components/opportunity/stage-flow-guide";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { OpportunitiesToolbar } from "./_components/opportunities-toolbar";
import { OpportunityBoard } from "./_components/opportunity-board";
import { OpportunityRowActions } from "./_components/opportunity-row-actions";

const LIST_HREF = "/opportunities";

/**
 * 합계·총 건수 계산에만 쓰는 최소 select. 조인이 없어 전체 행을 읽어도 가볍다.
 * (표는 `OPPORTUNITY_DTO_SELECT` 로 한 페이지만 읽는다)
 */
const SUMMARY_SELECT = {
  stage: true,
  expectedAmount: true,
  expectedCloseDate: true,
} as const;

/**
 * 영업 기회 목록·칸반 (F-111 · F-112) — 기회명·거래처·단계·예상 금액·예상 마감일·영업 담당자.
 *
 * 검색어·단계·영업 담당자·보기·페이지는 URL 쿼리(`?q=&stage=&owner=&view=&page=`)로 받는다.
 * 조회 조건은 두 보기가 완전히 같고 표현만 다르다 — `?view=board` 면 칸반, 아니면 목록이다.
 * 정렬은 예상 마감일 오름차순(임박한 것 먼저)이고 마감일 미정은 뒤로 보낸다.
 *
 * **목록만 페이지로 자른다.** 칸반은 전체가 보여야 파이프라인이 성립하므로 자르지 않고,
 * 페이지네이션 UI 도 감춘다 (기회-18).
 */
export default async function OpportunitiesPage({
  searchParams,
}: {
  searchParams: Promise<{
    q?: string;
    stage?: string;
    owner?: string;
    view?: string;
    page?: string;
  }>;
}) {
  // searchParams 와 세션 조회는 서로 독립 → 병렬 처리
  const [params, user] = await Promise.all([searchParams, getCurrentUser()]);
  const filters = parseOpportunityFilters(params);
  const isBoard = params.view === "board";
  const requestedPage = parsePageParam(params.page);
  // orgId 스코프는 표·합계 조회에 같은 조건으로 걸린다
  const where = opportunitiesWhere(user.orgId, filters);
  const { skip, take } = pageQueryRange(requestedPage);

  // 표·합계·셀렉트 후보는 서로 독립 조회다 → 전부 병렬로 돌린다
  const [opportunities, summaryRows, accounts, owners] = await Promise.all([
    prisma.opportunity.findMany({
      where,
      orderBy: OPPORTUNITY_LIST_ORDER_BY,
      select: OPPORTUNITY_DTO_SELECT,
      // 칸반은 전체를 넘긴다 (기회-18)
      ...(isBoard ? {} : { skip, take }),
    }),
    // 합계는 한 페이지가 아니라 **필터를 적용한 전체**를 대상으로 낸다 —
    // 페이지를 넘길 때마다 총 건수·합계가 달라지면 숫자를 믿을 수 없다.
    // 칸반은 위 조회가 이미 전체라 다시 읽지 않는다.
    isBoard
      ? null
      : prisma.opportunity.findMany({ where, select: SUMMARY_SELECT }),
    prisma.account.findMany({
      where: { orgId: user.orgId },
      orderBy: { companyName: "asc" },
      select: { id: true, companyName: true },
    }),
    prisma.user.findMany({
      where: { orgId: user.orgId },
      orderBy: { name: "asc" },
      select: { id: true, name: true },
    }),
  ]);

  const totals = summaryRows ?? opportunities;
  // 합계는 대시보드·캘린더와 같은 순수 함수를 쓴다 (화면끼리 숫자가 어긋나지 않도록)
  const summary = summarizeByStage(totals);
  // 총 건수는 행 수를 그대로 쓴다 — 페이지 나누기와 어긋나지 않아야 한다
  // (`summarizeByStage` 는 정의 밖 stage 값을 집계에서 빼므로 건수 기준으로 쓰지 않는다)
  const pagination = resolvePagination({
    totalCount: totals.length,
    requestedPage,
  });
  const isFiltering = hasOpportunityFilter(filters);

  // 페이지를 나누는 목록에서만, 범위를 벗어난 페이지를 되돌린다 (칸반은 page 를 쓰지 않는다)
  const listQuery = {
    q: filters.query,
    stage: filters.stage ?? "",
    owner: filters.ownerId ?? "",
  };
  if (!isBoard && pagination.isOutOfRange) {
    redirect(pageHref(LIST_HREF, listQuery, pagination.page));
  }

  return (
    <>
      <PageHeader
        title="영업 기회"
        description="거래처별 영업 건을 등록해 두면 단계·예상 매출이 파이프라인으로 모입니다."
        actions={
          <NewOpportunityButton
            accounts={accounts}
            owners={owners}
            defaultOwnerId={user.id}
          />
        }
      />

      <div className="flex-1 space-y-4 overflow-auto p-8">
        {/* 단계가 몇 개인지·어떤 순서인지 목록에서 바로 보이도록 흐름을 먼저 안내한다 */}
        <StageFlowGuide />

        <Suspense fallback={<div className="h-9" />}>
          {/* 총 건수·합계는 검색란과 같은 줄 우측에 둔다 — 세로 공간을 아낀다 (기회-15) */}
          <OpportunitiesToolbar owners={owners}>
            {pagination.totalCount > 0 ? (
              <p className="flex items-center gap-1.5 text-xs text-muted-foreground">
                <span>
                  총 {formatNumber(pagination.totalCount)}건 · 예상 금액 합계{" "}
                  <span className="font-medium text-foreground">
                    {formatKRW(summary.totalAmount)}
                  </span>
                </span>
                {/* 기준 안내는 폭이 고정된 ⓘ 로 접는다 — 문구로 붙이면 같은 줄 입력이 흔들린다 */}
                {isFiltering ? (
                  <InfoHint label="합계 기준 안내">
                    검색·필터를 적용한 결과 전체를 기준으로 낸 건수와 합계입니다.
                    현재 페이지에 보이는 행만 더한 값이 아닙니다.
                  </InfoHint>
                ) : null}
              </p>
            ) : null}
          </OpportunitiesToolbar>
        </Suspense>

        {pagination.totalCount === 0 ? (
          <div className="flex flex-col items-center justify-center gap-3 rounded-lg border border-dashed py-20 text-center">
            {isFiltering ? (
              <>
                <SearchX className="size-10 text-muted-foreground" />
                <p className="text-sm text-muted-foreground">
                  조건에 맞는 영업 기회가 없습니다. 검색어나 필터를 바꿔
                  찾아보세요.
                </p>
              </>
            ) : (
              <>
                <Target className="size-10 text-muted-foreground" />
                <p className="text-sm text-muted-foreground">
                  아직 등록된 영업 기회가 없습니다. 첫 기회를 등록하시면 여기에
                  모입니다.
                </p>
                <NewOpportunityButton
                  accounts={accounts}
                  owners={owners}
                  defaultOwnerId={user.id}
                  label="첫 기회 등록"
                  variant="outline"
                />
              </>
            )}
          </div>
        ) : isBoard ? (
          // 클라이언트에는 직렬화 가능한 DTO 만 넘긴다 (Prisma 레코드·Date 를 그대로 넘기지 않는다)
          <OpportunityBoard opportunities={opportunities.map(toOpportunityDTO)} />
        ) : (
          <>
            <div className="overflow-hidden rounded-lg border">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>기회명</TableHead>
                    <TableHead>거래처</TableHead>
                    <TableHead>단계</TableHead>
                    <TableHead className="text-right">예상 금액</TableHead>
                    <TableHead className="text-right">예상 마감일</TableHead>
                    {/* 거래처 담당자와 헷갈리지 않게 못박는다 (기회-14) */}
                    <TableHead>영업 담당자</TableHead>
                    <TableHead className="w-12">
                      <span className="sr-only">관리</span>
                    </TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {opportunities.map((opportunity) => (
                    // 행 어디를 눌러도 상세로 간다 (거래처-1 과 같은 규칙) — 덮개는 기회명 링크가 만든다
                    <TableRow key={opportunity.id} className={ROW_LINK_ROW}>
                      <TableCell className="font-medium">
                        <RowLink href={`/opportunities/${opportunity.id}`}>
                          {opportunity.name}
                        </RowLink>
                      </TableCell>
                      {/* 거래처 링크는 덮개 위로 올려 자기 목적지(거래처 상세)를 지킨다 */}
                      <TableCell className={ROW_LINK_ABOVE}>
                        <Link
                          href={`/accounts/${opportunity.accountId}`}
                          className="rounded text-muted-foreground transition-colors hover:text-primary hover:underline focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
                        >
                          {opportunity.account.companyName}
                        </Link>
                      </TableCell>
                      <TableCell>
                        <StageBadge stage={opportunity.stage} />
                      </TableCell>
                      <TableCell className="text-right">
                        {formatKRW(opportunity.expectedAmount)}
                      </TableCell>
                      <TableCell className="text-right text-muted-foreground">
                        {opportunity.expectedCloseDate ? (
                          formatDate(opportunity.expectedCloseDate)
                        ) : (
                          <span title="예상 마감일을 아직 정하지 않았습니다.">
                            미정
                          </span>
                        )}
                      </TableCell>
                      <TableCell>{opportunity.owner.name}</TableCell>
                      {/* 덮개 위로 올려 메뉴 클릭이 상세로 새지 않게 한다 */}
                      <TableCell className={`text-right ${ROW_LINK_ABOVE}`}>
                        <OpportunityRowActions
                          opportunity={toOpportunityDTO(opportunity)}
                          // 수정 다이얼로그 후보는 위에서 이미 조회한 값을 재사용한다
                          accounts={accounts}
                          owners={owners}
                        />
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
              label="영업 기회 목록 페이지"
            />
          </>
        )}
      </div>
    </>
  );
}
