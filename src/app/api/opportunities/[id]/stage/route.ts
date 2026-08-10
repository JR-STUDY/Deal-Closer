import type { NextRequest } from "next/server";
import { getCurrentUser } from "@/lib/session";
import { ok, fail } from "@/lib/api";
import { OPPORTUNITY_STAGE_LABELS, isOpportunityStage } from "@/lib/constants";
import { changeStage } from "@/lib/opportunity-stage";
import type { StageSkipReason } from "@/lib/opportunity-transition";

type Params = { params: Promise<{ id: string }> };

/** 전이하지 않은 이유별 사용자 안내 (정책 COPY-TONE) */
const SKIP_MESSAGES: Record<StageSkipReason, string> = {
  "same-stage": "이미 같은 단계입니다.",
  "already-closed": "이미 마감된 기회입니다.",
  "no-downgrade": "이전 단계로는 되돌릴 수 없습니다.",
  "not-applicable": "이 문서 종류에는 전이 규칙이 없습니다.",
};

/**
 * POST /api/opportunities/:id/stage — 수동 단계 변경 (F-112 칸반 드래그 · 목록 행 메뉴).
 *
 * 단계 update 와 활동 이력(ActivityLog) 기록이 한 트랜잭션이어야 하므로
 * `@/lib/opportunity-stage` 의 `changeStage()` 만 경유한다 (AGENTS.md 규칙).
 * 조직 스코프는 그 함수가 orgId 로 좁혀 조회하므로 다른 조직의 id 는 404 로 끝난다.
 *
 * 실주 사유(F-117)는 Phase 4 범위라 여기서 받지 않는다 — LOST 로 옮기면 사유는 비어 있고,
 * 사유 입력 UI 가 붙을 때 이 라우트에 필드를 더한다.
 */
export async function POST(req: NextRequest, { params }: Params) {
  const [{ id }, user] = await Promise.all([params, getCurrentUser()]);

  let body: { stage?: unknown };
  try {
    body = await req.json();
  } catch {
    return fail("잘못된 요청 본문입니다.");
  }

  const stage = typeof body.stage === "string" ? body.stage.trim() : "";
  if (!isOpportunityStage(stage)) {
    return fail("알 수 없는 단계입니다.");
  }

  const result = await changeStage({
    opportunityId: id,
    orgId: user.orgId,
    actorId: user.id,
    toStage: stage,
  });

  if (result.status === "not-found") {
    return fail("영업 기회를 찾을 수 없습니다.", 404);
  }
  if (result.status === "skipped") {
    // 수동 변경은 같은 단계로 놓았을 때만 건너뛴다. 실패가 아니므로 200 으로 알린다.
    return ok({
      id,
      stage: result.from,
      changed: false,
      message: SKIP_MESSAGES[result.reason],
    });
  }

  return ok({
    id,
    stage: result.to,
    changed: true,
    message: `‘${OPPORTUNITY_STAGE_LABELS[result.from]}’ 에서 ‘${OPPORTUNITY_STAGE_LABELS[result.to]}’ 로 옮겼습니다.`,
  });
}
