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
 * POST /api/opportunities — 기회 생성 (F-111).
 * 단계는 INITIAL 로 시작하고 OPPORTUNITY_CREATED 이력을 같은 트랜잭션에 남긴다
 * (`@/lib/opportunity-stage` 경유 — AGENTS.md 규칙).
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

  const scopeError = await findRefScopeError(user.orgId, parsed);
  if (scopeError) return fail(scopeError, 404);

  const { id } = await createOpportunity({
    orgId: user.orgId,
    actorId: user.id,
    ...parsed,
  });

  const created = await prisma.opportunity.findFirstOrThrow({
    where: { id, orgId: user.orgId },
    select: OPPORTUNITY_DTO_SELECT,
  });
  return ok(toOpportunityDTO(created), { status: 201 });
}
