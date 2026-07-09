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
  DOCUMENT_STATUSES,
  DOCUMENT_STATUS_LABELS,
  DOCUMENT_TYPES,
  DOCUMENT_TYPE_LABELS,
  type DocumentStatus,
  type DocumentType,
} from "@/lib/constants";
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
import {
  TrendChart,
  StatusChart,
  TypeChart,
} from "./_components/dashboard-charts";

const TYPE_FILL: Record<DocumentType, string> = {
  QUOTE: "#4f46e5",
  CONTRACT: "#7c3aed",
  NDA: "#0ea5e9",
  PROPOSAL: "#14b8a6",
};

export default async function DashboardPage() {
  const org = await getCurrentOrg();

  const [docs, recent, wallet] = await Promise.all([
    prisma.document.findMany({
      where: { orgId: org.id },
      select: { createdAt: true, amount: true, status: true, type: true },
    }),
    prisma.document.findMany({
      where: { orgId: org.id },
      orderBy: { createdAt: "desc" },
      take: 6,
      include: { author: true },
    }),
    prisma.creditWallet.findUnique({ where: { orgId: org.id } }),
  ]);

  // ── 집계 (단일 조회에서 파생) ──
  const total = docs.length;
  const byStatus = { DRAFT: 0, SENT: 0, COMPLETED: 0 } as Record<
    DocumentStatus,
    number
  >;
  const byType = { QUOTE: 0, CONTRACT: 0, NDA: 0, PROPOSAL: 0 } as Record<
    DocumentType,
    number
  >;
  const monthMap = new Map<string, { count: number; revenue: number }>();
  let revenue = 0;

  for (const d of docs) {
    byStatus[d.status as DocumentStatus] += 1;
    byType[d.type as DocumentType] += 1;
    if (d.status === "COMPLETED") revenue += d.amount;

    const dt = d.createdAt;
    const key = `${dt.getFullYear()}-${String(dt.getMonth() + 1).padStart(2, "0")}`;
    const bucket = monthMap.get(key) ?? { count: 0, revenue: 0 };
    bucket.count += 1;
    if (d.status === "COMPLETED") bucket.revenue += d.amount;
    monthMap.set(key, bucket);
  }

  const trend = [...monthMap.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([key, v]) => ({
      label: `${Number(key.slice(5))}월`,
      count: v.count,
      revenue: v.revenue,
    }));

  const statusData = DOCUMENT_STATUSES.flatMap((s) =>
    byStatus[s] > 0
      ? [{ key: s, label: DOCUMENT_STATUS_LABELS[s], count: byStatus[s] }]
      : [],
  );

  const typeData = DOCUMENT_TYPES.map((t) => ({
    label: DOCUMENT_TYPE_LABELS[t],
    count: byType[t],
    fill: TYPE_FILL[t],
  }));

  // 성사율: 고객에게 전달된 문서(발송완료 + 계약완료) 중 계약 성사 비율
  const reached = byStatus.SENT + byStatus.COMPLETED;
  const conversionRate =
    reached > 0 ? Math.round((byStatus.COMPLETED / reached) * 100) : 0;

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
          <CardHeader>
            <CardTitle className="text-base">월별 문서 · 계약 매출 추이</CardTitle>
            <CardDescription>
              최근 {trend.length}개월간 생성한 문서 수(막대)와 계약 완료 매출(선)입니다.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <TrendChart data={trend} />
          </CardContent>
        </Card>

        <div className="grid gap-6 lg:grid-cols-2">
          <Card>
            <CardHeader>
              <CardTitle className="text-base">문서 상태 분포</CardTitle>
              <CardDescription>초안 · 발송완료 · 계약완료 비중</CardDescription>
            </CardHeader>
            <CardContent>
              <StatusChart data={statusData} total={total} />
              <div className="mt-2 flex justify-center gap-4">
                {statusData.map((s) => (
                  <div key={s.key} className="flex items-center gap-1.5 text-sm">
                    <StatusBadge status={s.key} />
                    <span className="tabular-nums text-muted-foreground">
                      {s.count}건
                    </span>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="text-base">문서 종류 분포</CardTitle>
              <CardDescription>
                견적서 · 계약서 · NDA · 제안서 생성 건수
              </CardDescription>
            </CardHeader>
            <CardContent>
              <TypeChart data={typeData} />
            </CardContent>
          </Card>
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
