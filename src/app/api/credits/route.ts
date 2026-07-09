import { prisma } from "@/lib/db";
import { getCurrentOrg } from "@/lib/session";
import { ok } from "@/lib/api";

/** GET /api/credits — 크레딧 지갑 잔액 + 거래 내역 */
export async function GET() {
  const org = await getCurrentOrg();

  const [wallet, transactions] = await Promise.all([
    prisma.creditWallet.findUnique({ where: { orgId: org.id } }),
    prisma.creditTransaction.findMany({
      where: { orgId: org.id },
      orderBy: { createdAt: "desc" },
    }),
  ]);

  return ok({ balance: wallet?.balance ?? 0, transactions });
}
