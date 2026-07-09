import type { NextRequest } from "next/server";
import { prisma } from "@/lib/db";
import { getCurrentOrg } from "@/lib/session";
import { ok, fail } from "@/lib/api";
import { DOCUMENT_TYPES } from "@/lib/constants";

/** GET /api/templates — 조직의 베이스 템플릿 목록 (라인아이템 수 포함) */
export async function GET() {
  const org = await getCurrentOrg();
  const templates = await prisma.documentTemplate.findMany({
    where: { orgId: org.id },
    orderBy: { createdAt: "desc" },
    include: { _count: { select: { items: true } } },
  });
  return ok(templates);
}

/**
 * POST /api/templates — 베이스 템플릿 생성
 * - { fromDocumentId } 가 오면 기존 문서를 템플릿으로 저장(라인아이템 복제).
 * - 아니면 { title, type, description } 으로 빈 템플릿 생성.
 */
export async function POST(req: NextRequest) {
  const org = await getCurrentOrg();
  let body: {
    fromDocumentId?: unknown;
    title?: unknown;
    type?: unknown;
    description?: unknown;
  };
  try {
    body = await req.json();
  } catch {
    return fail("잘못된 요청 본문입니다.");
  }

  // 1) 기존 문서 → 템플릿으로 저장
  if (typeof body.fromDocumentId === "string" && body.fromDocumentId) {
    const doc = await prisma.document.findFirst({
      where: { id: body.fromDocumentId, orgId: org.id },
      include: { items: { orderBy: { sortOrder: "asc" } } },
    });
    if (!doc) return fail("원본 문서를 찾을 수 없습니다.", 404);

    const overrideTitle =
      typeof body.title === "string" && body.title.trim()
        ? body.title.trim()
        : `${doc.title} (템플릿)`;

    const template = await prisma.documentTemplate.create({
      data: {
        orgId: org.id,
        title: overrideTitle,
        type: doc.type,
        contentJson: doc.contentJson,
        items: {
          create: doc.items.map((it, index) => ({
            name: it.name,
            description: it.description,
            quantity: it.quantity,
            unitPrice: it.unitPrice,
            amount: it.amount,
            sortOrder: index,
          })),
        },
      },
    });
    return ok(template, { status: 201 });
  }

  // 2) 빈 템플릿 생성
  const title = typeof body.title === "string" ? body.title.trim() : "";
  if (!title) return fail("템플릿 제목은 필수입니다.");
  const type = typeof body.type === "string" ? body.type : "QUOTE";
  if (!(DOCUMENT_TYPES as readonly string[]).includes(type)) {
    return fail("알 수 없는 문서 종류입니다.");
  }

  const template = await prisma.documentTemplate.create({
    data: {
      orgId: org.id,
      title,
      type,
      description:
        typeof body.description === "string" && body.description.trim()
          ? body.description.trim()
          : null,
    },
  });
  return ok(template, { status: 201 });
}
