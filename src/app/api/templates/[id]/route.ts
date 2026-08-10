import type { NextRequest } from "next/server";
import { prisma } from "@/lib/db";
import { getCurrentUser } from "@/lib/session";
import { ok, fail } from "@/lib/api";
import { TEMPLATE_SELECT } from "@/lib/template";
import { parseContentJson } from "@/lib/editor-schema";
import { DOCUMENT_TYPES, TEMPLATE_SCOPES } from "@/lib/constants";

type Params = { params: Promise<{ id: string }> };

/** 변수 필드 입력 1건 (검증 전) */
type RawVariable = {
  key?: unknown;
  label?: unknown;
  sample?: unknown;
  required?: unknown;
};

/** GET /api/templates/:id — 양식 상세 (변수 필드 포함) */
export async function GET(_req: NextRequest, { params }: Params) {
  const [{ id }, user] = await Promise.all([params, getCurrentUser()]);

  const template = await prisma.template.findFirst({
    where: { id, orgId: user.orgId },
    select: TEMPLATE_SELECT,
  });
  if (!template) return fail("양식을 찾을 수 없습니다.", 404);

  return ok(template);
}

/**
 * PATCH /api/templates/:id — 양식 수정
 * - name / type / scope / description / contentJson 부분 수정
 * - variables 배열이 오면 변수 필드를 통째로 교체한다 (F-204 수동 편집)
 */
export async function PATCH(req: NextRequest, { params }: Params) {
  const [{ id }, user] = await Promise.all([params, getCurrentUser()]);

  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return fail("잘못된 요청 본문입니다.");
  }

  const existing = await prisma.template.findFirst({
    where: { id, orgId: user.orgId },
    select: { id: true },
  });
  if (!existing) return fail("양식을 찾을 수 없습니다.", 404);

  if (
    typeof body.type === "string" &&
    !(DOCUMENT_TYPES as readonly string[]).includes(body.type)
  ) {
    return fail("알 수 없는 문서 종류입니다.");
  }
  if (
    typeof body.scope === "string" &&
    !(TEMPLATE_SCOPES as readonly string[]).includes(body.scope)
  ) {
    return fail("알 수 없는 문서함 구분입니다.");
  }
  if (typeof body.contentJson === "string" && !parseContentJson(body.contentJson)) {
    return fail("양식 본문 형식이 올바르지 않습니다.");
  }

  // ── 변수 필드 교체 (중복 key 는 첫 항목만 남긴다 — (templateId, key) 유니크) ──
  const hasVariables = Array.isArray(body.variables);
  const seen = new Set<string>();
  const variables = hasVariables
    ? (body.variables as RawVariable[])
        .map((raw) => ({
          key: typeof raw.key === "string" ? raw.key.trim().slice(0, 40) : "",
          label: typeof raw.label === "string" ? raw.label.trim().slice(0, 60) : "",
          sample:
            typeof raw.sample === "string" && raw.sample.trim()
              ? raw.sample.trim().slice(0, 120)
              : null,
          required: raw.required === true,
        }))
        .filter((v) => {
          if (!v.key || seen.has(v.key)) return false;
          seen.add(v.key);
          return true;
        })
        .map((v, index) => ({ ...v, label: v.label || v.key, sortOrder: index }))
    : [];

  const template = await prisma.$transaction(async (tx) => {
    if (hasVariables) {
      await tx.templateVariable.deleteMany({ where: { templateId: id } });
      if (variables.length > 0) {
        await tx.templateVariable.createMany({
          data: variables.map((v) => ({ ...v, templateId: id })),
        });
      }
    }

    return tx.template.update({
      where: { id },
      data: {
        name: typeof body.name === "string" ? body.name.trim().slice(0, 80) : undefined,
        type: typeof body.type === "string" ? body.type : undefined,
        scope: typeof body.scope === "string" ? body.scope : undefined,
        description:
          body.description === null
            ? null
            : typeof body.description === "string"
              ? body.description.trim() || null
              : undefined,
        contentJson:
          typeof body.contentJson === "string" ? body.contentJson : undefined,
      },
      select: TEMPLATE_SELECT,
    });
  });

  return ok(template);
}

/**
 * DELETE /api/templates/:id — 양식 삭제
 * 이 양식으로 만든 문서는 남고 링크(templateId)만 끊긴다 (스키마 onDelete: SetNull).
 */
export async function DELETE(_req: NextRequest, { params }: Params) {
  const [{ id }, user] = await Promise.all([params, getCurrentUser()]);

  const existing = await prisma.template.findFirst({
    where: { id, orgId: user.orgId },
    select: { id: true },
  });
  if (!existing) return fail("양식을 찾을 수 없습니다.", 404);

  await prisma.template.delete({ where: { id } });
  return ok({ id });
}
