import { prisma } from "@/lib/db";
import { getCurrentUser } from "@/lib/session";
import { ok } from "@/lib/api";

/** GET /api/email-accounts — 현재 사용자의 메일 연동 계정 목록 */
export async function GET() {
  const user = await getCurrentUser();
  const accounts = await prisma.emailAccount.findMany({
    where: { userId: user.id },
    orderBy: { createdAt: "asc" },
  });
  return ok(accounts);
}
