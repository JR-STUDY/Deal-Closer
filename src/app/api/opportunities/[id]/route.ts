import type { NextRequest } from "next/server";
import { prisma } from "@/lib/db";
import { getCurrentUser } from "@/lib/session";
import { ok, fail } from "@/lib/api";
import {
  OPPORTUNITY_DTO_SELECT,
  parseOpportunityInput,
  toOpportunityDTO,
} from "@/lib/opportunity";
import { findRefScopeError } from "../_scope";

type Params = { params: Promise<{ id: string }> };

/**
 * 조직 스코프 안에서 기회를 찾는다.
 * 다른 조직의 id 가 들어와도 404 로 끝나야 하므로 findUnique 를 쓰지 않는다.
 */
async function findScopedOpportunity(id: string, orgId: string) {
  return prisma.opportunity.findFirst({
    where: { id, orgId },
    select: { id: true, name: true },
  });
}

/**
 * PATCH /api/opportunities/:id — 기회 수정 (F-111).
 *
 * `stage` 는 받지 않는다 — 단계 전이는 활동 이력과 한 트랜잭션이어야 하므로
 * `@/lib/opportunity-stage` 전용 경로로만 처리한다 (F-112, Phase 3).
 */
export async function PATCH(req: NextRequest, { params }: Params) {
  const [{ id }, user] = await Promise.all([params, getCurrentUser()]);

  const existing = await findScopedOpportunity(id, user.orgId);
  if (!existing) return fail("영업 기회를 찾을 수 없습니다.", 404);

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

  const updated = await prisma.opportunity.update({
    where: { id },
    data: parsed,
    select: OPPORTUNITY_DTO_SELECT,
  });
  return ok(toOpportunityDTO(updated));
}

/**
 * DELETE /api/opportunities/:id — 기회 삭제 (F-111).
 *
 * 활동 이력(ActivityLog)은 기회에 종속된 기록이라 스키마 Cascade 로 함께 지워진다.
 * 연결된 문서는 `Document.opportunityId` 가 SetNull 이라 보관함에 그대로 남는다.
 */
export async function DELETE(_req: NextRequest, { params }: Params) {
  const [{ id }, user] = await Promise.all([params, getCurrentUser()]);

  const opportunity = await findScopedOpportunity(id, user.orgId);
  if (!opportunity) return fail("영업 기회를 찾을 수 없습니다.", 404);

  await prisma.opportunity.delete({ where: { id } });
  return ok({ id });
}
