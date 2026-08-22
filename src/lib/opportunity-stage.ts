import "server-only";

import { prisma } from "./db";
import type { Prisma } from "@/generated/prisma/client";
import {
  isOpportunityStage,
  type ActivityEventType,
  type DocumentType,
  type OpportunityStage,
} from "./constants";
import {
  decideTransition,
  isClosedStage,
  stageForSentDocument,
  type StageSkipReason,
} from "./opportunity-transition";

/**
 * 영업 기회 생성·단계 전이 도메인 (F-111 · F-112 · F-113 · F-114 · F-115 · F-117).
 *
 * 기회 생성/단계 변경과 활동 이력(ActivityLog) 기록은 **항상 한 트랜잭션**에서 일어나야 한다.
 * 라우트마다 흩뿌리면 전이는 됐는데 타임라인에는 없는 상태 불일치가 생긴다
 * (구현 계획 §4-② · PRD 9장 "상태 정합성 엣지 케이스").
 * 라우트는 이 모듈의 함수를 호출만 하고 스스로 stage 를 update 하지 않는다.
 *
 * **전이 허용 규칙은 여기 없다** — `@/lib/opportunity-transition` 의 순수 함수가 단일
 * 기준이며, 칸반 카드(클라이언트)와 이 모듈이 같은 판정을 공유한다. 이 파일은 그 판정을
 * DB 쓰기·이력 기록으로 옮기는 일만 한다.
 *
 * DB 접근은 `src/lib/db.ts` 의 prisma 싱글톤만 경유한다. 호출측이 이미 트랜잭션을
 * 열었다면 `tx` 로 넘겨 같은 트랜잭션에 합류시킨다 (문서 발송처럼 EmailLog·문서 상태
 * 전환과 함께 묶어야 하는 경우).
 */

// 규칙은 옮겼지만 서버측 호출자가 두 모듈을 나눠 import 하지 않도록 도메인 진입점에서 다시 노출한다.
export {
  DOCUMENT_SEND_STAGE,
  canAutoAdvance,
  isClosedStage,
  stageForSentDocument,
  type StageSkipReason,
} from "./opportunity-transition";

/** 전이 결과. 라우트는 이 판별 유니온으로 응답을 결정한다. */
export type StageTransitionResult =
  | { status: "changed"; from: OpportunityStage; to: OpportunityStage }
  | {
      status: "skipped";
      from: OpportunityStage;
      to: OpportunityStage;
      reason: StageSkipReason;
    }
  | { status: "not-found" };

export type StageTransitionInput = {
  opportunityId: string;
  /** 조직 스코프. 신규 경로는 처음부터 orgId 로 좁힌다 (구현 계획 §4-④). */
  orgId: string;
  /** 이력에 남길 행위자 */
  actorId: string;
  toStage: OpportunityStage;
  /** 실주 사유 (LOST 로 전이할 때만, F-117) */
  lostReason?: string | null;
  /** ActivityLog.detail 에 함께 남길 부가 정보 (문서 id 등) */
  detail?: Record<string, unknown>;
};

export type CreateOpportunityInput = {
  orgId: string;
  /** 이력에 남길 행위자 (기회를 등록한 사람) */
  actorId: string;
  accountId: string;
  ownerId: string;
  name: string;
  expectedCloseDate: Date | null;
  memo: string | null;
  /**
   * 이 기회가 **이어받는** 직전 기회 (F-115 · F-306 갱신 체인). 갱신이 아니면 넘기지 않는다.
   *
   * 컬럼이 `@unique` 라 한 기회의 다음 기회는 최대 1건이다 — 허용 판정은
   * `@/lib/opportunity-renewal` 의 순수 함수가 먼저 하고, 그래도 동시 요청이 겹치면
   * DB 제약이 마지막 방어선으로 남는다(라우트가 그 오류를 안내 문구로 옮긴다).
   */
  previousOpportunityId?: string | null;
};

/**
 * 기회 생성 (F-111) + OPPORTUNITY_CREATED 활동 이력 (F-114) — 한 트랜잭션.
 *
 * 라우트가 `prisma.opportunity.create()` 를 직접 부르면 이력을 빠뜨릴 수 있으므로
 * 생성 경로도 이 모듈로 모은다. 초기 단계는 스키마 기본값(INITIAL)에 맡기고
 * `stage` 를 명시하지 않는다 — 단계 값을 정하는 곳은 이 파일 하나뿐이어야 한다.
 *
 * **예상 금액도 명시하지 않는다** (기회-6). 확정 문서가 정하는 값이라 새 기회는 0 으로
 * 시작하고, 문서가 붙는 순간 `@/lib/opportunity-amount` 가 채운다.
 * 갱신 기회(F-115)도 **이전 건의 금액을 복제하지 않는다** — 같은 이유다.
 */
export function createOpportunity(
  input: CreateOpportunityInput,
  tx?: Prisma.TransactionClient,
): Promise<{ id: string }> {
  const { orgId, actorId, accountId, ownerId, previousOpportunityId, ...rest } =
    input;

  return runInTransaction(async (client) => {
    const created = await client.opportunity.create({
      data: {
        orgId,
        accountId,
        ownerId,
        // 갱신이 아니면 아예 넣지 않는다 (null 을 명시해도 같지만 의도가 드러나지 않는다)
        ...(previousOpportunityId ? { previousOpportunityId } : {}),
        ...rest,
      },
      select: { id: true },
    });

    await recordActivity(client, {
      orgId,
      opportunityId: created.id,
      actorId,
      eventType: "OPPORTUNITY_CREATED",
      // 어디서 이어졌는지도 이력에 남긴다 — 체인은 컬럼에도 있지만 이력은 시점을 함께 담는다
      detail: {
        accountId,
        ownerId,
        ...(previousOpportunityId ? { previousOpportunityId } : {}),
      },
    });

    return created;
  }, tx);
}

/**
 * 수동 단계 변경 (F-112 칸반 드래그 · 목록 행 메뉴).
 *
 * 사용자가 명시적으로 고른 단계이므로 **어느 단계로든** 이동한다 — 되돌리기(강등)와
 * 마감(WON·LOST) 해제까지 포함한다 (구현 계획 §8.1 "담당자가 칸반에서 직접 되돌림" 행).
 * 담당자가 화면에서 고른 단계를 시스템이 거부하면 실제 영업 상황과 파이프라인이 어긋난다.
 * 대신 마감 해제는 확정일·실주 사유를 지우므로 화면에서 확인을 받는다
 * (`stageChangeWarning()` — 정책 STATE_BACK_NAV_CONFIRM).
 *
 * **수주 전이가 다음 기회를 자동 생성하지 않는다** (F-115). 갱신은 담당자가 상세에서
 * `갱신 기회 만들기` 로 이름·마감일을 확인해 만드는 별도 동작이고, 허용 판정은
 * `@/lib/opportunity-renewal` 이 한다 — 수주와 동시에 만들면 사용자가 정해야 할 마감일을
 * 시스템이 정하게 되고, 실물 계약이 갱신되지 않는 건에도 빈 기회가 쌓인다.
 *
 * TODO(Phase 4): WON 전이의 매출 반영과 F-117 실주 사유 목록은 여기에 얹는다.
 */
export function changeStage(
  input: StageTransitionInput,
  tx?: Prisma.TransactionClient,
): Promise<StageTransitionResult> {
  return runInTransaction(
    (client) => applyTransition(client, input, { allowDowngrade: true }),
    tx,
  );
}

/**
 * 자동 단계 전이 (F-113 등 시스템 트리거).
 * `canAutoAdvance()` 를 만족할 때만 전이하고, 아니면 이유와 함께 건너뛴다.
 */
export function advanceStage(
  input: StageTransitionInput,
  tx?: Prisma.TransactionClient,
): Promise<StageTransitionResult> {
  return runInTransaction(
    (client) => applyTransition(client, input, { allowDowngrade: false }),
    tx,
  );
}

/** 문서 이벤트(생성·발송)가 타임라인에 남길 공통 정보 (F-114) */
export type DocumentEventInput = {
  opportunityId: string;
  orgId: string;
  actorId: string;
  documentId: string;
  documentType: DocumentType;
  /** 타임라인에서 문서를 알아볼 제목. 문서가 나중에 지워져도 이력에는 남는다. */
  documentTitle: string;
};

export type DocumentSentInput = DocumentEventInput & {
  /** 발송한 수신자 (세미콜론 구분). 타임라인에 함께 표시한다. */
  recipients: string;
};

/**
 * 문서 발송 연동 처리 (F-113 · F-114).
 * DOCUMENT_SENT 이력을 남기고, 문서 종류에 해당하는 단계로 자동 전이한다.
 * 발송 이력·문서 상태 전환과 한 트랜잭션으로 묶으려면 `tx` 를 넘긴다.
 */
export function applyDocumentSent(
  input: DocumentSentInput,
  tx?: Prisma.TransactionClient,
): Promise<StageTransitionResult> {
  const {
    opportunityId,
    orgId,
    actorId,
    documentId,
    documentType,
    documentTitle,
    recipients,
  } = input;
  const detail = { documentId, documentType, documentTitle, recipients };

  return runInTransaction(async (client) => {
    const opportunity = await findOpportunity(client, opportunityId, orgId);
    if (!opportunity) return { status: "not-found" };

    await recordActivity(client, {
      orgId,
      opportunityId,
      actorId,
      eventType: "DOCUMENT_SENT",
      detail,
    });

    const toStage = stageForSentDocument(documentType);
    if (!toStage) {
      // NDA·제안서 발송은 이력만 남기고 단계는 그대로 둔다.
      const from = opportunity.stage;
      return { status: "skipped", from, to: from, reason: "not-applicable" };
    }

    return applyTransition(
      client,
      { opportunityId, orgId, actorId, toStage, detail },
      { allowDowngrade: false },
    );
  }, tx);
}

/**
 * 문서를 기회에 연결했을 때의 이력 (F-114 DOCUMENT_CREATED).
 *
 * 이 기회의 타임라인 관점에서는 문서가 "이때 생긴" 것이다 — 문서는 보관함에서 먼저 만들어질
 * 수 있고, 기회에 붙는 순간부터 그 기회의 자산이 된다. 단계는 바꾸지 않는다(전이는 발송 시점).
 * 연결 해제는 이력을 남기지 않는다 — 없던 일로 만드는 게 아니라 연결만 끊는 동작이다.
 */
export function applyDocumentLinked(
  input: DocumentEventInput,
  tx?: Prisma.TransactionClient,
): Promise<{ status: "recorded" } | { status: "not-found" }> {
  const { opportunityId, orgId, actorId, documentId, documentType, documentTitle } =
    input;

  return runInTransaction(async (client) => {
    const opportunity = await findOpportunity(client, opportunityId, orgId);
    if (!opportunity) return { status: "not-found" as const };

    await recordActivity(client, {
      orgId,
      opportunityId,
      actorId,
      eventType: "DOCUMENT_CREATED",
      detail: { documentId, documentType, documentTitle },
    });
    return { status: "recorded" as const };
  }, tx);
}

// ────────────────────────────── 내부 구현 ──────────────────────────────

/** 호출측 트랜잭션이 있으면 합류하고, 없으면 새로 연다. */
function runInTransaction<T>(
  work: (client: Prisma.TransactionClient) => Promise<T>,
  tx?: Prisma.TransactionClient,
): Promise<T> {
  if (tx) return work(tx);
  return prisma.$transaction((client) => work(client));
}

/** 조직 스코프로 기회를 찾고 stage 를 좁혀 돌려준다. */
async function findOpportunity(
  client: Prisma.TransactionClient,
  opportunityId: string,
  orgId: string,
): Promise<{ id: string; stage: OpportunityStage } | null> {
  const row = await client.opportunity.findFirst({
    where: { id: opportunityId, orgId },
    select: { id: true, stage: true },
  });
  if (!row) return null;
  // stage 는 String 컬럼이라 정의 밖 값이 들어올 수 있다. 초기 단계로 보수 해석한다.
  const stage: OpportunityStage = isOpportunityStage(row.stage) ? row.stage : "INITIAL";
  return { id: row.id, stage };
}

/** 단계 update + 활동 이력 기록을 한 트랜잭션 안에서 수행한다. */
async function applyTransition(
  client: Prisma.TransactionClient,
  input: StageTransitionInput,
  options: { allowDowngrade: boolean },
): Promise<StageTransitionResult> {
  const { opportunityId, orgId, actorId, toStage, lostReason, detail } = input;

  const opportunity = await findOpportunity(client, opportunityId, orgId);
  if (!opportunity) return { status: "not-found" };

  const from = opportunity.stage;
  // 허용 여부는 순수 규칙 모듈이 판정한다 (칸반 클라이언트와 같은 기준).
  const decision = decideTransition(from, toStage, options);
  if (!decision.allowed) {
    return { status: "skipped", from, to: toStage, reason: decision.reason };
  }

  await client.opportunity.update({
    where: { id: opportunityId },
    data: {
      stage: toStage,
      // 마감 단계로 갈 때만 확정일을 찍고, 다시 진행 단계로 돌리면 비운다 (F-115 · F-117).
      actualCloseDate: isClosedStage(toStage) ? new Date() : null,
      lostReason: toStage === "LOST" ? (lostReason ?? null) : null,
    },
  });

  await recordActivity(client, {
    orgId,
    opportunityId,
    actorId,
    eventType: eventTypeForStage(toStage),
    detail: { ...detail, from, to: toStage, ...(lostReason ? { lostReason } : {}) },
  });

  return { status: "changed", from, to: toStage };
}

/** 전이 결과에 대응하는 이력 이벤트 유형 (F-114) */
function eventTypeForStage(to: OpportunityStage): ActivityEventType {
  if (to === "WON") return "WON";
  if (to === "LOST") return "LOST";
  return "STAGE_CHANGED";
}

export type ActivityInput = {
  orgId: string;
  opportunityId: string;
  actorId: string;
  eventType: ActivityEventType;
  detail?: Record<string, unknown>;
};

/** 활동 이력 1건 기록 (F-114). 반드시 전이와 같은 트랜잭션에서 호출한다. */
async function recordActivity(
  client: Prisma.TransactionClient,
  input: ActivityInput,
): Promise<void> {
  await client.activityLog.create({
    data: {
      orgId: input.orgId,
      opportunityId: input.opportunityId,
      actorId: input.actorId,
      eventType: input.eventType,
      detail: serializeDetail(input.detail),
    },
  });
}

/** SQLite 는 Json scalar 를 지원하지 않으므로 detail 은 JSON 문자열로 저장한다. */
export function serializeDetail(
  detail: Record<string, unknown> | undefined,
): string | null {
  if (!detail || Object.keys(detail).length === 0) return null;
  return JSON.stringify(detail);
}

/** 저장된 detail 을 되돌린다. 형식이 깨졌으면 null (타임라인 렌더가 죽지 않도록). */
export function parseDetail(raw: string | null): Record<string, unknown> | null {
  if (!raw) return null;
  try {
    const parsed: unknown = JSON.parse(raw);
    if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed)) {
      return null;
    }
    return parsed as Record<string, unknown>;
  } catch {
    return null;
  }
}
