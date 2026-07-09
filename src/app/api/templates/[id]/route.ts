import type { NextRequest } from "next/server";
import { prisma } from "@/lib/db";
import { getCurrentOrg } from "@/lib/session";
import { ok, fail } from "@/lib/api";

type Params = { params: Promise<{ id: string }> };

/** DELETE /api/templates/:id — 베이스 템플릿 삭제 (라인아이템은 Cascade) */
export async function DELETE(_req: NextRequest, { params }: Params) {
  const { id } = await params;
  const org = await getCurrentOrg();

  const template = await prisma.documentTemplate.findFirst({
    where: { id, orgId: org.id },
    select: { id: true },
  });
  if (!template) return fail("템플릿을 찾을 수 없습니다.", 404);

  await prisma.documentTemplate.delete({ where: { id } });
  return ok({ id });
}
