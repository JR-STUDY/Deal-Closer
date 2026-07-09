import type { NextRequest } from "next/server";
import { prisma } from "@/lib/db";
import { ok, fail } from "@/lib/api";
import { DOCUMENT_STATUSES, DOCUMENT_TYPES } from "@/lib/constants";

type Params = { params: Promise<{ id: string }> };

/** PATCH 로 넘어오는 라인아이템 1건 (검증 전 원본) */
type RawItem = {
  name?: unknown;
  description?: unknown;
  quantity?: unknown;
  unitPrice?: unknown;
};

/** 0 이상 정수로 정규화 (NaN·음수·소수는 0/버림 처리) */
function toNonNegativeInt(value: unknown): number {
  const n = Math.trunc(Number(value));
  return Number.isFinite(n) && n > 0 ? n : 0;
}

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

/**
 * PATCH /api/documents/:id — 문서 수정
 * - items 배열이 오면 라인아이템을 통째로 교체하고 총액(amount)을 서버에서 재계산한다
 *   (정책 VAL: 금액 서버 재계산 — 클라이언트가 보낸 총액은 신뢰하지 않는다).
 * - type/status 는 허용된 값인지 검증한다.
 */
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

  // ── enum 검증 ──
  if (
    typeof body.type === "string" &&
    !(DOCUMENT_TYPES as readonly string[]).includes(body.type)
  ) {
    return fail("알 수 없는 문서 종류입니다.");
  }
  if (
    typeof body.status === "string" &&
    !(DOCUMENT_STATUSES as readonly string[]).includes(body.status)
  ) {
    return fail("알 수 없는 문서 상태입니다.");
  }

  // ── 라인아이템 정규화 (있을 때만) ──
  const hasItems = Array.isArray(body.items);
  const normalizedItems = hasItems
    ? (body.items as RawItem[])
        .map((raw, index) => {
          const quantity = toNonNegativeInt(raw.quantity);
          const unitPrice = toNonNegativeInt(raw.unitPrice);
          const description =
            typeof raw.description === "string" && raw.description.trim()
              ? raw.description.trim()
              : null;
          return {
            name: typeof raw.name === "string" ? raw.name.trim() : "",
            description,
            quantity,
            unitPrice,
            amount: quantity * unitPrice,
            sortOrder: index,
          };
        })
        // 품목명이 비어 있는 행은 저장하지 않는다
        .filter((item) => item.name.length > 0)
    : [];
  const itemsTotal = normalizedItems.reduce((sum, it) => sum + it.amount, 0);

  const doc = await prisma.$transaction(async (tx) => {
    if (hasItems) {
      await tx.documentItem.deleteMany({ where: { documentId: id } });
      if (normalizedItems.length > 0) {
        await tx.documentItem.createMany({
          data: normalizedItems.map((item) => ({ ...item, documentId: id })),
        });
      }
    }

    return tx.document.update({
      where: { id },
      data: {
        title: typeof body.title === "string" ? body.title.trim() : undefined,
        type: typeof body.type === "string" ? body.type : undefined,
        status: typeof body.status === "string" ? body.status : undefined,
        clientName:
          typeof body.clientName === "string"
            ? body.clientName.trim() || null
            : undefined,
        // items 가 오면 서버 재계산 총액을 우선한다.
        amount: hasItems
          ? itemsTotal
          : typeof body.amount === "number"
            ? body.amount
            : undefined,
        contentJson:
          typeof body.contentJson === "string" ? body.contentJson : undefined,
      },
      include: { items: { orderBy: { sortOrder: "asc" } } },
    });
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
