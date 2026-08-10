import type { NextRequest } from "next/server";
import { prisma } from "@/lib/db";
import { getCurrentUser } from "@/lib/session";
import { ok, fail } from "@/lib/api";
import { toAttachmentRecord, validateUploadFiles } from "@/lib/attachments";
import { setupTemplate } from "@/lib/ai/setup-template";
import { aiErrorResponse } from "@/lib/ai/http";
import { TEMPLATE_SELECT } from "@/lib/template";
import {
  CREDITS_PER_TEMPLATE_SETUP,
  DOCUMENT_TYPES,
  TEMPLATE_SCOPES,
  type DocumentType,
  type TemplateScope,
} from "@/lib/constants";

/**
 * GET /api/templates — 표준 양식 목록 (PRD F-201)
 * query: ?type=QUOTE&scope=COMMON
 */
export async function GET(req: NextRequest) {
  const user = await getCurrentUser();
  const { searchParams } = new URL(req.url);
  const type = searchParams.get("type");
  const scope = searchParams.get("scope");

  const templates = await prisma.template.findMany({
    where: {
      orgId: user.orgId,
      ...(type && (DOCUMENT_TYPES as readonly string[]).includes(type) ? { type } : {}),
      ...(scope && (TEMPLATE_SCOPES as readonly string[]).includes(scope)
        ? { scope }
        : {}),
    },
    orderBy: [{ scope: "asc" }, { updatedAt: "desc" }],
    select: TEMPLATE_SELECT,
  });

  return ok(templates);
}

/**
 * POST /api/templates — 양식 업로드 + AI 세팅 (PRD F-202 · F-203 · F-204)
 *
 * `multipart/form-data`:
 *  - prompt: 자연어 지시 (필수) — "이 견적서 양식을 표준 양식으로 세팅해줘"
 *  - file: 기존에 쓰던 양식 파일 (선택, PDF·이미지·엑셀·CSV)
 *  - name / type / scope / description: 선택
 *
 * Claude 가 양식 본문(EditorDoc)과 변수 필드(F-204)를 함께 만들어 준다.
 * AI 호출이 실패하면 아무것도 저장하지 않고 크레딧도 차감하지 않는다.
 */
export async function POST(req: NextRequest) {
  const user = await getCurrentUser();

  let form: FormData;
  try {
    form = await req.formData();
  } catch {
    return fail("잘못된 요청 본문입니다. (multipart/form-data 필요)");
  }

  const prompt = String(form.get("prompt") ?? "").trim();
  if (!prompt) {
    return fail("어떤 양식으로 세팅할지 입력해주세요.");
  }

  const rawType = String(form.get("type") ?? "").trim();
  const documentType = (DOCUMENT_TYPES as readonly string[]).includes(rawType)
    ? (rawType as DocumentType)
    : null;

  const rawScope = String(form.get("scope") ?? "").trim();
  const scope: TemplateScope = (TEMPLATE_SCOPES as readonly string[]).includes(rawScope)
    ? (rawScope as TemplateScope)
    : "COMMON";

  const description = String(form.get("description") ?? "").trim() || null;

  // ── 업로드 원본 양식 파일 (1개) ──
  const file = form.get("file");
  const sourceFile = file instanceof File && file.size > 0 ? file : null;
  if (sourceFile) {
    const invalid = validateUploadFiles([sourceFile], { maxCount: 1 });
    if (invalid) return fail(invalid.message, invalid.status);
  }

  const fallbackName = sourceFile
    ? sourceFile.name.replace(/\.[^.]+$/, "").trim()
    : "";
  const name = (String(form.get("name") ?? "").trim() || fallbackName).slice(0, 80);

  // ── 크레딧 확인 (AI 호출 전에 먼저 막는다) ──
  const wallet = await prisma.creditWallet.findUnique({
    where: { orgId: user.orgId },
  });
  if (!wallet || wallet.balance < CREDITS_PER_TEMPLATE_SETUP) {
    return fail("크레딧이 부족합니다. 크레딧을 충전해주세요.", 402);
  }

  const branding = await prisma.branding.findUnique({ where: { orgId: user.orgId } });
  const prepared = sourceFile ? await toAttachmentRecord(sourceFile) : null;

  // ── AI 세팅 ──
  let result;
  try {
    result = await setupTemplate({
      prompt,
      name: name || "표준 양식",
      documentType,
      sourceFile: prepared,
      supplierName: branding?.companyName ?? user.name,
      logoUrl: branding?.logoUrl ?? null,
    });
  } catch (error) {
    const response = aiErrorResponse(error);
    if (response) return response;
    throw error;
  }

  const finalName = (name || result.spec.title || "표준 양식").slice(0, 80);

  const template = await prisma.$transaction(async (tx) => {
    const created = await tx.template.create({
      data: {
        orgId: user.orgId,
        authorId: user.id,
        name: finalName,
        type: result.documentType,
        scope,
        description,
        prompt,
        contentJson: result.contentJson,
        sourceFileName: prepared?.fileName ?? null,
        sourceMimeType: prepared?.mimeType ?? null,
        sourceSize: prepared?.size ?? null,
        sourceData: prepared?.data ?? null,
        variables: {
          create: result.variables.map((v, index) => ({
            key: v.key,
            label: v.label,
            sample: v.sample || null,
            required: v.required,
            sortOrder: index,
          })),
        },
      },
      select: TEMPLATE_SELECT,
    });

    await tx.creditWallet.update({
      where: { orgId: user.orgId },
      data: { balance: { decrement: CREDITS_PER_TEMPLATE_SETUP } },
    });
    await tx.creditTransaction.create({
      data: {
        orgId: user.orgId,
        amount: -CREDITS_PER_TEMPLATE_SETUP,
        type: "USAGE",
        reason: `AI 양식 세팅: ${finalName}`,
      },
    });

    return created;
  });

  return ok(
    {
      template,
      summary: result.summary,
      creditsUsed: CREDITS_PER_TEMPLATE_SETUP,
      model: result.model,
    },
    { status: 201 },
  );
}
