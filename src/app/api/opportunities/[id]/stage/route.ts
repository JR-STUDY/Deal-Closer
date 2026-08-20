import type { NextRequest } from "next/server";
import { getCurrentUser } from "@/lib/session";
import { ok, fail } from "@/lib/api";
import { OPPORTUNITY_STAGE_LABELS, isOpportunityStage } from "@/lib/constants";
import { changeStage } from "@/lib/opportunity-stage";
import {
  parseLostReason,
  type StageSkipReason,
} from "@/lib/opportunity-transition";

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
 * 실주 사유(F-117)는 `lostReason`(라디오에서 고른 값)과 `lostReasonOther`(기타 직접 입력)로
 * 받아 **순수 함수 `parseLostReason()` 한 곳**을 통과시킨다. 화면이 저장 문자열을 직접
 * 조립하면 어느 화면에서 실주했는지에 따라 통계에 다른 값이 쌓인다.
 * LOST 로 옮기는데 사유가 없으면 400 이다 — 분류 축이 빈 기회는 이탈률 집계(F-405) 밖에 남는다.
 */
export async function POST(req: NextRequest, { params }: Params) {
  const [{ id }, user] = await Promise.all([params, getCurrentUser()]);

  let body: {
    stage?: unknown;
    lostReason?: unknown;
    lostReasonOther?: unknown;
  };
  try {
    body = await req.json();
  } catch {
    return fail("잘못된 요청 본문입니다.");
  }

  const stage = typeof body.stage === "string" ? body.stage.trim() : "";
  if (!isOpportunityStage(stage)) {
    return fail("알 수 없는 단계입니다.");
  }

  const reason = parseLostReason({
    toStage: stage,
    choice: typeof body.lostReason === "string" ? body.lostReason : null,
    otherText:
      typeof body.lostReasonOther === "string" ? body.lostReasonOther : null,
  });
  if ("error" in reason) return fail(reason.error);

  const result = await changeStage({
    opportunityId: id,
    orgId: user.orgId,
    actorId: user.id,
    toStage: stage,
    lostReason: reason.lostReason,
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
