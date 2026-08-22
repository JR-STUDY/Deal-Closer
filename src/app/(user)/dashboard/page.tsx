import Link from "next/link";
import {
  FileText,
  Send,
  CheckCircle2,
  Sparkles,
  TrendingUp,
} from "lucide-react";
import { prisma } from "@/lib/db";
import { getCurrentOrg } from "@/lib/session";
import { formatKRW, formatDate } from "@/lib/format";
import {
  ACTIVE_DOCUMENT_STATUSES,
  DOCUMENT_STATUS_LABELS,
} from "@/lib/constants";
import {
  MONTH_PARAM,
  calendarGrid,
  gridRange,
  isSameMonth,
  monthHref,
  monthOf,
  monthRevenue,
  parseMonthParam,
  shiftMonth,
} from "@/lib/calendar";
import { PageHeader } from "@/components/page-header";
import { StatusBadge, DocTypeBadge } from "@/components/status-badge";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { TrendChart, StatusChart } from "./_components/dashboard-charts";
import { OpportunityCalendar } from "./_components/opportunity-calendar";

/** 대시보드가 스스로 다루는 쿼리는 보고 있는 달 하나뿐이다 (`?month=YYYY-MM`) */
type DashboardSearchParams = Promise<Record<string, string | string[] | undefined>>;

/** 배열로 들어온 파라미터(같은 키를 두 번 적은 주소)는 첫 값만 본다 */
function firstParam(value: string | string[] | undefined): string | undefined {
  return Array.isArray(value) ? value[0] : value;
}

export default async function DashboardPage({
  searchParams,
}: {
  searchParams: DashboardSearchParams;
}) {
  // Next.js 16: searchParams 는 Promise 다
  const [org, query] = await Promise.all([getCurrentOrg(), searchParams]);

  // 캘린더가 보여줄 달 — 잘못된 값이면 `parseMonthParam` 이 이번 달로 떨어뜨린다
  const today = new Date();
  const month = parseMonthParam(firstParam(query[MONTH_PARAM]), today);
  // 조회 범위는 **그리드 구간**이다 — 그 달만 읽으면 같은 주에 걸친 앞뒤 달 칸이 늘 비어 보인다
  const calendarRange = gridRange(month);

  // 폐기(VOID) 문서는 대시보드 집계·목록에서 제외 (정책: ACTIVE_DOCUMENT_STATUSES)
  const activeWhere = { orgId: org.id, status: { not: "VOID" } };
  const [docs, recent, wallet, closingOpportunities] = await Promise.all([
    prisma.document.findMany({
      where: activeWhere,
      select: { createdAt: true, amount: true, status: true },
    }),
    prisma.document.findMany({
      where: activeWhere,
      orderBy: { createdAt: "desc" },
      take: 6,
      include: { author: true },
    }),
    prisma.creditWallet.findUnique({ where: { orgId: org.id } }),
    prisma.opportunity.findMany({
      where: {
        orgId: org.id,
        expectedCloseDate: { gte: calendarRange.start, lt: calendarRange.end },
      },
      select: {
        id: true,
        name: true,
        stage: true,
        expectedAmount: true,
        expectedCloseDate: true,
      },
      orderBy: [{ expectedCloseDate: "asc" }, { id: "asc" }],
    }),
  ]);

  // 그리드·합계 계산은 `@/lib/calendar` 순수 함수만 한다 (화면은 그리기만 한다)
  const calendar = calendarGrid({ target: month, opportunities: closingOpportunities, today });
  const calendarRevenue = monthRevenue(closingOpportunities, month);

  // ── 집계 (단일 조회에서 파생) ──
  type ActiveStatus = (typeof ACTIVE_DOCUMENT_STATUSES)[number];
  const total = docs.length;
  const byStatus: Record<ActiveStatus, number> = {
    DRAFT: 0,
    SENT: 0,
    COMPLETED: 0,
  };
  const monthMap = new Map<string, { count: number; revenue: number }>();
  let revenue = 0;

  for (const d of docs) {
    byStatus[d.status as ActiveStatus] += 1;
    if (d.status === "COMPLETED") revenue += d.amount;

    const dt = d.createdAt;
    const key = `${dt.getFullYear()}-${String(dt.getMonth() + 1).padStart(2, "0")}`;
    const bucket = monthMap.get(key) ?? { count: 0, revenue: 0 };
    bucket.count += 1;
    if (d.status === "COMPLETED") bucket.revenue += d.amount;
    monthMap.set(key, bucket);
  }

  // 월별 추이 + 누적 계약 매출 — 누적선은 우상향 곡선으로 성장 추세를 보여준다.
  // (월 수가 적어 각 시점 누적을 앞구간 합으로 구한다 — 렌더 중 외부 변수 재할당 회피)
  const sortedMonths = [...monthMap.entries()].sort(([a], [b]) =>
    a.localeCompare(b),
  );
  const trend = sortedMonths.map(([key, v], i) => ({
    label: `${Number(key.slice(5))}월`,
    count: v.count,
    revenue: v.revenue,
    cumulative: sortedMonths
      .slice(0, i + 1)
      .reduce((sum, [, m]) => sum + m.revenue, 0),
  }));

  const statusData = ACTIVE_DOCUMENT_STATUSES.flatMap((s) =>
    byStatus[s] > 0
      ? [{ key: s, label: DOCUMENT_STATUS_LABELS[s], count: byStatus[s] }]
      : [],
  );

  // 성사율: 고객에게 전달된 문서(발송완료 + 계약완료) 중 계약 성사 비율
  const reached = byStatus.SENT + byStatus.COMPLETED;
  const conversionRate =
    reached > 0 ? Math.round((byStatus.COMPLETED / reached) * 100) : 0;
  // 평균 계약 규모 — 계약완료 매출 ÷ 계약완료 건수
  const avgDeal =
    byStatus.COMPLETED > 0 ? Math.round(revenue / byStatus.COMPLETED) : 0;

  const kpis = [
    {
      label: "전체 문서",
      value: `${total}건`,
      icon: FileText,
      hint: `초안 ${byStatus.DRAFT}건`,
    },
    {
      label: "발송 완료",
      value: `${byStatus.SENT}건`,
      icon: Send,
      hint: "고객 발송분",
    },
    {
      label: "계약 완료",
      value: `${byStatus.COMPLETED}건`,
      icon: CheckCircle2,
      hint: `성사율 ${conversionRate}%`,
    },
    {
      label: "계약 매출",
      value: formatKRW(revenue),
      icon: TrendingUp,
      hint: `평균 계약 ${formatKRW(avgDeal)}`,
    },
  ];

  return (
    <>
      <PageHeader
        title="영업 대시보드"
        description="영업 문서 현황과 최근 활동을 한눈에 확인하세요."
        actions={
          <>
            <Badge variant="secondary" className="gap-1">
              <Sparkles className="size-3.5 text-primary" />
              {wallet?.balance ?? 0} Credits
            </Badge>
            <Button asChild>
              <Link href="/generator">
                <Sparkles className="size-4" />새 문서 생성
              </Link>
            </Button>
          </>
        }
      />

      <div className="flex-1 space-y-6 overflow-auto p-8 [scrollbar-gutter:stable]">
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {kpis.map((kpi) => (
            <Card key={kpi.label}>
              <CardHeader className="pb-2">
                <CardDescription className="flex items-center gap-2">
                  <kpi.icon className="size-4" />
                  {kpi.label}
                </CardDescription>
                <CardTitle className="text-2xl">{kpi.value}</CardTitle>
              </CardHeader>
              <CardContent>
                <p className="text-xs text-muted-foreground">{kpi.hint}</p>
              </CardContent>
            </Card>
          ))}
        </div>

        <div className="grid gap-6 lg:grid-cols-3">
          <Card className="lg:col-span-2">
            <CardHeader>
              <CardTitle className="text-base">문서 발행 · 누적 계약 매출 추이</CardTitle>
              <CardDescription>
                최근 {trend.length}개월간 생성한 문서 수와 누적 계약 매출입니다.
                두 값은 단위가 달라 한 그래프에 겹치지 않고 위아래로 나눠 그립니다.
                누적 매출은 {formatKRW(revenue)}까지 우상향했습니다.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <TrendChart data={trend} />
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="text-base">문서 상태 분포</CardTitle>
              <CardDescription>
                초안 · 발송완료 · 계약완료 비중입니다 (폐기 문서 제외).
              </CardDescription>
            </CardHeader>
            <CardContent>
              <StatusChart data={statusData} total={total} />
              <ul className="mt-2 space-y-1">
                {statusData.map((s) => (
                  <li
                    key={s.key}
                    className="flex items-center justify-between gap-2 text-sm"
                  >
                    <StatusBadge status={s.key} />
                    <span className="text-muted-foreground tabular-nums">
                      {s.count}건 · {total > 0 ? Math.round((s.count / total) * 100) : 0}%
                    </span>
                  </li>
                ))}
              </ul>
            </CardContent>
          </Card>
        </div>

        <OpportunityCalendar
          grid={calendar}
          revenue={calendarRevenue}
          prevHref={monthHref("/dashboard", {}, shiftMonth(month, -1), today)}
          nextHref={monthHref("/dashboard", {}, shiftMonth(month, 1), today)}
          todayHref={monthHref("/dashboard", {}, monthOf(today), today)}
          isCurrentMonth={isSameMonth(month, monthOf(today))}
        />

        <Card>
          <CardHeader className="flex-row items-center justify-between">
            <CardTitle className="text-base">최근 문서</CardTitle>
            <Button asChild variant="ghost" size="sm">
              <Link href="/library">전체 보기</Link>
            </Button>
          </CardHeader>
          <CardContent>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>제목</TableHead>
                  <TableHead>종류</TableHead>
                  <TableHead>상태</TableHead>
                  <TableHead className="text-right">금액</TableHead>
                  <TableHead className="text-right">작성일</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {recent.map((doc) => (
                  <TableRow key={doc.id}>
                    <TableCell className="max-w-xs">
                      <Link
                        href={`/editor/${doc.id}`}
                        className="font-medium hover:underline"
                      >
                        {doc.title}
                      </Link>
                      {doc.clientName ? (
                        <div className="text-xs text-muted-foreground">
                          {doc.clientName}
                        </div>
                      ) : null}
                    </TableCell>
                    <TableCell>
                      <DocTypeBadge type={doc.type} />
                    </TableCell>
                    <TableCell>
                      <StatusBadge status={doc.status} />
                    </TableCell>
                    <TableCell className="text-right tabular-nums">
                      {formatKRW(doc.amount)}
                    </TableCell>
                    <TableCell className="text-right text-sm text-muted-foreground tabular-nums">
                      {formatDate(doc.createdAt)}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      </div>
    </>
  );
}
