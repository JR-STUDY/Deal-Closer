import Link from "next/link";
import { FileText, Send, CheckCircle2, Sparkles } from "lucide-react";
import { prisma } from "@/lib/db";
import { getCurrentOrg } from "@/lib/session";
import { formatKRW, formatDate } from "@/lib/format";
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

export default async function DashboardPage() {
  const org = await getCurrentOrg();

  const [total, draft, sent, completed, revenue, wallet, recent] =
    await Promise.all([
      prisma.document.count({
        where: { orgId: org.id, status: { not: "VOID" } },
      }),
      prisma.document.count({ where: { orgId: org.id, status: "DRAFT" } }),
      prisma.document.count({ where: { orgId: org.id, status: "SENT" } }),
      prisma.document.count({ where: { orgId: org.id, status: "COMPLETED" } }),
      prisma.document.aggregate({
        where: { orgId: org.id, status: "COMPLETED" },
        _sum: { amount: true },
      }),
      prisma.creditWallet.findUnique({ where: { orgId: org.id } }),
      prisma.document.findMany({
        where: { orgId: org.id, status: { not: "VOID" } },
        orderBy: { createdAt: "desc" },
        take: 6,
        include: { author: true },
      }),
    ]);

  const kpis = [
    {
      label: "전체 문서",
      value: `${total}건`,
      icon: FileText,
      hint: `초안 ${draft}건`,
    },
    {
      label: "발송 완료",
      value: `${sent}건`,
      icon: Send,
      hint: "고객 발송분",
    },
    {
      label: "계약 완료",
      value: `${completed}건`,
      icon: CheckCircle2,
      hint: "성사된 거래",
    },
    {
      label: "계약 매출",
      value: formatKRW(revenue._sum.amount ?? 0),
      icon: CheckCircle2,
      hint: "계약완료 합계",
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
