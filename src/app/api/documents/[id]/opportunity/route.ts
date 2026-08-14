import type { NextRequest } from "next/server";
import { prisma } from "@/lib/db";
import { getCurrentUser } from "@/lib/session";
import { ok, fail } from "@/lib/api";
import { isDocumentType } from "@/lib/constants";
import { applyDocumentLinked } from "@/lib/opportunity-stage";
import { syncOpportunityAmounts } from "@/lib/opportunity-amount";
import { findLinkedOpportunity } from "@/lib/opportunity-recipient";

type Params = { params: Promise<{ id: string }> };

/**
 * PATCH /api/documents/:id/opportunity — 문서에 영업 기회를 연결·해제한다 (F-113 · F-114).
 *
 * 발송 화면에서 쓰는 전용 경로다. 기존 `PATCH /api/documents/:id` 에 필드를 얹지 않은 이유는
 * ① 연결과 동시에 DOCUMENT_CREATED 이력을 **한 트랜잭션**으로 남겨야 하고,
 * ② 그 라우트는 조직 스코프 없이 findUnique 로 조회하는 옛 경로라 여기 규칙을 섞기 어렵기 때문이다.
 *
 * 문서·기회 모두 현재 조직 소속인지 확인한다 — 요청 본문의 id 는 사용자가 조작할 수 있다.
 */
export async function PATCH(req: NextRequest, { params }: Params) {
  const [{ id }, user] = await Promise.all([params, getCurrentUser()]);

  let body: { opportunityId?: unknown };
  try {
    body = await req.json();
  } catch {
    return fail("잘못된 요청 본문입니다.");
  }

  // 빈 문자열·null 은 "연결 해제"로 본다 (셀렉트가 빈 값을 보낼 수 있다).
  const raw = body.opportunityId;
  const nextOpportunityId =
    typeof raw === "string" && raw.trim() ? raw.trim() : null;

  const document = await prisma.document.findFirst({
    where: { id, orgId: user.orgId },
    select: { id: true, title: true, type: true, opportunityId: true },
  });
  if (!document) return fail("문서를 찾을 수 없습니다.", 404);

  if (nextOpportunityId) {
    const opportunity = await prisma.opportunity.findFirst({
      where: { id: nextOpportunityId, orgId: user.orgId },
      select: { id: true },
    });
    if (!opportunity) return fail("영업 기회를 찾을 수 없습니다.", 404);
  }

  if (document.opportunityId === nextOpportunityId) {
    // 바뀐 것이 없어도 화면이 쓸 요약은 같은 모양으로 돌려준다 (분기마다 응답이 다르면 화면이 갈라진다).
    return ok({
      id: document.id,
      opportunityId: nextOpportunityId,
      opportunity: nextOpportunityId
        ? await findLinkedOpportunity(nextOpportunityId, user.orgId)
        : null,
      amountSync: null,
    });
  }

  const amountSync = await prisma.$transaction(async (tx) => {
    await tx.document.update({
      where: { id: document.id },
      data: { opportunityId: nextOpportunityId },
    });

    // 새로 연결됐을 때만 이력을 남긴다. 해제는 "없던 일"이 아니라 연결만 끊는 동작이라 남기지 않는다.
    // 문서 종류가 정의 밖 값이면 전이·표시 규칙을 적용할 수 없으므로 이력도 생략한다.
    if (nextOpportunityId && isDocumentType(document.type)) {
      await applyDocumentLinked(
        {
          opportunityId: nextOpportunityId,
          orgId: user.orgId,
          actorId: user.id,
          documentId: document.id,
          documentType: document.type,
          documentTitle: document.title,
        },
        tx,
      );
    }

    /*
     * 연결이 바뀌면 양쪽 기회의 확정 문서를 다시 판정한다 (기회-6 ①).
     * **놓아주는 쪽(이전 기회)을 먼저** 넘긴다 — 그 기회가 이 문서를 확정으로 붙들고 있으면
     * `confirmedDocumentId` 의 UNIQUE 제약 때문에 새 기회가 먼저 집어갈 수 없다.
     */
    const synced = await syncOpportunityAmounts(
      [document.opportunityId, nextOpportunityId],
      user.orgId,
      tx,
    );
    /*
     * 화면이 알려야 하는 건 **금액이 바뀐 쪽**이다.
     * 연결이면 집어간 기회(마지막), 해제면 놓아준 기회(유일)라 어느 쪽이든 마지막 결과다.
     * 해제도 알려야 한다 — 확정 문서를 떼면 예상 금액이 남은 문서 기준으로 다시 잡히거나
     * ₩0 이 되는데, 말해 주지 않으면 금액이 소리 없이 달라진다 (기회-6 ②).
     */
    return synced.at(-1) ?? null;
  });

  /*
   * 연결된 기회의 요약(대표 담당자 포함)을 함께 돌려준다 (발송-12).
   * 화면이 기회 조회를 한 번 더 하게 두면 "무엇을 연결했는가" 와 "누구에게 보내는가" 가
   * 서로 다른 시점의 데이터가 된다. 트랜잭션 밖에서 읽어 확정된 결과만 싣는다.
   */
  const opportunity = nextOpportunityId
    ? await findLinkedOpportunity(nextOpportunityId, user.orgId)
    : null;

  return ok({
    id: document.id,
    opportunityId: nextOpportunityId,
    opportunity,
    amountSync,
  });
}
