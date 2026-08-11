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

      {/* scrollbar-gutter: 스크롤바가 생겼다 사라지며 본문 폭이 통째로 흔들리는 것을 막는다.
          표 폭을 고정해도 이 컨테이너가 좁아지면 잔여 폭을 흡수하는 칸이 따라 움직인다. */}
      <div className="flex-1 space-y-4 overflow-auto p-8 [scrollbar-gutter:stable]">
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
              {/*
                컬럼 폭을 고정한다 (A-5). 표 기본값(table-layout: auto)은 그 페이지에 실제로 담긴
                내용으로 폭을 다시 계산해서, 페이지를 넘기거나 필터를 걸 때마다 칸 경계가 옮겨간다.
                `table-fixed` 는 **머리행에 적힌 폭만** 보므로 행 내용과 무관하게 같은 자리에 선다.

                폭은 실제 값을 재서 잡았다. 남는 폭은 **기회명 한 칸만** 흡수한다(폭을 적지 않은
                유일한 칸) — 행의 정체이자 가장 길고 들쭉날쭉한 값이라 여기에 몰아주는 편이 낫고,
                나머지는 화면이 넓어져도 그대로라 시선 위치가 유지된다. 좁은 화면에서는 `min-w`
                아래로 눌리는 대신 표 컨테이너(`overflow-x-auto`)가 가로로 스크롤된다.
              */}
              <Table className="min-w-[960px] table-fixed">
                <TableHeader>
                  <TableRow>
                    {/* 폭 미지정 = 남는 폭 전부. `min-w` 에서 최소 224px 를 보장받는다 */}
                    <TableHead>기회명</TableHead>
                    {/* 208px: "(주)에이비씨 테크놀로지"·"Bluewave Systems Korea" 가 잘리지 않는 폭 */}
                    <TableHead className="w-[208px]">거래처</TableHead>
                    {/* 104px: 가장 긴 배지 "검토/협상" 기준. 배지 칸은 더 넓을 이유가 없다 */}
                    <TableHead className="w-[104px]">단계</TableHead>
                    {/* 144px: "₩1,800,000,000"(10억대)까지 한 줄로 들어가는 폭 */}
                    <TableHead className="w-[144px] text-right">
                      예상 금액
                    </TableHead>
                    {/* 112px: 값 "2026.08.15" 보다 머리글 "예상 마감일" 이 길어 머리글이 폭을 정한다 */}
                    <TableHead className="w-[112px] text-right">
                      예상 마감일
                    </TableHead>
                    {/* 거래처 담당자와 헷갈리지 않게 못박는다 (기회-14) */}
                    {/* 112px: 이름(3~4자)보다 머리글이 길다 — 예상 마감일과 같은 폭으로 맞춘다 */}
                    <TableHead className="w-[112px]">영업 담당자</TableHead>
                    {/* 56px: ⋯ 버튼(32px) + 셀 좌우 여백(16px) */}
                    <TableHead className="w-14">
                      <span className="sr-only">관리</span>
                    </TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {opportunities.map((opportunity) => (
                    // 행 어디를 눌러도 상세로 간다 (거래처-1 과 같은 규칙) — 덮개는 기회명 링크가 만든다
                    <TableRow key={opportunity.id} className={ROW_LINK_ROW}>
                      {/* 말줄임·title 은 RowLink 안에서 처리된다 (덮개를 자르지 않는 자리) */}
                      <TableCell className="font-medium">
                        <RowLink
                          href={`/opportunities/${opportunity.id}`}
                          title={opportunity.name}
                        >
                          {opportunity.name}
                        </RowLink>
                      </TableCell>
                      {/*
                        거래처 링크는 덮개 위로 올려 자기 목적지(거래처 상세)를 지킨다.
                        말줄임은 링크가 아니라 **칸**에 건다 — 잘린 자리(…)에 커서를 올려도
                        title 이 뜨고, 링크에 overflow 를 걸지 않아 덮개와도 무관하다.
                      */}
                      <TableCell
                        className={`truncate ${ROW_LINK_ABOVE}`}
                        title={opportunity.account.companyName}
                      >
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
                      {/* 자릿수마다 글자폭이 같아야 칸을 고정한 보람이 있다 (tabular-nums) */}
                      <TableCell className="text-right tabular-nums">
                        {formatKRW(opportunity.expectedAmount)}
                      </TableCell>
                      <TableCell className="text-right tabular-nums text-muted-foreground">
                        {opportunity.expectedCloseDate ? (
                          formatDate(opportunity.expectedCloseDate)
                        ) : (
                          <span title="예상 마감일을 아직 정하지 않았습니다.">
                            미정
                          </span>
                        )}
                      </TableCell>
                      <TableCell className="truncate" title={opportunity.owner.name}>
                        {opportunity.owner.name}
                      </TableCell>
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
