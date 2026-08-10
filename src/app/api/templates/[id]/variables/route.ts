import type { NextRequest } from "next/server";
import { prisma } from "@/lib/db";
import { getCurrentUser } from "@/lib/session";
import { ok, fail } from "@/lib/api";
import { TEMPLATE_SELECT } from "@/lib/template";
import { extractTemplateVariables } from "@/lib/ai/setup-template";
import { aiErrorResponse } from "@/lib/ai/http";

type Params = { params: Promise<{ id: string }> };

/**
 * POST /api/templates/:id/variables — 변수 필드 AI 재추출 (PRD F-204)
 *
 * 양식 본문을 손으로 고친 뒤 변수 목록을 다시 맞출 때 사용한다.
 * 경량 모델(AI_MODEL_BATCH)을 쓰므로 크레딧을 차감하지 않는다.
 */
export async function POST(_req: NextRequest, { params }: Params) {
  const [{ id }, user] = await Promise.all([params, getCurrentUser()]);

  const template = await prisma.template.findFirst({
    where: { id, orgId: user.orgId },
    select: { id: true, name: true, type: true, contentJson: true },
  });
  if (!template) return fail("양식을 찾을 수 없습니다.", 404);
  if (!template.contentJson) {
    return fail("양식 본문이 비어 있어 변수를 추출할 수 없습니다.");
  }

  let result;
  try {
    result = await extractTemplateVariables({
      name: template.name,
      type: template.type,
      contentJson: template.contentJson,
    });
  } catch (error) {
    const response = aiErrorResponse(error);
    if (response) return response;
    throw error;
  }

  const updated = await prisma.$transaction(async (tx) => {
    await tx.templateVariable.deleteMany({ where: { templateId: id } });
    if (result.variables.length > 0) {
      await tx.templateVariable.createMany({
        data: result.variables.map((v, index) => ({
          templateId: id,
          key: v.key,
          label: v.label,
          sample: v.sample || null,
          required: v.required,
          sortOrder: index,
        })),
      });
    }
    return tx.template.findUniqueOrThrow({ where: { id }, select: TEMPLATE_SELECT });
  });

  return ok({ template: updated, model: result.model });
}
