import type { NextRequest } from "next/server";
import { prisma } from "@/lib/db";
import { ok, fail } from "@/lib/api";

type Params = { params: Promise<{ id: string }> };

/** GET /api/documents/:id — 단건 + 라인아이템 */
export async function GET(_req: NextRequest, { params }: Params) {
  const { id } = await params;
  const doc = await prisma.document.findUnique({
    where: { id },
    include: {
      items: { orderBy: { sortOrder: "asc" } },
      author: { select: { id: true, name: true } },
    },
  });
  if (!doc) return fail("문서를 찾을 수 없습니다.", 404);
  return ok(doc);
}

/** PATCH /api/documents/:id — 문서 수정 */
export async function PATCH(req: NextRequest, { params }: Params) {
  const { id } = await params;
  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return fail("잘못된 요청 본문입니다.");
  }

  const existing = await prisma.document.findUnique({ where: { id } });
  if (!existing) return fail("문서를 찾을 수 없습니다.", 404);

  const doc = await prisma.document.update({
    where: { id },
    data: {
      title: typeof body.title === "string" ? body.title : undefined,
      type: typeof body.type === "string" ? body.type : undefined,
      status: typeof body.status === "string" ? body.status : undefined,
      clientName:
        typeof body.clientName === "string" ? body.clientName : undefined,
      amount: typeof body.amount === "number" ? body.amount : undefined,
      contentJson:
        typeof body.contentJson === "string" ? body.contentJson : undefined,
    },
  });
  return ok(doc);
}

/** DELETE /api/documents/:id — 문서 삭제 */
export async function DELETE(_req: NextRequest, { params }: Params) {
  const { id } = await params;
  const existing = await prisma.document.findUnique({ where: { id } });
  if (!existing) return fail("문서를 찾을 수 없습니다.", 404);

  await prisma.document.delete({ where: { id } });
  return ok({ id });
}
