import type { NextRequest } from "next/server";
import { prisma } from "@/lib/db";
import { getCurrentUser } from "@/lib/session";
import { ok, fail } from "@/lib/api";
import {
  findLinkableDocuments,
  linkDocumentsToOpportunity,
  parseDocumentIds,
} from "@/lib/document-link";
import { syncOpportunityAmount } from "@/lib/opportunity-amount";

type Params = { params: Promise<{ id: string }> };

/**
 * POST /api/opportunities/:id/documents — 보관함 문서를 이 기회에 연결한다 (기회-5 2번).
 *
 * 문서 생성 2스텝 중 **"기존 문서 선택"** 이다. 복제가 아니라 연결이므로 문서는 그대로 두고
 * `opportunityId` 만 붙인다 — 복제하면 보관함과 기회에 같은 내용이 둘로 갈라져,
 * 어느 쪽을 고쳐야 예상 금액이 바뀌는지 알 수 없게 된다.
 *
 * 여러 건을 한 번에 받아 **한 트랜잭션**으로 붙이고 곧바로 확정 문서를 재판정한다.
 * 문서마다 따로 호출하면 중간에 실패했을 때 무엇이 붙었는지 알 수 없고, 재판정도 여러 번 돈다.
 */
export async function POST(req: NextRequest, { params }: Params) {
  const [{ id }, user] = await Promise.all([params, getCurrentUser()]);

  let body: { documentIds?: unknown };
  try {
    body = await req.json();
  } catch {
    return fail("잘못된 요청 본문입니다.");
  }

  const parsed = parseDocumentIds(body.documentIds);
  if ("error" in parsed) return fail(parsed.error);
  if (parsed.ids.length === 0) return fail("연결할 문서를 선택해주세요.");

  // 조직 스코프로 좁혀 확인한다 — 다른 조직의 기회 id 가 들어와도 404 로 끝나야 한다.
  const opportunity = await prisma.opportunity.findFirst({
    where: { id, orgId: user.orgId },
    select: { id: true },
  });
  if (!opportunity) return fail("영업 기회를 찾을 수 없습니다.", 404);

  const linkable = await findLinkableDocuments(user.orgId, parsed.ids);
  if ("error" in linkable) return fail(linkable.error, 404);

  const amountSync = await prisma.$transaction(async (tx) => {
    await linkDocumentsToOpportunity(tx, {
      opportunityId: opportunity.id,
      orgId: user.orgId,
      actorId: user.id,
      groups: linkable.groups,
    });
    return syncOpportunityAmount(
      { opportunityId: opportunity.id, orgId: user.orgId },
      tx,
    );
  });

  // 건수는 **묶음 수**다 — 버전이 3개인 견적서 하나를 붙였는데 "3건" 이라고 알리면
  // 사용자는 문서 세 건을 붙인 줄 안다.
  return ok({ linkedCount: linkable.groups.length, amountSync }, { status: 201 });
}
