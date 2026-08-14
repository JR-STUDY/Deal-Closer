import type { NextRequest } from "next/server";
import { prisma } from "@/lib/db";
import { ok, fail } from "@/lib/api";
import { DOCUMENT_STATUSES, DOCUMENT_TYPES } from "@/lib/constants";
import {
  parseContentJson,
  computeAmount,
  extractClientName,
} from "@/lib/editor-schema";
import { syncOpportunityAmount } from "@/lib/opportunity-amount";

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
 * - items 배열이 오면(레거시 폼 에디터) 라인아이템을 통째로 교체하고 총액을 서버 재계산한다.
 * - contentJson 이 오면(블록 캔버스 에디터) 총액·거래처명을 contentJson 에서 서버 재도출한다.
 *   (정책 VAL: 금액 서버 재계산 — 클라이언트가 보낸 총액은 신뢰하지 않는다).
 * - type/status 는 허용된 값인지 검증한다.
 * - isConfirmed 는 버전별 확정본 플래그다 (F-214). 같은 묶음에서 다중 지정이 허용되므로
 *   다른 버전의 플래그를 해제하지 않는다.
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

  // ── 라인아이템 정규화 (레거시 폼 에디터: items 가 있을 때만) ──
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

  // ── contentJson 파생 (블록 캔버스 에디터) ──
  const contentJson =
    typeof body.contentJson === "string" ? body.contentJson : undefined;
  const parsed = contentJson ? parseContentJson(contentJson) : null;
  const recomputedAmount = parsed ? computeAmount(parsed) : undefined;
  const derivedClientName = parsed ? extractClientName(parsed) : null;

  const bodyClientName =
    typeof body.clientName === "string" ? body.clientName.trim() || null : undefined;

  const doc = await prisma.$transaction(async (tx) => {
    if (hasItems) {
      await tx.documentItem.deleteMany({ where: { documentId: id } });
      if (normalizedItems.length > 0) {
        await tx.documentItem.createMany({
          data: normalizedItems.map((item) => ({ ...item, documentId: id })),
        });
      }
    }

    const updated = await tx.document.update({
      where: { id },
      data: {
        title: typeof body.title === "string" ? body.title.trim() : undefined,
        type: typeof body.type === "string" ? body.type : undefined,
        status: typeof body.status === "string" ? body.status : undefined,
        // 거래처명: 블록 에디터는 contentJson 에서 파생, 그 외엔 본문 값
        clientName: derivedClientName ?? bodyClientName,
        // folderId: 문자열이면 해당 폴더로 이동, null/"" 이면 미분류로 해제, 없으면 변경 안 함
        folderId:
          body.folderId === null || body.folderId === ""
            ? null
            : typeof body.folderId === "string"
              ? body.folderId
              : undefined,
        // isCommon: 팀 공통(공유) 베이스 문서 지정/해제
        isCommon:
          typeof body.isCommon === "boolean" ? body.isCommon : undefined,
        // isConfirmed: 확정본 지정/해제 (F-214) — 같은 묶음에서 여러 버전을 동시에 지정 가능
        isConfirmed:
          typeof body.isConfirmed === "boolean" ? body.isConfirmed : undefined,
        // 총액 우선순위: items(레거시) → contentJson(블록 에디터) → body.amount
        amount: hasItems
          ? itemsTotal
          : (recomputedAmount ??
            (typeof body.amount === "number" ? body.amount : undefined)),
        contentJson,
      },
      include: { items: { orderBy: { sortOrder: "asc" } } },
    });

    /*
     * 문서의 **상태·금액이 바뀌면 연결된 기회의 예상 금액도 따라 바뀐다** (기회-6 ①).
     * 재판정을 같은 트랜잭션에 넣어야 "문서는 계약완료인데 기회 금액은 옛 견적서" 같은
     * 어긋남이 생기지 않는다. 어느 필드가 바뀌었는지 따로 따지지 않고 항상 부르는 이유는
     * 총액이 items·contentJson·body.amount 세 경로에서 재계산되기 때문이다 —
     * 실제로 달라진 값이 없으면 `syncOpportunityAmount` 가 쓰기를 건너뛴다.
     */
    if (existing.opportunityId) {
      await syncOpportunityAmount(
        { opportunityId: existing.opportunityId, orgId: existing.orgId },
        tx,
      );
    }

    return updated;
  });

  return ok(doc);
}

/**
 * DELETE /api/documents/:id — 문서 삭제
 *
 * 삭제도 확정 문서 재판정 시점이다 (기회-6). 스키마의 `onDelete: SetNull` 이 연결만 끊어주고
 * 금액은 그대로 남기므로, 지운 문서의 금액이 기회에 유령처럼 남지 않도록 같은 트랜잭션에서
 * 다시 판정한다 — 남은 문서가 없으면 0 원이 된다.
 */
export async function DELETE(_req: NextRequest, { params }: Params) {
  const { id } = await params;
  const existing = await prisma.document.findUnique({ where: { id } });
  if (!existing) return fail("문서를 찾을 수 없습니다.", 404);

  await prisma.$transaction(async (tx) => {
    await tx.document.delete({ where: { id } });
    if (existing.opportunityId) {
      await syncOpportunityAmount(
        { opportunityId: existing.opportunityId, orgId: existing.orgId },
        tx,
      );
    }
  });

  return ok({ id });
}
