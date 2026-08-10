import type { NextRequest } from "next/server";
import { prisma } from "@/lib/db";
import { getCurrentUser } from "@/lib/session";
import { ok, fail } from "@/lib/api";
import { rootIdOf, versionGroupWhere } from "@/lib/document-version";
import { extractItemRows } from "@/lib/ai/doc-spec";
import {
  computeAmount,
  extractClientName,
  parseContentJson,
} from "@/lib/editor-schema";

type Params = { params: Promise<{ id: string }> };

/** 버전 목록에 필요한 필드만 */
const VERSION_SELECT = {
  id: true,
  title: true,
  type: true,
  status: true,
  version: true,
  isConfirmed: true,
  amount: true,
  clientName: true,
  createdAt: true,
  updatedAt: true,
  author: { select: { id: true, name: true } },
} as const;

/**
 * GET /api/documents/:id/versions — 문서 버전 이력 (PRD F-214)
 * 같은 묶음(rootId)의 모든 버전을 버전 번호 순으로 반환한다.
 */
export async function GET(_req: NextRequest, { params }: Params) {
  const [{ id }, user] = await Promise.all([params, getCurrentUser()]);

  const doc = await prisma.document.findFirst({
    where: { id, orgId: user.orgId },
    select: { id: true, rootId: true },
  });
  if (!doc) return fail("문서를 찾을 수 없습니다.", 404);

  const rootId = rootIdOf(doc);
  const versions = await prisma.document.findMany({
    where: { orgId: user.orgId, ...versionGroupWhere(rootId) },
    orderBy: { version: "asc" },
    select: VERSION_SELECT,
  });

  return ok({ rootId, versions });
}

/**
 * POST /api/documents/:id/versions — 새 버전으로 저장 (PRD F-214)
 *
 * body: { contentJson?: string } — 넘기면 그 내용으로, 없으면 현재 문서 내용을 그대로 복제한다.
 * 총액·거래처명은 항상 서버가 contentJson 에서 재도출한다.
 * 새 버전의 확정본 플래그는 항상 false 로 시작한다.
 */
export async function POST(req: NextRequest, { params }: Params) {
  const [{ id }, user] = await Promise.all([params, getCurrentUser()]);

  let body: Record<string, unknown> = {};
  try {
    body = (await req.json()) as Record<string, unknown>;
  } catch {
    // 본문 없이 호출하면 현재 내용을 그대로 복제한다
  }

  const source = await prisma.document.findFirst({
    where: { id, orgId: user.orgId },
    include: { items: { orderBy: { sortOrder: "asc" } } },
  });
  if (!source) return fail("문서를 찾을 수 없습니다.", 404);

  const contentJson =
    typeof body.contentJson === "string" ? body.contentJson : source.contentJson;
  const parsed = parseContentJson(contentJson);
  if (contentJson && !parsed) {
    return fail("문서 본문 형식이 올바르지 않습니다.");
  }

  const rootId = rootIdOf(source);

  const created = await prisma.$transaction(async (tx) => {
    const max = await tx.document.aggregate({
      where: { orgId: user.orgId, ...versionGroupWhere(rootId) },
      _max: { version: true },
    });

    return tx.document.create({
      data: {
        orgId: source.orgId,
        authorId: user.id,
        title: source.title,
        type: source.type,
        // 새 버전은 다시 초안부터 시작한다 (발송 상태를 물려받지 않는다)
        status: "DRAFT",
        clientName: parsed ? extractClientName(parsed) : source.clientName,
        amount: parsed ? computeAmount(parsed) : source.amount,
        contentJson,
        folderId: source.folderId,
        isCommon: source.isCommon,
        templateId: source.templateId,
        sourceDocumentId: source.sourceDocumentId,
        rootId,
        version: (max._max.version ?? source.version) + 1,
        isConfirmed: false,
        // 본문이 넘어왔으면 그 본문에서 품목을 도출하고, 없으면 원본 라인아이템을 복제한다
        items: {
          create: parsed
            ? extractItemRows(parsed).map((item, index) => ({
                name: item.name,
                description: item.description || null,
                quantity: item.quantity,
                unitPrice: item.unitPrice,
                amount: item.quantity * item.unitPrice,
                sortOrder: index,
              }))
            : source.items.map((item, index) => ({
                name: item.name,
                description: item.description,
                quantity: item.quantity,
                unitPrice: item.unitPrice,
                amount: item.amount,
                sortOrder: index,
              })),
        },
      },
      select: VERSION_SELECT,
    });
  });

  return ok({ document: created, rootId }, { status: 201 });
}
