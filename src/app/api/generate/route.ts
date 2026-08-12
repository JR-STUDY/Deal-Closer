import type { NextRequest } from "next/server";
import { prisma } from "@/lib/db";
import { getCurrentUser } from "@/lib/session";
import { ok, fail } from "@/lib/api";
import { toAttachmentRecord, validateUploadFiles } from "@/lib/attachments";
import { generateDocument } from "@/lib/ai/generate-document";
import { aiErrorResponse } from "@/lib/ai/http";
import { resolveRequestedModel } from "@/lib/ai/model-access";
import type { PreparedFile } from "@/lib/ai/content";
import {
  CREDITS_PER_GENERATION,
  DOCUMENT_TYPES,
  MAX_REFERENCES,
  type DocumentType,
} from "@/lib/constants";

/**
 * POST /api/generate — AI 문서 초안 생성 (PRD F-211 · F-212 · F-213)
 *
 * `multipart/form-data`:
 *  - prompt: 자연어 프롬프트 (필수)
 *  - templateId: 불러올 표준 양식 id (선택 — F-211)
 *  - sourceDocumentId: 계약서의 근거가 되는 확정 견적서 id (선택 — F-213)
 *  - documentType: QUOTE | CONTRACT | NDA | PROPOSAL (선택, 미지정 시 AI 판단)
 *  - clientName / clientContact / clientEmail / clientMemo: 거래처 정보 (선택)
 *  - files: 첨부 파일 0개 이상 (PDF·이미지·엑셀·CSV)
 *  - referenceIds: 참고 보관함 문서 id 0개 이상
 *  - saveAsCommon: "true" 면 공용문서함에 저장
 *  - model: 사용자가 고른 AI 모델 id (선택 — 카탈로그에 있는 값만 허용)
 *
 * Claude 호출이 실패하면 문서도 크레딧 거래도 만들지 않는다 (503/502 반환).
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
  if (!prompt) return fail("생성할 문서 내용을 입력해주세요.");

  const saveAsCommon = String(form.get("saveAsCommon") ?? "") === "true";

  // ── 모델 선택 검증 (임의 모델 호출 차단) ──
  const resolved = resolveRequestedModel(form.get("model"));
  if ("problem" in resolved) return fail(resolved.problem, resolved.status);

  const rawType = String(form.get("documentType") ?? "").trim();
  const documentType = (DOCUMENT_TYPES as readonly string[]).includes(rawType)
    ? (rawType as DocumentType)
    : null;

  // ── 첨부 파일 검증 (정책 VAL_*) ──
  const files = form.getAll("files").filter((f): f is File => f instanceof File);
  const invalid = validateUploadFiles(files);
  if (invalid) return fail(invalid.message, invalid.status);

  // ── 참고 문서(보관함) 검증 — 같은 조직 문서만 ──
  const referenceIds = [
    ...new Set(
      form
        .getAll("referenceIds")
        .map((v) => String(v))
        .filter(Boolean),
    ),
  ];
  if (referenceIds.length > MAX_REFERENCES) {
    return fail(`참고 문서는 최대 ${MAX_REFERENCES}개까지 가능합니다.`);
  }
  const references =
    referenceIds.length > 0
      ? await prisma.document.findMany({
          where: { id: { in: referenceIds }, orgId: user.orgId },
          select: {
            id: true,
            title: true,
            type: true,
            clientName: true,
            amount: true,
            contentJson: true,
          },
        })
      : [];
  if (references.length !== referenceIds.length) {
    return fail("참고 문서를 찾을 수 없습니다.", 404);
  }

  // ── 표준 양식 불러오기 (F-211) ──
  const templateId = String(form.get("templateId") ?? "").trim() || null;
  const template = templateId
    ? await prisma.template.findFirst({
        where: { id: templateId, orgId: user.orgId },
        select: {
          id: true,
          name: true,
          type: true,
          contentJson: true,
          sourceFileName: true,
          sourceMimeType: true,
          sourceSize: true,
          sourceData: true,
          variables: {
            orderBy: { sortOrder: "asc" },
            select: { key: true, label: true, sample: true, required: true },
          },
        },
      })
    : null;
  if (templateId && !template) return fail("표준 양식을 찾을 수 없습니다.", 404);

  // ── 확정 견적서를 소스로 계약서 생성 (F-213) ──
  const sourceDocumentId = String(form.get("sourceDocumentId") ?? "").trim() || null;
  const sourceDocument = sourceDocumentId
    ? await prisma.document.findFirst({
        where: { id: sourceDocumentId, orgId: user.orgId },
        select: {
          id: true,
          title: true,
          type: true,
          clientName: true,
          amount: true,
          contentJson: true,
        },
      })
    : null;
  if (sourceDocumentId && !sourceDocument) {
    return fail("소스로 지정한 문서를 찾을 수 없습니다.", 404);
  }

  // ── 크레딧 확인 (AI 호출 전) ──
  const wallet = await prisma.creditWallet.findUnique({
    where: { orgId: user.orgId },
  });
  if (!wallet || wallet.balance < CREDITS_PER_GENERATION) {
    return fail("크레딧이 부족합니다. 크레딧을 충전해주세요.", 402);
  }

  // 파일 바이트 읽기 + 엑셀/CSV 텍스트 추출
  const attachmentRecords = await Promise.all(files.map(toAttachmentRecord));

  // 양식 본문이 비어 있으면 업로드 원본 파일을 보조 자료로 함께 넣는다
  const templateFile: PreparedFile | null =
    template?.sourceData && !template.contentJson
      ? {
          fileName: template.sourceFileName ?? "양식",
          mimeType: template.sourceMimeType ?? "application/octet-stream",
          size: template.sourceSize ?? template.sourceData.byteLength,
          data: template.sourceData,
          extractedText: null,
        }
      : null;

  const branding = await prisma.branding.findUnique({ where: { orgId: user.orgId } });

  // ── AI 생성 ──
  let generated;
  try {
    generated = await generateDocument({
      prompt,
      documentType: documentType ?? (template?.type as DocumentType | undefined) ?? null,
      template: template
        ? {
            name: template.name,
            type: template.type,
            contentJson: template.contentJson,
            variables: template.variables,
          }
        : null,
      templateFile,
      sourceDocument,
      references,
      attachments: attachmentRecords,
      client: {
        name: String(form.get("clientName") ?? "").trim() || null,
        contactName: String(form.get("clientContact") ?? "").trim() || null,
        email: String(form.get("clientEmail") ?? "").trim() || null,
        memo: String(form.get("clientMemo") ?? "").trim() || null,
      },
      supplierName: branding?.companyName ?? user.name,
      logoUrl: branding?.logoUrl ?? null,
      model: resolved.model,
    });
  } catch (error) {
    const response = aiErrorResponse(error);
    if (response) return response;
    throw error;
  }

  // ── 저장 (문서 + 라인아이템 + 크레딧 차감 + 생성 이력) ──
  const document = await prisma.$transaction(async (tx) => {
    const created = await tx.document.create({
      data: {
        orgId: user.orgId,
        authorId: user.id,
        title: generated.title,
        type: generated.documentType,
        status: "DRAFT",
        isCommon: saveAsCommon,
        clientName: generated.clientName,
        amount: generated.amount,
        contentJson: generated.contentJson,
        templateId: template?.id ?? null,
        sourceDocumentId: sourceDocument?.id ?? null,
        // 라인아이템(레거시 폼 뷰·통계용)은 최종 본문에서 도출한 품목으로 채운다
        items: {
          create: generated.items.map((item, index) => ({
            name: item.name,
            description: item.description || null,
            quantity: item.quantity,
            unitPrice: item.unitPrice,
            amount: item.quantity * item.unitPrice,
            sortOrder: index,
          })),
        },
      },
    });

    await tx.creditWallet.update({
      where: { orgId: user.orgId },
      data: { balance: { decrement: CREDITS_PER_GENERATION } },
    });
    await tx.creditTransaction.create({
      data: {
        orgId: user.orgId,
        amount: -CREDITS_PER_GENERATION,
        type: "USAGE",
        reason: `AI 문서 생성: ${generated.title}`,
      },
    });
    await tx.generationRequest.create({
      data: {
        userId: user.id,
        prompt,
        status: "DONE",
        creditsUsed: CREDITS_PER_GENERATION,
        documentId: created.id,
        attachments: {
          create: attachmentRecords.map((r) => ({
            fileName: r.fileName,
            mimeType: r.mimeType,
            size: r.size,
            data: r.data,
            extractedText: r.extractedText,
          })),
        },
        references: {
          // 확정 견적서 소스도 참고 이력으로 함께 남긴다
          create: [
            ...new Set([
              ...referenceIds,
              ...(sourceDocument ? [sourceDocument.id] : []),
            ]),
          ].map((documentId) => ({ documentId })),
        },
      },
    });

    return created;
  });

  return ok(
    {
      document,
      summary: generated.summary,
      creditsUsed: CREDITS_PER_GENERATION,
      model: generated.model,
      usage: generated.usage,
      attachments: attachmentRecords.map((r) => ({
        fileName: r.fileName,
        mimeType: r.mimeType,
        size: r.size,
      })),
      referenceIds,
    },
    { status: 201 },
  );
}
