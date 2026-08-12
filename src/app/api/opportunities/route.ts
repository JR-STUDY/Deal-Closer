import type { NextRequest } from "next/server";
import { prisma } from "@/lib/db";
import { getCurrentUser } from "@/lib/session";
import { ok, fail } from "@/lib/api";
import {
  OPPORTUNITY_DTO_SELECT,
  OPPORTUNITY_LIST_ORDER_BY,
  opportunitiesWhere,
  parseOpportunityFilters,
  parseOpportunityInput,
  toOpportunityDTO,
} from "@/lib/opportunity";
import { createOpportunity } from "@/lib/opportunity-stage";
import { syncOpportunityAmount } from "@/lib/opportunity-amount";
import {
  findLinkableDocuments,
  linkDocumentsToOpportunity,
  parseDocumentIds,
} from "@/lib/document-link";
import { findRefScopeError } from "./_scope";

/**
 * GET /api/opportunities — 현재 조직의 영업 기회 목록 (F-111).
 * `?q=`(기회명·거래처명) · `?stage=` · `?owner=` 로 좁히고,
 * 예상 마감일 오름차순(미정은 뒤)으로 정렬한다.
 */
export async function GET(req: NextRequest) {
  const user = await getCurrentUser();
  const params = req.nextUrl.searchParams;
  const filters = parseOpportunityFilters({
    q: params.get("q"),
    stage: params.get("stage"),
    owner: params.get("owner"),
  });

  const opportunities = await prisma.opportunity.findMany({
    where: opportunitiesWhere(user.orgId, filters),
    orderBy: OPPORTUNITY_LIST_ORDER_BY,
    select: OPPORTUNITY_DTO_SELECT,
  });

  return ok(opportunities.map(toOpportunityDTO));
}

/**
 * POST /api/opportunities — 기회 생성 (F-111 · 기회-17).
 *
 * 단계는 INITIAL 로 시작하고 OPPORTUNITY_CREATED 이력을 같은 트랜잭션에 남긴다
 * (`@/lib/opportunity-stage` 경유 — AGENTS.md 규칙).
 *
 * 본문에 `documentIds` 가 있으면 **등록과 동시에 보관함 문서를 연결**한다 (기회-17).
 * 생성 → 연결 → 확정 문서 재판정을 **한 트랜잭션**으로 묶는다. 클라이언트가 두 번 호출하면
 * 중간에 실패했을 때 "문서 없는 기회"가 남고, 그 기회는 예상 금액이 0 인 채로 방치된다.
 */
export async function POST(req: NextRequest) {
  const user = await getCurrentUser();

  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return fail("잘못된 요청 본문입니다.");
  }

  const parsed = parseOpportunityInput(body);
  if ("error" in parsed) return fail(parsed.error);

  const documentIds = parseDocumentIds(body.documentIds);
  if ("error" in documentIds) return fail(documentIds.error);

  const scopeError = await findRefScopeError(user.orgId, parsed);
  if (scopeError) return fail(scopeError, 404);

  // 연결 후보가 실제로 연결 가능한지 미리 본다 — 다른 기회에 이미 붙었거나 폐기된 문서는 거부한다.
  const linkable = await findLinkableDocuments(user.orgId, documentIds.ids);
  if ("error" in linkable) return fail(linkable.error, 404);

  const id = await prisma.$transaction(async (tx) => {
    const created = await createOpportunity(
      { orgId: user.orgId, actorId: user.id, ...parsed },
      tx,
    );

    await linkDocumentsToOpportunity(tx, {
      opportunityId: created.id,
      orgId: user.orgId,
      actorId: user.id,
      documents: linkable.documents,
    });

    // 붙인 문서로 예상 금액을 정한다. 문서가 없으면 확정 문서 없음 → 0 원 (기회-6 ④).
    await syncOpportunityAmount(
      { opportunityId: created.id, orgId: user.orgId },
      tx,
    );
    return created.id;
  });

  const created = await prisma.opportunity.findFirstOrThrow({
    where: { id, orgId: user.orgId },
    select: OPPORTUNITY_DTO_SELECT,
  });
  return ok(toOpportunityDTO(created), { status: 201 });
}

