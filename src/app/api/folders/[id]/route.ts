import type { NextRequest } from "next/server";
import { prisma } from "@/lib/db";
import { getCurrentOrg } from "@/lib/session";
import { ok, fail } from "@/lib/api";

type Params = { params: Promise<{ id: string }> };

/**
 * PATCH /api/folders/:id — 폴더 이름 변경 / 상위 폴더 이동
 * body: { name?, parentId? (null 이면 최상위로) }
 */
export async function PATCH(req: NextRequest, { params }: Params) {
  const { id } = await params;
  const org = await getCurrentOrg();

  const existing = await prisma.folder.findFirst({
    where: { id, orgId: org.id },
    select: { id: true },
  });
  if (!existing) return fail("폴더를 찾을 수 없습니다.", 404);

  let body: { name?: unknown; parentId?: unknown };
  try {
    body = await req.json();
  } catch {
    return fail("잘못된 요청 본문입니다.");
  }

  const data: { name?: string; parentId?: string | null } = {};

  if (typeof body.name === "string") {
    const name = body.name.trim();
    if (!name) return fail("폴더 이름은 필수입니다.");
    data.name = name;
  }

  if ("parentId" in body) {
    if (body.parentId === null || body.parentId === "") {
      data.parentId = null;
    } else if (typeof body.parentId === "string") {
      if (body.parentId === id) {
        return fail("폴더를 자기 자신 아래로 이동할 수 없습니다.");
      }
      const parent = await prisma.folder.findFirst({
        where: { id: body.parentId, orgId: org.id },
        select: { id: true },
      });
      if (!parent) return fail("상위 폴더를 찾을 수 없습니다.", 404);
      data.parentId = parent.id;
    }
  }

  const folder = await prisma.folder.update({ where: { id }, data });
  return ok(folder);
}

/**
 * DELETE /api/folders/:id — 폴더 삭제
 * 하위 폴더나 문서가 있으면 실수 방지를 위해 삭제를 막는다(먼저 비워야 함).
 */
export async function DELETE(_req: NextRequest, { params }: Params) {
  const { id } = await params;
  const org = await getCurrentOrg();

  const folder = await prisma.folder.findFirst({
    where: { id, orgId: org.id },
    include: { _count: { select: { documents: true, children: true } } },
  });
  if (!folder) return fail("폴더를 찾을 수 없습니다.", 404);

  if (folder._count.children > 0) {
    return fail("하위 폴더가 있는 폴더는 삭제할 수 없습니다. 먼저 비워 주세요.");
  }
  if (folder._count.documents > 0) {
    return fail(
      "문서가 들어 있는 폴더는 삭제할 수 없습니다. 문서를 옮긴 뒤 삭제해 주세요.",
    );
  }

  await prisma.folder.delete({ where: { id } });
  return ok({ id });
}
