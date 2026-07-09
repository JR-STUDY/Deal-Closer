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

  // 성사율: 고객에게 전달된 문서(발송완료 + 계약완료) 중 계약 성사 비율
  const reached = sent + completed;
  const conversionRate =
    reached > 0 ? Math.round((completed / reached) * 100) : 0;

  return ok({
    documents: { total, draft, sent, completed },
    revenue: revenue._sum.amount ?? 0,
    conversionRate,
  });
}
