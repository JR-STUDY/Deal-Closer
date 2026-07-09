import type { NextRequest } from "next/server";
import { prisma } from "@/lib/db";
import { getCurrentOrg } from "@/lib/session";
import { ok } from "@/lib/api";

/** GET /api/catalog?category= — 카탈로그(마스터 데이터) 목록 */
export async function GET(req: NextRequest) {
  const org = await getCurrentOrg();
  const category = req.nextUrl.searchParams.get("category") ?? undefined;

  const items = await prisma.catalogItem.findMany({
    where: {
      orgId: org.id,
      ...(category ? { category } : {}),
    },
    orderBy: [{ category: "asc" }, { name: "asc" }],
  });

  return ok(items);
}
