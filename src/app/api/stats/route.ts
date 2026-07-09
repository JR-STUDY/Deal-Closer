import { prisma } from "@/lib/db";
import { getCurrentOrg } from "@/lib/session";
import { ok } from "@/lib/api";

/** GET /api/stats — 대시보드/통계 집계 */
export async function GET() {
  const org = await getCurrentOrg();
  const where = { orgId: org.id };

  const [total, draft, sent, completed, revenue] = await Promise.all([
    prisma.document.count({ where: { ...where, status: { not: "VOID" } } }),
    prisma.document.count({ where: { ...where, status: "DRAFT" } }),
    prisma.document.count({ where: { ...where, status: "SENT" } }),
    prisma.document.count({ where: { ...where, status: "COMPLETED" } }),
    prisma.document.aggregate({
      where: { ...where, status: "COMPLETED" },
      _sum: { amount: true },
    }),
  ]);

  const conversionRate = sent > 0 ? Math.round((completed / sent) * 100) : 0;

  return ok({
    documents: { total, draft, sent, completed },
    revenue: revenue._sum.amount ?? 0,
    conversionRate,
  });
}
