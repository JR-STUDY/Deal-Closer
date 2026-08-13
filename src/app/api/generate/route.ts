import type { NextRequest } from "next/server";
import { prisma } from "@/lib/db";
import { getCurrentUser } from "@/lib/session";
import { ok, fail } from "@/lib/api";
import { toAttachmentRecord, validateUploadFiles } from "@/lib/attachments";
import { generateDocument } from "@/lib/ai/generate-document";
import { aiErrorResponse } from "@/lib/ai/http";
import { resolveRequestedModel } from "@/lib/ai/model-access";
import { formatDate } from "@/lib/format";
import type { PreparedFile } from "@/lib/ai/content";
import { applyDocumentLinked } from "@/lib/opportunity-stage";
import { syncOpportunityAmount } from "@/lib/opportunity-amount";
import { primaryContact } from "@/lib/contact";
import {
  CREDITS_PER_GENERATION,
  DOCUMENT_TYPES,
  MAX_REFERENCES,
  OPPORTUNITY_STAGE_LABELS,
  type DocumentType,
  type OpportunityStage,
} from "@/lib/constants";

/**
 * POST /api/generate — AI 문서 초안 생성 (PRD F-211 · F-212 · F-213)
 *
 * `multipart/form-data`:
 *  - prompt: 자연어 프롬프트 (필수)
 *  - templateId: 불러올 표준 양식 id (선택 — F-211)
 *  - opportunityId: 이 문서를 만드는 영업 기회 id (선택 — F-212).
 *      주면 거래처(Account) 정보를 CRM 에서 읽어 프롬프트에 넣고, 문서를 기회에 연결하며
 *      활동 이력(DOCUMENT_CREATED)을 남긴다. 없으면 기회 미연결 문서(빠른 초안)가 된다.
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

  /*
   * ── 연결할 영업 기회 (기회-2 · F-211 · F-212) ──
   *
   * 요청 값은 조작될 수 있으므로 **현재 조직 소속인지** 확인한다. 찾지 못하면 조용히 넘기지
   * 않고 실패시킨다 — 연결될 줄 알았는데 안 붙은 문서가 생기면 화면과 데이터가 어긋난다.
   *
   * 조회는 **여기 한 번뿐**이다. 연결(문서에 붙이기)과 컨텍스트(프롬프트에 넣기)가 같은
   * 기회를 봐야 "AI 에게 준 거래처"와 "문서가 붙은 기회"가 갈라지지 않는다. AI 호출·크레딧을
   * 쓰기 전에 확인해 두는 것이기도 하다.
   *
   * 담당자는 **대표 1명만** 읽는다 (거래처-8) — 판정은 `primaryContact()` 가 단일 기준이다.
   */
  const opportunityId = String(form.get("opportunityId") ?? "").trim() || null;
  const opportunity = opportunityId
    ? await prisma.opportunity.findFirst({
        where: { id: opportunityId, orgId: user.orgId },
        select: {
          id: true,
          name: true,
          stage: true,
          expectedAmount: true,
          expectedCloseDate: true,
          memo: true,
          previousOpportunity: { select: { name: true } },
          account: {
            select: {
              companyName: true,
              bizRegNo: true,
              memo: true,
              contacts: {
                where: { isPrimary: true },
                select: {
                  id: true,
                  name: true,
                  position: true,
                  phone: true,
                  email: true,
                  isPrimary: true,
                  createdAt: true,
                },
              },
            },
          },
        },
      })
    : null;
  if (opportunityId && !opportunity) {
    return fail("영업 기회를 찾을 수 없습니다.", 404);
  }
  const opportunityContact = opportunity
    ? primaryContact(opportunity.account.contacts)
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
      opportunity: opportunity
        ? {
            name: opportunity.name,
            stageLabel:
              OPPORTUNITY_STAGE_LABELS[opportunity.stage as OpportunityStage] ??
              opportunity.stage,
            expectedAmount: opportunity.expectedAmount,
            expectedCloseDate: opportunity.expectedCloseDate
              ? formatDate(opportunity.expectedCloseDate)
              : "",
            account: {
              companyName: opportunity.account.companyName,
              bizRegNo: opportunity.account.bizRegNo,
              memo: opportunity.account.memo,
            },
            contact: opportunityContact
              ? {
                  name: opportunityContact.name,
                  position: opportunityContact.position,
                  phone: opportunityContact.phone,
                  email: opportunityContact.email,
                }
              : null,
            previousOpportunityName: opportunity.previousOpportunity?.name ?? null,
            memo: opportunity.memo,
          }
        : null,
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
        opportunityId: opportunity?.id ?? null,
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

    // 기회에 붙였다면 그 기회의 타임라인에도 남긴다 — 연결과 이력은 한 트랜잭션이다 (F-114)
    if (opportunityId) {
      await applyDocumentLinked(
        {
          opportunityId,
          orgId: user.orgId,
          actorId: user.id,
          documentId: created.id,
          documentType: generated.documentType,
          documentTitle: created.title,
        },
        tx,
      );
      // 문서 연결은 확정 문서 재판정 시점이다 (기회-6 ①) — 새 문서가 곧바로 후보가 된다
      await syncOpportunityAmount({ opportunityId, orgId: user.orgId }, tx);
    }

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
      opportunityId: opportunityId || null,
    },
    { status: 201 },
  );
}
