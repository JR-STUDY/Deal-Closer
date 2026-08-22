import type { NextRequest } from "next/server";
import { prisma } from "@/lib/db";
import { getCurrentUser } from "@/lib/session";
import { ok, fail } from "@/lib/api";
import { isOpportunityStage } from "@/lib/constants";
import {
  OPPORTUNITY_DTO_SELECT,
  parseOpportunityInput,
  toDateInputValue,
  toOpportunityDTO,
} from "@/lib/opportunity";
import {
  decideRenewal,
  renewalBlockMessage,
  renewalName,
  suggestedRenewalCloseDate,
} from "@/lib/opportunity-renewal";
import { createOpportunity } from "@/lib/opportunity-stage";

type Params = { params: Promise<{ id: string }> };

/**
 * POST /api/opportunities/:id/renewal — 수주한 기회의 **갱신 기회**를 만든다 (F-115 · F-306).
 *
 * 새 기회는 원본과 **같은 거래처·같은 영업 담당자**로 초기 단계에서 시작하고,
 * `previousOpportunityId` 로 원본과 이어진다 (기존 체인 컬럼 — 새 컬럼을 만들지 않는다).
 * 갱신 전용 스키마 필드는 없다 — 주기는 `expectedCloseDate` 하나로 표현한다.
 *
 * **허용 판정을 서버가 다시 한다.** 상세 화면도 같은 순수 함수로 버튼을 감추지만
 * (`@/lib/opportunity-renewal`), 화면에서만 막은 것은 막은 것이 아니다.
 *
 * 생성은 `@/lib/opportunity-stage` 의 `createOpportunity()` 만 경유한다 — 생성과
 * 활동 이력(OPPORTUNITY_CREATED)이 한 트랜잭션이어야 한다 (AGENTS.md 규칙).
 *
 * **예상 금액은 복제하지 않는다** (기회-6). 확정 문서에서 파생되는 값이라 새 기회는
 * 확정 문서 없음 → 0 으로 시작한다. 문서를 붙이지 않았으므로 `syncOpportunityAmount()`
 * 도 부르지 않는다(스키마 기본값 0 이 이미 그 판정의 결과와 같다).
 */
export async function POST(req: NextRequest, { params }: Params) {
  const [{ id }, user] = await Promise.all([params, getCurrentUser()]);

  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    // 본문 없이 눌러도 제안값으로 만들 수 있게 빈 객체로 본다
    body = {};
  }

  /*
   * 원본은 처음부터 orgId 로 좁혀 읽는다 — 없는 기회와 남의 기회는 같은 404 다.
   * `nextOpportunity` 를 함께 읽는 이유: 체인이 `@unique` 라 다음 기회는 최대 1건이고,
   * 이미 있으면 만들 수 없다는 사실을 판정에 넘겨야 한다.
   */
  const source = await prisma.opportunity.findFirst({
    where: { id, orgId: user.orgId },
    select: {
      id: true,
      name: true,
      stage: true,
      accountId: true,
      ownerId: true,
      expectedCloseDate: true,
      nextOpportunity: { select: { id: true } },
    },
  });
  if (!source) return fail("영업 기회를 찾을 수 없습니다.", 404);

  // stage 는 String 컬럼이라 정의 밖 값이 들어올 수 있다 — 초기 단계로 보수 해석한다
  // (그러면 진행 중으로 판정되어 갱신이 거부된다. 모르는 값으로 마감을 주장하지 않는다).
  const stage = isOpportunityStage(source.stage) ? source.stage : "INITIAL";
  const decision = decideRenewal({
    stage,
    hasNextOpportunity: source.nextOpportunity !== null,
  });
  if (!decision.allowed) {
    // 규칙 위반이지 잘못된 입력이 아니다 — 상태 충돌이므로 409 다.
    return fail(renewalBlockMessage(decision.reason), 409);
  }

  /*
   * 거래처·담당자는 **요청에서 받지 않는다** — 갱신은 "같은 상대와 다시 한다"는 뜻이고,
   * 원본 행에서 그대로 물려받으면 이미 조직 범위 안이라 별도 스코프 검사도 필요 없다.
   * 사용자가 정하는 것은 이름과 마감일뿐이며, 비워 두면 제안값을 쓴다.
   */
  const parsed = parseOpportunityInput({
    accountId: source.accountId,
    ownerId: source.ownerId,
    name: body.name ?? renewalName(source.name),
    expectedCloseDate:
      body.expectedCloseDate ??
      toDateInputValue(suggestedRenewalCloseDate(source.expectedCloseDate, new Date())),
    memo: body.memo ?? "",
  });
  if ("error" in parsed) return fail(parsed.error);

  let createdId: string;
  try {
    const created = await createOpportunity({
      orgId: user.orgId,
      actorId: user.id,
      previousOpportunityId: source.id,
      ...parsed,
    });
    createdId = created.id;
  } catch (error) {
    /*
     * 위 판정과 이 create 사이에 다른 요청이 먼저 체인을 채웠다면 `@unique` 제약에 걸린다
     * (P2002). 판정을 다시 부르지 않고 **같은 안내 문구**를 돌려준다 — 사용자에게는
     * "이미 갱신 기회가 있다" 는 같은 사실이다.
     */
    if (isUniqueChainConflict(error)) {
      return fail(renewalBlockMessage("already-renewed"), 409);
    }
    throw error;
  }

  const created = await prisma.opportunity.findFirstOrThrow({
    where: { id: createdId, orgId: user.orgId },
    select: OPPORTUNITY_DTO_SELECT,
  });
  return ok(toOpportunityDTO(created), { status: 201 });
}

/** Prisma 고유 제약 위반(P2002)인지 — 체인 컬럼이 겹친 경우만 안내로 바꾼다 */
function isUniqueChainConflict(error: unknown): boolean {
  return (
    typeof error === "object" &&
    error !== null &&
    "code" in error &&
    (error as { code?: unknown }).code === "P2002"
  );
}
