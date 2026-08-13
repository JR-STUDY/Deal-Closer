import { Suspense } from "react";
import Link from "next/link";
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
import { summarizeByStage } from "@/lib/pipeline";
import { formatDate, formatKRW, formatNumber } from "@/lib/format";
import { PageHeader } from "@/components/page-header";
import { StageBadge } from "@/components/status-badge";
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
import { OpportunityRowActions } from "./_components/opportunity-row-actions";

/**
 * 영업 기회 목록 (F-111) — 기회명·거래처·단계·예상 금액·예상 마감일·담당자.
 *
 * 검색어·단계·담당자는 URL 쿼리(`?q=&stage=&owner=`)로 받아 조회 조건으로 쓴다.
 * 정렬은 예상 마감일 오름차순(임박한 것 먼저)이고 마감일 미정은 뒤로 보낸다.
 * 칸반 보드는 Phase 3(F-112) 범위라 이번에는 리스트 뷰만 제공한다.
 */
export default async function OpportunitiesPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string; stage?: string; owner?: string }>;
}) {
  // searchParams 와 세션 조회는 서로 독립 → 병렬 처리
  const [params, user] = await Promise.all([searchParams, getCurrentUser()]);
  const filters = parseOpportunityFilters(params);

  // 목록·셀렉트 후보는 서로 독립 조회다
  const [opportunities, accounts, owners] = await Promise.all([
    prisma.opportunity.findMany({
      where: opportunitiesWhere(user.orgId, filters),
      orderBy: OPPORTUNITY_LIST_ORDER_BY,
      select: OPPORTUNITY_DTO_SELECT,
    }),
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

  // 합계는 대시보드·캘린더와 같은 순수 함수를 쓴다 (화면끼리 숫자가 어긋나지 않도록)
  const summary = summarizeByStage(opportunities);
  const isFiltering = hasOpportunityFilter(filters);

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
          <OpportunitiesToolbar owners={owners} />
        </Suspense>

        {opportunities.length === 0 ? (
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
        ) : (
          <>
            <p className="text-xs text-muted-foreground">
              총 {formatNumber(summary.totalCount)}건 · 예상 금액 합계{" "}
              <span className="font-medium text-foreground">
                {formatKRW(summary.totalAmount)}
              </span>
              {isFiltering ? " (필터를 적용한 결과 기준입니다)" : ""}
            </p>
            <div className="overflow-hidden rounded-lg border">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>기회명</TableHead>
                    <TableHead>거래처</TableHead>
                    <TableHead>단계</TableHead>
                    <TableHead className="text-right">예상 금액</TableHead>
                    <TableHead className="text-right">예상 마감일</TableHead>
                    <TableHead>담당자</TableHead>
                    <TableHead className="w-12">
                      <span className="sr-only">관리</span>
                    </TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {opportunities.map((opportunity) => (
                    <TableRow key={opportunity.id}>
                      <TableCell className="font-medium">
                        <Link
                          href={`/opportunities/${opportunity.id}`}
                          className="rounded transition-colors hover:text-primary hover:underline focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
                        >
                          {opportunity.name}
                        </Link>
                      </TableCell>
                      <TableCell>
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
                      {/* 기회명 링크와 영역을 분리해 메뉴 클릭이 상세로 새지 않게 한다 */}
                      <TableCell className="text-right">
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
          </>
        )}
      </div>
    </>
  );
}
