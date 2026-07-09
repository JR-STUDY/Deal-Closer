import { TrendingUp, FileCheck2, Send, Percent } from "lucide-react";
import { prisma } from "@/lib/db";
import { getCurrentOrg } from "@/lib/session";
import { formatKRW } from "@/lib/format";
import {
  USER_ROLE_LABELS,
  type UserRole,
  DOCUMENT_TYPES,
  DOCUMENT_TYPE_LABELS,
  type DocumentType,
} from "@/lib/constants";
import { PageHeader } from "@/components/page-header";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
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
import {
  RevenueTrendChart,
  RepRevenueChart,
  TypeRevenueChart,
} from "./_components/analytics-charts";

const TYPE_FILL: Record<DocumentType, string> = {
  QUOTE: "#4f46e5",
  CONTRACT: "#7c3aed",
  NDA: "#0ea5e9",
  PROPOSAL: "#14b8a6",
};

export default async function AnalyticsPage() {
  const org = await getCurrentOrg();

  // 폐기(VOID) 문서는 통계 집계에서 제외
  const [docs, users] = await Promise.all([
    prisma.document.findMany({
      where: { orgId: org.id, status: { not: "VOID" } },
      select: {
        createdAt: true,
        amount: true,
        status: true,
        type: true,
        authorId: true,
      },
    }),
    prisma.user.findMany({ where: { orgId: org.id }, orderBy: { name: "asc" } }),
  ]);

  // ── 집계 ──
  let revenue = 0;
  let completedCount = 0;
  let sentCount = 0;
  const monthMap = new Map<string, number>();
  const typeRevenue = { QUOTE: 0, CONTRACT: 0, NDA: 0, PROPOSAL: 0 } as Record<
    DocumentType,
    number
  >;
  const authorTotal = new Map<string, number>();
  const authorDone = new Map<string, { count: number; revenue: number }>();

  for (const d of docs) {
    authorTotal.set(d.authorId, (authorTotal.get(d.authorId) ?? 0) + 1);
    if (d.status === "SENT") sentCount += 1;
    if (d.status === "COMPLETED") {
      revenue += d.amount;
      completedCount += 1;
      typeRevenue[d.type as DocumentType] += d.amount;

      const dt = d.createdAt;
      const key = `${dt.getFullYear()}-${String(dt.getMonth() + 1).padStart(2, "0")}`;
      monthMap.set(key, (monthMap.get(key) ?? 0) + d.amount);

      const prev = authorDone.get(d.authorId) ?? { count: 0, revenue: 0 };
      prev.count += 1;
      prev.revenue += d.amount;
      authorDone.set(d.authorId, prev);
    }
  }

  // 성사율: 고객에게 전달된 문서(발송완료 + 계약완료) 중 계약 성사 비율
  const reached = sentCount + completedCount;
  const conversionRate =
    reached > 0 ? Math.round((completedCount / reached) * 100) : 0;

  const revenueTrend = [...monthMap.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([key, rev]) => ({ label: `${Number(key.slice(5))}월`, revenue: rev }));

  const typeRevenueData = DOCUMENT_TYPES.flatMap((t) =>
    typeRevenue[t] > 0
      ? [
          {
            key: t,
            label: DOCUMENT_TYPE_LABELS[t],
            revenue: typeRevenue[t],
            fill: TYPE_FILL[t],
          },
        ]
      : [],
  );

  const reps = users
    .map((user) => {
      const done = authorDone.get(user.id);
      return {
        user,
        docCount: authorTotal.get(user.id) ?? 0,
        completedCount: done?.count ?? 0,
        revenue: done?.revenue ?? 0,
      };
    })
    .sort((a, b) => b.revenue - a.revenue);

  const repChartData = reps.flatMap((r) =>
    r.revenue > 0 ? [{ name: r.user.name, revenue: r.revenue }] : [],
  );

  const kpis = [
    {
      label: "계약 매출",
      value: formatKRW(revenue),
      icon: TrendingUp,
      hint: "계약완료 문서 합계",
    },
    {
      label: "계약 건수",
      value: `${completedCount}건`,
      icon: FileCheck2,
      hint: "계약완료 문서 수",
    },
    {
      label: "발송 건수",
      value: `${sentCount}건`,
      icon: Send,
      hint: "고객 발송 문서 수",
    },
    {
      label: "성사율",
      value: `${conversionRate}%`,
      icon: Percent,
      hint: "고객 전달 문서 대비 계약",
    },
  ];

  return (
    <>
      <PageHeader
        title="통계·리포트"
        description="조직 전체의 영업 문서 실적을 분석합니다."
      />

      <div className="flex-1 space-y-6 overflow-auto p-8">
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

        <Card>
          <CardHeader>
            <CardTitle className="text-base">월별 계약 매출 추이</CardTitle>
            <CardDescription>
              최근 {revenueTrend.length}개월간 계약 완료된 문서의 매출 합계입니다.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <RevenueTrendChart data={revenueTrend} />
          </CardContent>
        </Card>

        <div className="grid gap-6 lg:grid-cols-2">
          <Card>
            <CardHeader>
              <CardTitle className="text-base">담당자별 계약 매출</CardTitle>
              <CardDescription>계약 매출 기여도 순</CardDescription>
            </CardHeader>
            <CardContent>
              <RepRevenueChart data={repChartData} />
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="text-base">문서 종류별 매출 구성</CardTitle>
              <CardDescription>계약 매출이 어느 문서에서 나왔는지</CardDescription>
            </CardHeader>
            <CardContent>
              <TypeRevenueChart data={typeRevenueData} total={revenue} />
              <div className="mt-2 flex flex-wrap justify-center gap-x-4 gap-y-1.5">
                {typeRevenueData.map((t) => (
                  <div key={t.key} className="flex items-center gap-1.5 text-sm">
                    <span
                      className="size-2.5 rounded-[2px]"
                      style={{ backgroundColor: t.fill }}
                    />
                    <span className="text-muted-foreground">{t.label}</span>
                    <span className="tabular-nums">{formatKRW(t.revenue)}</span>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        </div>

        <Card>
          <CardHeader>
            <CardTitle className="text-base">영업 담당자별 실적</CardTitle>
            <CardDescription>
              계약 매출이 높은 순으로 정렬되어 있습니다.
            </CardDescription>
          </CardHeader>
          <CardContent>
            {reps.length === 0 ? (
              <div className="flex flex-col items-center justify-center gap-2 rounded-lg border border-dashed py-10 text-center">
                <p className="text-sm text-muted-foreground">
                  집계할 담당자 데이터가 없습니다.
                </p>
              </div>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="w-10 text-center">순위</TableHead>
                    <TableHead>담당자</TableHead>
                    <TableHead className="text-right">문서 수</TableHead>
                    <TableHead className="text-right">계약완료</TableHead>
                    <TableHead className="text-right">계약 매출</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {reps.map((row, idx) => (
                    <TableRow key={row.user.id}>
                      <TableCell className="text-center font-medium text-muted-foreground">
                        {idx + 1}
                      </TableCell>
                      <TableCell>
                        <div className="flex items-center gap-2.5">
                          <Avatar size="sm">
                            <AvatarFallback>
                              {row.user.name.slice(0, 2)}
                            </AvatarFallback>
                          </Avatar>
                          <div>
                            <div className="font-medium">{row.user.name}</div>
                            <div className="text-xs text-muted-foreground">
                              {USER_ROLE_LABELS[row.user.role as UserRole] ??
                                row.user.role}
                            </div>
                          </div>
                        </div>
                      </TableCell>
                      <TableCell className="text-right tabular-nums">
                        {row.docCount}건
                      </TableCell>
                      <TableCell className="text-right tabular-nums">
                        {row.completedCount}건
                      </TableCell>
                      <TableCell className="text-right font-medium tabular-nums">
                        {formatKRW(row.revenue)}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}
          </CardContent>
        </Card>
      </div>
    </>
  );
}
