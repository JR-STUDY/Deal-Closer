import type { NextRequest } from "next/server";
import { prisma } from "@/lib/db";
import { getCurrentOrg, getCurrentUser } from "@/lib/session";
import { ok, fail } from "@/lib/api";

/** GET /api/documents?status=&type=&q= — 문서 목록 (SQLite) */
export async function GET(req: NextRequest) {
  const org = await getCurrentOrg();
  const { searchParams } = req.nextUrl;
  const status = searchParams.get("status") ?? undefined;
  const type = searchParams.get("type") ?? undefined;
  const q = searchParams.get("q") ?? undefined;

  const documents = await prisma.document.findMany({
    where: {
      orgId: org.id,
      ...(status ? { status } : {}),
      ...(type ? { type } : {}),
      ...(q ? { title: { contains: q } } : {}),
    },
    orderBy: { createdAt: "desc" },
    include: { author: { select: { id: true, name: true } } },
  });

  return ok(documents);
}

/** POST /api/documents — 문서 생성 */
export async function POST(req: NextRequest) {
  const user = await getCurrentUser();
  let body: {
    title?: string;
    type?: string;
    clientName?: string;
    amount?: number;
  };
  try {
    body = await req.json();
  } catch {
    return fail("잘못된 요청 본문입니다.");
  }

  if (!body.title?.trim()) {
    return fail("문서 제목은 필수입니다.");
  }

  const doc = await prisma.document.create({
    data: {
      orgId: user.orgId,
      authorId: user.id,
      title: body.title.trim(),
      type: body.type ?? "QUOTE",
      status: "DRAFT",
      clientName: body.clientName ?? null,
      amount: body.amount ?? 0,
    },
  });

  return ok(doc, { status: 201 });
}
