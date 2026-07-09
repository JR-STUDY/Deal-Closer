import { Wallet, ArrowUpCircle, ArrowDownCircle, Receipt } from "lucide-react";
import { prisma } from "@/lib/db";
import { getCurrentOrg } from "@/lib/session";
import { formatNumber, formatDateTime } from "@/lib/format";
import { PageHeader } from "@/components/page-header";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
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
import { cn } from "@/lib/utils";
import { ChargeCreditDialog } from "./_components/charge-credit-dialog";

/** 크레딧 잔액 시각화 기준치 (초기 프로모션 지급 기준) */
const WALLET_MAX_BALANCE = 200;

export default async function BillingPage() {
  const org = await getCurrentOrg();

  const [wallet, chargeAgg, usageAgg, transactions] = await Promise.all([
    prisma.creditWallet.findUnique({ where: { orgId: org.id } }),
    prisma.creditTransaction.aggregate({
      where: { orgId: org.id, type: "CHARGE" },
      _sum: { amount: true },
    }),
    prisma.creditTransaction.aggregate({
      where: { orgId: org.id, type: "USAGE" },
      _sum: { amount: true },
    }),
    prisma.creditTransaction.findMany({
      where: { orgId: org.id },
      orderBy: { createdAt: "desc" },
    }),
  ]);

  const balance = wallet?.balance ?? 0;
  const totalCharge = chargeAgg._sum.amount ?? 0;
  const totalUsage = Math.abs(usageAgg._sum.amount ?? 0);
  const balanceRatio = Math.min(
    100,
    Math.round((balance / WALLET_MAX_BALANCE) * 100),
  );

  return (
    <>
      <PageHeader
        title="요금·크레딧 관리"
        description="조직의 크레딧 잔액과 충전·사용 내역을 관리합니다."
        actions={<ChargeCreditDialog />}
      />

      <div className="flex-1 space-y-6 overflow-auto p-8">
        <Card>
          <CardHeader className="pb-2">
            <CardDescription className="flex items-center gap-2">
              <Wallet className="size-4" />
              현재 크레딧 잔액
            </CardDescription>
            <CardTitle className="text-4xl tabular-nums">
              {formatNumber(balance)}
              <span className="ml-1.5 text-base font-normal text-muted-foreground">
                Credits
              </span>
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            <Progress value={balanceRatio} />
            <p className="text-xs text-muted-foreground">
              기준치 {formatNumber(WALLET_MAX_BALANCE)} Credits 대비{" "}
              {balanceRatio}% 보유 중입니다.
            </p>
          </CardContent>
        </Card>

        <div className="grid gap-4 sm:grid-cols-2">
          <Card>
            <CardHeader className="pb-2">
              <CardDescription className="flex items-center gap-2">
                <ArrowUpCircle className="size-4" />
                총 충전
              </CardDescription>
              <CardTitle className="text-2xl tabular-nums">
                +{formatNumber(totalCharge)} Credits
              </CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-xs text-muted-foreground">
                누적 충전된 크레딧 합계
              </p>
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="pb-2">
              <CardDescription className="flex items-center gap-2">
                <ArrowDownCircle className="size-4" />
                총 사용
              </CardDescription>
              <CardTitle className="text-2xl tabular-nums">
                -{formatNumber(totalUsage)} Credits
              </CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-xs text-muted-foreground">
                문서 생성에 사용된 크레딧 합계
              </p>
            </CardContent>
          </Card>
        </div>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              <Receipt className="size-4" />
              크레딧 거래 내역
            </CardTitle>
            <CardDescription>
              최신 거래부터 순서대로 표시됩니다.
            </CardDescription>
          </CardHeader>
          <CardContent>
            {transactions.length === 0 ? (
              <div className="flex flex-col items-center justify-center gap-2 rounded-lg border border-dashed py-10 text-center">
                <p className="text-sm text-muted-foreground">
                  아직 거래 내역이 없습니다.
                </p>
              </div>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>일시</TableHead>
                    <TableHead>유형</TableHead>
                    <TableHead className="text-right">금액</TableHead>
                    <TableHead>사유</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {transactions.map((tx) => {
                    const isCharge = tx.type === "CHARGE";
                    return (
                      <TableRow key={tx.id}>
                        <TableCell className="text-sm text-muted-foreground tabular-nums">
                          {formatDateTime(tx.createdAt)}
                        </TableCell>
                        <TableCell>
                          <Badge
                            className={cn(
                              "border-0",
                              isCharge
                                ? "bg-emerald-100 text-emerald-800 dark:bg-emerald-500/15 dark:text-emerald-300"
                                : "bg-muted text-muted-foreground",
                            )}
                          >
                            {isCharge ? "충전" : "사용"}
                          </Badge>
                        </TableCell>
                        <TableCell
                          className={cn(
                            "text-right font-medium tabular-nums",
                            isCharge
                              ? "text-emerald-600 dark:text-emerald-400"
                              : "text-muted-foreground",
                          )}
                        >
                          {tx.amount > 0 ? "+" : ""}
                          {formatNumber(tx.amount)}
                        </TableCell>
                        <TableCell className="text-muted-foreground">
                          {tx.reason ?? "-"}
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            )}
          </CardContent>
        </Card>
      </div>
    </>
  );
}
