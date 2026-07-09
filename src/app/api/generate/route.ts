import type { NextRequest } from "next/server";
import { prisma } from "@/lib/db";
import { getCurrentUser } from "@/lib/session";
import { ok, fail } from "@/lib/api";
import { CREDITS_PER_GENERATION } from "@/lib/constants";

/** 프롬프트에서 문서 종류를 단순 추론 (MVP 목업 규칙) */
function inferType(prompt: string): string {
  if (/nda|비밀유지|기밀/i.test(prompt)) return "NDA";
  if (/계약|합의/i.test(prompt)) return "CONTRACT";
  if (/제안/i.test(prompt)) return "PROPOSAL";
  return "QUOTE";
}

/**
 * POST /api/generate — AI 대화형 문서 생성 (MVP 목업)
 * 실제 LLM 호출 대신 프롬프트 기반으로 초안 문서를 생성하고 크레딧을 차감한다.
 */
export async function POST(req: NextRequest) {
  const user = await getCurrentUser();

  let body: { prompt?: string };
  try {
    body = await req.json();
  } catch {
    return fail("잘못된 요청 본문입니다.");
  }

  const prompt = body.prompt?.trim();
  if (!prompt) return fail("생성할 문서 내용을 입력해주세요.");

  const wallet = await prisma.creditWallet.findUnique({
    where: { orgId: user.orgId },
  });
  if (!wallet || wallet.balance < CREDITS_PER_GENERATION) {
    return fail("크레딧이 부족합니다. 크레딧을 충전해주세요.", 402);
  }

  const type = inferType(prompt);
  const title = prompt.length > 40 ? `${prompt.slice(0, 40)}…` : prompt;

  // 트랜잭션: 문서 생성 + 크레딧 차감 + 거래내역 + 생성요청 이력
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
      },
    });

    return created;
  });

  return ok(
    { document: doc, creditsUsed: CREDITS_PER_GENERATION },
    { status: 201 },
  );
}
