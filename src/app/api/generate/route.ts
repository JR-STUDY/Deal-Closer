import type { NextRequest } from "next/server";
import { randomUUID } from "node:crypto";
import { prisma } from "@/lib/db";
import { getCurrentUser } from "@/lib/session";
import { ok, fail } from "@/lib/api";
import { toAttachmentRecord } from "@/lib/attachments";
import { seedTemplate } from "@/lib/editor-schema";
import {
  CREDITS_PER_GENERATION,
  MAX_ATTACHMENTS,
  MAX_ATTACHMENT_SIZE,
  MAX_ATTACHMENTS_TOTAL_SIZE,
  MAX_REFERENCES,
  isAcceptedAttachment,
  DOCUMENT_TYPE_LABELS,
  type DocumentType,
} from "@/lib/constants";

/** 프롬프트에서 문서 종류를 단순 추론 (MVP 목업 규칙) */
function inferType(prompt: string): DocumentType {
  if (/nda|비밀유지|기밀/i.test(prompt)) return "NDA";
  if (/계약|합의/i.test(prompt)) return "CONTRACT";
  if (/제안/i.test(prompt)) return "PROPOSAL";
  return "QUOTE";
}

/** 프롬프트 앞부분에서 고객사명을 추출 (예: "글로벌커머스 회사의 …" → "글로벌커머스") */
function extractClientName(prompt: string): string | null {
  const m = prompt.match(/^\s*(.+?)\s*(?:회사|㈜|주식회사)?\s*의\s/);
  if (m?.[1]) {
    const name = m[1].replace(/\s*회사$/, "").trim();
    return name || null;
  }
  return null;
}

/** 견적 프롬프트에서 품목을 구성 (서버 인스턴스 수량·유지보수 연수 파싱) */
function buildQuoteItems(prompt: string) {
  const items: {
    name: string;
    description: string | null;
    quantity: number;
    unitPrice: number;
  }[] = [];
  const serverMatch = prompt.match(/(\d+)\s*대/);
  const serverQty = serverMatch ? Math.max(1, parseInt(serverMatch[1], 10)) : 5;
  items.push({
    name: "클라우드 서버 인스턴스",
    description: "고성능 인스턴스 · 연간",
    quantity: serverQty,
    unitPrice: 2_400_000,
  });
  if (/유지\s*보수|유지보수/.test(prompt)) {
    const yearMatch = prompt.match(/(\d+)\s*년/);
    const years = yearMatch ? Math.max(1, parseInt(yearMatch[1], 10)) : 1;
    items.push({
      name: "연간 유지보수 서비스",
      description: `${years}년 · 장애 대응·정기 점검 포함`,
      quantity: years,
      unitPrice: 3_600_000,
    });
  }
  return items;
}

/**
 * "기본 견적서" 표준 양식을 복제해 고객사명·품목만 채운 견적서 contentJson 을 만든다.
 * 표준 양식이 없으면 브랜딩 기반 seedTemplate 으로 폴백한다.
 */
async function buildFilledQuote(
  orgId: string,
  clientName: string,
  items: {
    name: string;
    description: string | null;
    quantity: number;
    unitPrice: number;
  }[],
): Promise<string> {
  const base = await prisma.document.findFirst({
    where: { orgId, isCommon: true, title: "기본 견적서" },
    select: { contentJson: true },
  });
  if (base?.contentJson) {
    const doc = JSON.parse(base.contentJson) as {
      blocks: { type: string; props: unknown }[];
    };
    for (const b of doc.blocks) {
      if (b.type === "clientMeta") {
        const p = b.props as {
          fields: { id: string; label: string; value: string }[];
        };
        p.fields = p.fields.map((f) =>
          f.label?.includes("고객사") ? { ...f, value: clientName } : f,
        );
      } else if (b.type === "itemTable") {
        const p = b.props as { rows: unknown[] };
        p.rows = items.map((it) => ({
          id: randomUUID(),
          name: it.name,
          description: it.description ?? "",
          quantity: it.quantity,
          unitPrice: it.unitPrice,
        }));
      }
    }
    return JSON.stringify(doc);
  }
  const branding = await prisma.branding.findUnique({ where: { orgId } });
  return JSON.stringify(
    seedTemplate({
      type: "QUOTE",
      clientName,
      supplierName: branding?.companyName ?? "회사명",
      logoUrl: branding?.logoUrl ?? null,
      items,
    }),
  );
}

/** 바이트 크기를 사람이 읽는 형태로 (에러 메시지용) */
function formatSize(bytes: number): string {
  return `${(bytes / 1024 / 1024).toFixed(1)}MB`;
}

/**
 * POST /api/generate — AI 대화형 문서 생성 (MVP 목업)
 *
 * `multipart/form-data` 를 받는다:
 *  - prompt: 자연어 프롬프트 (필수)
 *  - files: 첨부 파일 0개 이상 (PDF·이미지·엑셀·CSV)
 *  - referenceIds: 참고 보관함 문서 id 0개 이상
 *  - saveAsCommon: "true" 이면 공통 문서(팀 공용 기준 문서)로 저장
 *
 * 실제 LLM 호출 대신 프롬프트로 결과를 결정하는 데모 목업이다.
 *  - "양식화/공통 계약 문서" → 공용 표준 양식(기본 견적서)로 안내
 *  - "견적서 생성"(고객사·품목 포함) → 표준 양식을 채운 견적서를 생성
 *  - 그 외 → 프롬프트 기반 초안 문서
 * 첨부 파일은 원본 바이트로 보관하며, 엑셀/CSV 는 텍스트를 추출해 함께 저장한다.
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

  // 공통 문서(팀 공용 기준 문서)로 저장할지 여부
  const saveAsCommon = String(form.get("saveAsCommon") ?? "") === "true";

  // ── 첨부 파일 검증 (정책 VAL_*) ──
  const files = form.getAll("files").filter((f): f is File => f instanceof File);

  if (files.length > MAX_ATTACHMENTS) {
    return fail(`첨부 파일은 최대 ${MAX_ATTACHMENTS}개까지 가능합니다.`);
  }

  let totalSize = 0;
  for (const file of files) {
    if (!isAcceptedAttachment(file.name, file.type)) {
      return fail(
        `지원하지 않는 파일 형식입니다: ${file.name} (PDF·이미지·엑셀·CSV만 가능)`,
      );
    }
    if (file.size > MAX_ATTACHMENT_SIZE) {
      return fail(
        `파일이 너무 큽니다: ${file.name} (최대 ${formatSize(MAX_ATTACHMENT_SIZE)})`,
        413,
      );
    }
    totalSize += file.size;
  }
  if (totalSize > MAX_ATTACHMENTS_TOTAL_SIZE) {
    return fail(
      `첨부 파일 합계가 너무 큽니다. (최대 ${formatSize(MAX_ATTACHMENTS_TOTAL_SIZE)})`,
      413,
    );
  }

  // ── 참고 문서(보관함) 검증 (정책 AUTH_*·VAL_*) ──
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
  if (referenceIds.length > 0) {
    // 같은 조직의 문서만 참고 가능
    const owned = await prisma.document.findMany({
      where: { id: { in: referenceIds }, orgId: user.orgId },
      select: { id: true },
    });
    if (owned.length !== referenceIds.length) {
      return fail("참고 문서를 찾을 수 없습니다.", 404);
    }
  }

  // ── 크레딧 잔액 확인 ──
  const wallet = await prisma.creditWallet.findUnique({
    where: { orgId: user.orgId },
  });
  if (!wallet || wallet.balance < CREDITS_PER_GENERATION) {
    return fail("크레딧이 부족합니다. 크레딧을 충전해주세요.", 402);
  }

  // 파일 바이트 읽기 + 엑셀/CSV 텍스트 추출 (트랜잭션 밖에서 미리 처리)
  const attachmentRecords = await Promise.all(files.map(toAttachmentRecord));
  const attachmentsCreate = attachmentRecords.map((r) => ({
    fileName: r.fileName,
    mimeType: r.mimeType,
    size: r.size,
    data: r.data,
    extractedText: r.extractedText,
  }));
  const attachmentsSummary = attachmentRecords.map((r) => ({
    fileName: r.fileName,
    mimeType: r.mimeType,
    size: r.size,
  }));
  const referencesCreate = referenceIds.map((documentId) => ({ documentId }));

  // ── 데모 시나리오 감지 (MVP 목업: 프롬프트로 결과를 결정) ──
  const isStandardize = /양식화|공통\s*계약|표준화|양식으로/.test(prompt);
  const isFilledQuote =
    !isStandardize &&
    /견적/.test(prompt) &&
    (referenceIds.length > 0 ||
      /인스턴스|서버|유지\s*보수|유지보수|\d+\s*대/.test(prompt));

  // ── 시나리오 1: "양식화" → 공용 표준 양식(기본 견적서)로 안내 ──
  if (isStandardize) {
    const base = await prisma.document.findFirst({
      where: { orgId: user.orgId, isCommon: true, title: "기본 견적서" },
    });
    if (base) {
      await prisma.$transaction(async (tx) => {
        await tx.creditWallet.update({
          where: { orgId: user.orgId },
          data: { balance: { decrement: CREDITS_PER_GENERATION } },
        });
        await tx.creditTransaction.create({
          data: {
            orgId: user.orgId,
            amount: -CREDITS_PER_GENERATION,
            type: "USAGE",
            reason: "AI 문서 생성: 공통 계약 문서 양식화",
          },
        });
        await tx.generationRequest.create({
          data: {
            userId: user.id,
            prompt,
            status: "DONE",
            creditsUsed: CREDITS_PER_GENERATION,
            attachments: { create: attachmentsCreate },
            references: { create: referencesCreate },
          },
        });
      });
      return ok(
        {
          document: base,
          creditsUsed: CREDITS_PER_GENERATION,
          attachments: attachmentsSummary,
          referenceIds,
        },
        { status: 201 },
      );
    }
    // 표준 양식이 없으면 아래 기본 동작으로 폴백
  }

  // ── 시나리오 2: "견적서 생성" → 고객사·품목을 채운 견적서 생성 ──
  if (isFilledQuote) {
    const clientName = extractClientName(prompt) ?? "(주)글로벌커머스";
    const quoteItems = buildQuoteItems(prompt);
    const total = quoteItems.reduce(
      (sum, it) => sum + it.quantity * it.unitPrice,
      0,
    );
    const contentJson = await buildFilledQuote(
      user.orgId,
      clientName,
      quoteItems,
    );
    const title = `${clientName} 견적서`;

    const doc = await prisma.$transaction(async (tx) => {
      const created = await tx.document.create({
        data: {
          orgId: user.orgId,
          authorId: user.id,
          title,
          type: "QUOTE",
          status: "DRAFT",
          clientName,
          amount: total,
          contentJson,
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
          reason: `AI 문서 생성: ${title}`,
        },
      });
      await tx.generationRequest.create({
        data: {
          userId: user.id,
          prompt,
          status: "DONE",
          creditsUsed: CREDITS_PER_GENERATION,
          documentId: created.id,
          attachments: { create: attachmentsCreate },
          references: { create: referencesCreate },
        },
      });
      return created;
    });

    return ok(
      {
        document: doc,
        creditsUsed: CREDITS_PER_GENERATION,
        attachments: attachmentsSummary,
        referenceIds,
      },
      { status: 201 },
    );
  }

  // ── 기본: 프롬프트 기반 초안 문서 ──
  const type = inferType(prompt);
  // 제목: 첨부 파일이 있으면 파일명(확장자 제거) 기준, 없으면 문서 종류 기반 추천 제목
  const attachedName = files[0]?.name.replace(/\.[^.]+$/, "").trim();
  const title = (attachedName || `${DOCUMENT_TYPE_LABELS[type]} 초안`).slice(0, 80);

  // 트랜잭션: 문서 생성 + 크레딧 차감 + 거래내역 + 생성요청 이력(+첨부)
  const doc = await prisma.$transaction(async (tx) => {
    const created = await tx.document.create({
      data: {
        orgId: user.orgId,
        authorId: user.id,
        title,
        type,
        status: "DRAFT",
        isCommon: saveAsCommon,
        amount: 0,
        items: {
          create: [
            {
              name: "AI 생성 항목 (예시)",
              description: "생성된 초안 항목입니다. 에디터에서 수정하세요.",
              quantity: 1,
              unitPrice: 0,
              amount: 0,
              sortOrder: 0,
            },
          ],
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
        reason: `AI 문서 생성: ${title}`,
      },
    });
    await tx.generationRequest.create({
      data: {
        userId: user.id,
        prompt,
        status: "DONE",
        creditsUsed: CREDITS_PER_GENERATION,
        documentId: created.id,
        attachments: { create: attachmentsCreate },
        references: { create: referencesCreate },
      },
    });

    return created;
  });

  return ok(
    {
      document: doc,
      creditsUsed: CREDITS_PER_GENERATION,
      attachments: attachmentsSummary,
      referenceIds,
    },
    { status: 201 },
  );
}
