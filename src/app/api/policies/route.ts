import { prisma } from "@/lib/db";
import { ok } from "@/lib/api";

/** GET /api/policies — 정책 라이브러리 목록 */
export async function GET() {
  const policies = await prisma.policy.findMany({
    orderBy: { code: "asc" },
  });
  return ok(policies);
}
