import type { NextRequest } from "next/server";
import { prisma } from "@/lib/db";
import { getCurrentOrg, getCurrentUser } from "@/lib/session";
import { ok, fail } from "@/lib/api";
import { ACTIVE_DOCUMENT_STATUSES } from "@/lib/constants";

/**
 * GET /api/documents?status=&type=&q=&linkable=1 — 문서 목록 (SQLite)
 *
 * `linkable=1` 은 **기회에 연결할 수 있는 문서만** 돌려준다 (기회-5 · 기회-17).
 *  - 이미 다른 기회에 붙은 문서는 뺀다 — 한 문서가 두 기회의 예상 금액을 동시에 좌우할 수 없다.
 *  - 폐기(VOID) 문서도 뺀다 — 붙여도 확정 문서 후보가 되지 못해 금액이 0 인 채로 남는다.
 */
export async function GET(req: NextRequest) {
  const org = await getCurrentOrg();
  const { searchParams } = req.nextUrl;
  const status = searchParams.get("status") ?? undefined;
  const type = searchParams.get("type") ?? undefined;
  const q = searchParams.get("q") ?? undefined;
  const linkableOnly = searchParams.get("linkable") === "1";

  const documents = await prisma.document.findMany({
    where: {
      orgId: org.id,
      ...(status ? { status } : {}),
      ...(type ? { type } : {}),
      ...(q ? { title: { contains: q } } : {}),
      ...(linkableOnly
        ? { opportunityId: null, status: { in: [...ACTIVE_DOCUMENT_STATUSES] } }
        : {}),
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
