import type { NextRequest } from "next/server";
import { prisma } from "@/lib/db";
import { getCurrentUser } from "@/lib/session";
import { ok, fail } from "@/lib/api";
import { DOCUMENT_STATUSES, DOCUMENT_TYPES } from "@/lib/constants";
import {
  parseContentJson,
  contentJsonSizeError,
  deriveAmount,
  extractClientName,
} from "@/lib/editor-schema";
import { syncOpportunityAmount } from "@/lib/opportunity-amount";
import { documentEditLock, isContentMutation } from "@/lib/document-edit";

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
  const user = await getCurrentUser();
  // 조직 범위로 좁혀 조회한다 — 다른 조직의 문서 id 는 404 로 끝나야 한다
  // (형제 라우트 preview·versions·send·revise 와 같은 규칙)
  const doc = await prisma.document.findFirst({
    where: { id, orgId: user.orgId },
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

  const user = await getCurrentUser();
  // 조직 범위로 좁힌다 — 소유 확인 없이 수정하면 다른 조직 문서를 고칠 수 있다
  const existing = await prisma.document.findFirst({
    where: { id, orgId: user.orgId },
  });
  if (!existing) return fail("문서를 찾을 수 없습니다.", 404);

  /*
   * 발송·계약완료·확정본·폐기 문서의 **본문**은 고치지 않는다 (진단 3).
   * 화면에서만 막으면 API 로는 그대로 통하므로 서버가 같은 순수 함수로 다시 판정한다.
   * 상태·확정본·폴더 변경은 통과시킨다 — 발송 라우트가 상태를 올리고, 확정본 해제가
   * 잠금을 푸는 길이다. 여기서 그것까지 막으면 문서를 영영 잠긴 채로 둔다.
   */
  const lock = documentEditLock(existing);
  if (lock.locked && isContentMutation(body)) {
    return fail(lock.reason, 409);
  }

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
  // 크기 상한은 서버가 판정한다 — 인스펙터의 1MB 이미지 검사는 화면 검사일 뿐이다
  if (contentJson) {
    const tooBig = contentJsonSizeError(contentJson);
    if (tooBig) return fail(tooBig, 413);
  }
  const parsed = contentJson ? parseContentJson(contentJson) : null;
  /*
   * `deriveAmount` 는 품목표 블록이 없으면 `null` 을 준다 — "합계 0원"이 아니라
   * "본문에 금액 근거가 없다"는 뜻이다. 그 경우 `undefined` 를 넘겨 Prisma 가
   * amount 를 건드리지 않게 해 **저장된 금액을 보존**한다. 예전 코드는 0 을 그대로
   * 써서, 계약서를 열어 저장만 눌러도 금액이 0 이 되고 확정 문서를 통해 기회
   * 예상 금액까지 0 으로 내려갔다.
   */
  const derived = parsed ? deriveAmount(parsed) : null;
  const recomputedAmount = derived ?? undefined;
  const derivedClientName = parsed ? extractClientName(parsed) : null;

  const bodyClientName =
    typeof body.clientName === "string" ? body.clientName.trim() || null : undefined;

  const { document: doc, amountSync } = await prisma.$transaction(async (tx) => {
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
        // isCommon 은 받지 않는다 — 문서함이 하나뿐이라 옮길 곳이 없다(스키마 컬럼만 유지).
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
    const sync = existing.opportunityId
      ? await syncOpportunityAmount(
          { opportunityId: existing.opportunityId, orgId: existing.orgId },
          tx,
        )
      : null;

    return { document: updated, amountSync: sync };
  });

  /*
   * 재판정 결과를 응답에 실어 보낸다 — 에디터가 저장 직후 "예상 금액이 얼마로,
   * 어느 문서 기준으로 바뀌었는지" 를 알려야 한다 (기회-6 ②: 금액이 소리 없이
   * 달라지면 안 된다). 문서 본문은 기존 그대로 두어 응답 모양이 깨지지 않게 한다.
   */
  return ok({ ...doc, amountSync });
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
  const user = await getCurrentUser();
  // 조직 범위로 좁힌다 — 삭제는 되돌릴 수 없으므로 소유 확인이 특히 중요하다
  const existing = await prisma.document.findFirst({
    where: { id, orgId: user.orgId },
  });
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
