import type { NextRequest } from "next/server";
import { prisma } from "@/lib/db";
import { getCurrentUser } from "@/lib/session";
import { ok, fail } from "@/lib/api";
import { toAttachmentRecord } from "@/lib/attachments";
import {
  CREDITS_PER_GENERATION,
  MAX_ATTACHMENTS,
  MAX_ATTACHMENT_SIZE,
  MAX_ATTACHMENTS_TOTAL_SIZE,
  MAX_REFERENCES,
  isAcceptedAttachment,
} from "@/lib/constants";

/** 프롬프트에서 문서 종류를 단순 추론 (MVP 목업 규칙) */
function inferType(prompt: string): string {
  if (/nda|비밀유지|기밀/i.test(prompt)) return "NDA";
  if (/계약|합의/i.test(prompt)) return "CONTRACT";
  if (/제안/i.test(prompt)) return "PROPOSAL";
  return "QUOTE";
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
 *
 * 실제 LLM 호출 대신 프롬프트 기반으로 초안 문서를 생성하고 크레딧을 차감한다.
 * 첨부 파일은 원본 바이트로 보관하며, 엑셀/CSV 는 텍스트를 추출해 함께 저장한다
 * (추후 실제 LLM 연동 시 활용).
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

  const type = inferType(prompt);
  const title = prompt.length > 40 ? `${prompt.slice(0, 40)}…` : prompt;

  // 트랜잭션: 문서 생성 + 크레딧 차감 + 거래내역 + 생성요청 이력(+첨부)
  const doc = await prisma.$transaction(async (tx) => {
    const created = await tx.document.create({
      data: {
        orgId: user.orgId,
        authorId: user.id,
        title,
        type,
        status: "DRAFT",
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
          create: referenceIds.map((documentId) => ({ documentId })),
        },
      },
    });

    return created;
  });

  return ok(
    {
      document: doc,
      creditsUsed: CREDITS_PER_GENERATION,
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
