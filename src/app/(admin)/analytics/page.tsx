import { TrendingUp, FileCheck2, Send, Percent } from "lucide-react";
import { prisma } from "@/lib/db";
import { getCurrentOrg } from "@/lib/session";
import { formatKRW } from "@/lib/format";
import { USER_ROLE_LABELS, type UserRole } from "@/lib/constants";
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

export default async function AnalyticsPage() {
  const org = await getCurrentOrg();

  const [revenueAgg, completedCount, sentCount, users, totalByAuthor, completedByAuthor] =
    await Promise.all([
      prisma.document.aggregate({
        where: { orgId: org.id, status: "COMPLETED" },
        _sum: { amount: true },
      }),
      prisma.document.count({ where: { orgId: org.id, status: "COMPLETED" } }),
      prisma.document.count({ where: { orgId: org.id, status: "SENT" } }),
      prisma.user.findMany({
        where: { orgId: org.id },
        orderBy: { name: "asc" },
      }),
      prisma.document.groupBy({
        by: ["authorId"],
        where: { orgId: org.id },
        _count: { _all: true },
      }),
      prisma.document.groupBy({
        by: ["authorId"],
        where: { orgId: org.id, status: "COMPLETED" },
        _count: { _all: true },
        _sum: { amount: true },
      }),
    ]);

  const revenue = revenueAgg._sum.amount ?? 0;
  const conversionRate =
    sentCount > 0 ? Math.round((completedCount / sentCount) * 100) : 0;

  const totalMap = new Map(
    totalByAuthor.map((row) => [row.authorId, row._count._all]),
  );
  const completedMap = new Map(
    completedByAuthor.map((row) => [
      row.authorId,
      { count: row._count._all, revenue: row._sum.amount ?? 0 },
    ]),
  );

  const reps = users
    .map((user) => {
      const completed = completedMap.get(user.id);
      return {
        user,
        docCount: totalMap.get(user.id) ?? 0,
        completedCount: completed?.count ?? 0,
        revenue: completed?.revenue ?? 0,
      };
    })
    .sort((a, b) => b.revenue - a.revenue);

  const maxRevenue = Math.max(...reps.map((r) => r.revenue), 1);

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
      label: "전환율",
      value: `${conversionRate}%`,
      icon: Percent,
      hint: "발송 대비 계약완료 비율",
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
                      <TableCell className="text-right">
                        <div className="space-y-1.5">
                          <div className="text-right font-medium tabular-nums">
                            {formatKRW(row.revenue)}
                          </div>
                          <div className="h-1.5 w-full overflow-hidden rounded-full bg-muted">
                            <div
                              className="h-full rounded-full bg-primary"
                              style={{
                                width: `${(row.revenue / maxRevenue) * 100}%`,
                              }}
                            />
                          </div>
                        </div>
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
