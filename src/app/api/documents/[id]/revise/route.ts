import type { NextRequest } from "next/server";
import { prisma } from "@/lib/db";
import { getCurrentUser } from "@/lib/session";
import { ok, fail } from "@/lib/api";
import { rootIdOf, versionGroupWhere } from "@/lib/document-version";
import { extractClientName, parseContentJson } from "@/lib/editor-schema";
import { reviseDocument } from "@/lib/ai/revise-document";
import { aiErrorResponse } from "@/lib/ai/http";
import { CREDITS_PER_REVISION } from "@/lib/constants";

type Params = { params: Promise<{ id: string }> };

const MAX_INSTRUCTION = 1_000;

/**
 * POST /api/documents/:id/revise — AI 부분 재작성 (PRD F-215)
 *
 * body:
 *  - instruction: 자연어 수정 지시 (필수) — 예: "결제조건을 30일로 변경"
 *  - contentJson: 에디터에서 편집 중인 현재 내용 (선택). 없으면 저장된 내용을 기준으로 한다.
 *
 * 결과는 **새 버전 문서**로 저장한다 (F-214). 바뀐 내용이 없으면 저장하지 않고
 * changed:false 로 알려준다 — 이때는 크레딧도 차감하지 않는다.
 */
export async function POST(req: NextRequest, { params }: Params) {
  const [{ id }, user] = await Promise.all([params, getCurrentUser()]);

  let body: Record<string, unknown>;
  try {
    body = (await req.json()) as Record<string, unknown>;
  } catch {
    return fail("잘못된 요청 본문입니다.");
  }

  const instruction = String(body.instruction ?? "")
    .trim()
    .slice(0, MAX_INSTRUCTION);
  if (!instruction) return fail("어떤 부분을 어떻게 바꿀지 입력해주세요.");

  const source = await prisma.document.findFirst({
    where: { id, orgId: user.orgId },
    select: {
      id: true,
      orgId: true,
      title: true,
      type: true,
      rootId: true,
      version: true,
      folderId: true,
      isCommon: true,
      templateId: true,
      sourceDocumentId: true,
      contentJson: true,
    },
  });
  if (!source) return fail("문서를 찾을 수 없습니다.", 404);

  // 편집 중 내용이 넘어오면 그것을 기준으로 수정한다 (저장 전 상태 반영)
  const baseContentJson =
    typeof body.contentJson === "string" ? body.contentJson : source.contentJson;
  const doc = parseContentJson(baseContentJson);
  if (!doc) {
    return fail("이 문서에는 재작성할 본문이 없습니다. 먼저 내용을 저장해주세요.");
  }

  const wallet = await prisma.creditWallet.findUnique({
    where: { orgId: user.orgId },
  });
  if (!wallet || wallet.balance < CREDITS_PER_REVISION) {
    return fail("크레딧이 부족합니다. 크레딧을 충전해주세요.", 402);
  }

  let revised;
  try {
    revised = await reviseDocument({
      instruction,
      documentTitle: source.title,
      documentType: source.type,
      doc,
    });
  } catch (error) {
    const response = aiErrorResponse(error);
    if (response) return response;
    throw error;
  }

  // 반영할 변경이 없으면 새 버전을 만들지 않는다 (버전 이력 오염 방지)
  if (!revised.changed) {
    return ok({
      changed: false,
      summary:
        revised.summary ||
        "요청하신 내용으로 바꿀 부분을 찾지 못했습니다. 지시를 더 구체적으로 적어주세요.",
      creditsUsed: 0,
      model: revised.model,
    });
  }

  const rootId = rootIdOf(source);

  const created = await prisma.$transaction(async (tx) => {
    const max = await tx.document.aggregate({
      where: { orgId: user.orgId, ...versionGroupWhere(rootId) },
      _max: { version: true },
    });

    const document = await tx.document.create({
      data: {
        orgId: source.orgId,
        authorId: user.id,
        title: source.title,
        type: source.type,
        status: "DRAFT",
        clientName: extractClientName(revised.editorDoc),
        amount: revised.amount,
        contentJson: revised.contentJson,
        folderId: source.folderId,
        isCommon: source.isCommon,
        templateId: source.templateId,
        sourceDocumentId: source.sourceDocumentId,
        rootId,
        version: (max._max.version ?? source.version) + 1,
        isConfirmed: false,
        // 라인아이템은 수정 후 본문에서 도출한다 (품목표를 유지한 경우에도 어긋나지 않도록)
        items: {
          create: revised.items.map((item, index) => ({
            name: item.name,
            description: item.description || null,
            quantity: item.quantity,
            unitPrice: item.unitPrice,
            amount: item.quantity * item.unitPrice,
            sortOrder: index,
          })),
        },
      },
      select: {
        id: true,
        title: true,
        version: true,
        isConfirmed: true,
        amount: true,
        status: true,
      },
    });

    await tx.creditWallet.update({
      where: { orgId: user.orgId },
      data: { balance: { decrement: CREDITS_PER_REVISION } },
    });
    await tx.creditTransaction.create({
      data: {
        orgId: user.orgId,
        amount: -CREDITS_PER_REVISION,
        type: "USAGE",
        reason: `AI 부분 재작성: ${source.title} v${document.version}`,
      },
    });
    await tx.generationRequest.create({
      data: {
        userId: user.id,
        prompt: instruction,
        status: "DONE",
        creditsUsed: CREDITS_PER_REVISION,
        documentId: document.id,
        references: { create: [{ documentId: source.id }] },
      },
    });

    return document;
  });

  return ok(
    {
      changed: true,
      document: created,
      rootId,
      summary: revised.summary,
      creditsUsed: CREDITS_PER_REVISION,
      model: revised.model,
      usage: revised.usage,
    },
    { status: 201 },
  );
}
