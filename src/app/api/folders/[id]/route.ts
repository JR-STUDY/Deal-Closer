import type { NextRequest } from "next/server";
import { prisma } from "@/lib/db";
import { getCurrentOrg } from "@/lib/session";
import { ok, fail } from "@/lib/api";

type Params = { params: Promise<{ id: string }> };

/** PATCH /api/folders/:id — 폴더 이름 변경 { name } */
export async function PATCH(req: NextRequest, { params }: Params) {
  const { id } = await params;
  const org = await getCurrentOrg();

  const existing = await prisma.folder.findFirst({
    where: { id, orgId: org.id },
    select: { id: true },
  });
  if (!existing) return fail("폴더를 찾을 수 없습니다.", 404);

  let body: { name?: unknown };
  try {
    body = await req.json();
  } catch {
    return fail("잘못된 요청 본문입니다.");
  }

  const name = typeof body.name === "string" ? body.name.trim() : "";
  if (!name) return fail("폴더 이름은 필수입니다.");

  const folder = await prisma.folder.update({ where: { id }, data: { name } });
  return ok(folder);
}

/**
 * DELETE /api/folders/:id — 폴더 삭제.
 * 폴더 안 문서는 삭제되지 않고 미분류(folderId=null)로 남는다.
 */
export async function DELETE(_req: NextRequest, { params }: Params) {
  const { id } = await params;
  const org = await getCurrentOrg();

  const folder = await prisma.folder.findFirst({
    where: { id, orgId: org.id },
    select: { id: true },
  });
  if (!folder) return fail("폴더를 찾을 수 없습니다.", 404);

  await prisma.folder.delete({ where: { id } });
  return ok({ id });
}
