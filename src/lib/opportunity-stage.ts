import "server-only";

import { prisma } from "./db";
import type { Prisma } from "@/generated/prisma/client";
import {
  CLOSED_OPPORTUNITY_STAGES,
  OPEN_OPPORTUNITY_STAGES,
  isOpportunityStage,
  type ActivityEventType,
  type DocumentType,
  type OpportunityStage,
} from "./constants";

/**
 * 영업 기회 단계 전이 도메인 (F-112 · F-113 · F-114 · F-115 · F-117).
 *
 * 단계 변경과 활동 이력(ActivityLog) 기록은 **항상 한 트랜잭션**에서 일어나야 한다.
 * 라우트마다 흩뿌리면 전이는 됐는데 타임라인에는 없는 상태 불일치가 생긴다
 * (구현 계획 §4-② · PRD 9장 "상태 정합성 엣지 케이스").
 * 라우트는 이 모듈의 함수를 호출만 하고 스스로 stage 를 update 하지 않는다.
 *
 * DB 접근은 `src/lib/db.ts` 의 prisma 싱글톤만 경유한다. 호출측이 이미 트랜잭션을
 * 열었다면 `tx` 로 넘겨 같은 트랜잭션에 합류시킨다 (문서 발송처럼 EmailLog·문서 상태
 * 전환과 함께 묶어야 하는 경우).
 */

/** 진행 순서. 자동 전이는 이 순서를 앞으로만 이동한다. */
const STAGE_PROGRESSION: readonly OpportunityStage[] = OPEN_OPPORTUNITY_STAGES;

/** 마감 단계(WON·LOST)인지 */
export function isClosedStage(stage: OpportunityStage): boolean {
  return (CLOSED_OPPORTUNITY_STAGES as readonly OpportunityStage[]).includes(stage);
}

/** 진행 순서상 위치. 마감 단계는 -1. */
function progressionRank(stage: OpportunityStage): number {
  return STAGE_PROGRESSION.indexOf(stage);
}

/**
 * 문서 발송으로 자동 전이할 단계 (F-113).
 * 견적서 → 제안, 계약서 → 검토/협상. NDA·제안서는 PRD 에 규정이 없어 전이하지 않는다.
 */
export const DOCUMENT_SEND_STAGE: Partial<Record<DocumentType, OpportunityStage>> = {
  QUOTE: "PROPOSAL",
  CONTRACT: "NEGOTIATION",
};

/** 발송한 문서 종류에 대응하는 전이 단계. 전이 대상이 아니면 null. */
export function stageForSentDocument(type: DocumentType): OpportunityStage | null {
  return DOCUMENT_SEND_STAGE[type] ?? null;
}

/**
 * 자동 전이 허용 여부 — 뒤로 가거나(강등) 마감된 기회를 되살리지 않는다.
 *
 * TODO(Phase 3, 구현 계획 §8.1 "상태 역전 규칙"): 재발송·발송 취소·되돌리기 시 단계를
 * 어떻게 처리할지 PRD 에 규정이 없다. 확정 전까지는 보수적으로
 * ① 이미 지난 단계로 내리지 않고, ② 마감(WON·LOST)된 기회는 건드리지 않는다.
 * 수동 변경(칸반 드래그 F-112)은 이 제약을 받지 않으며 `changeStage()` 로 처리한다.
 */
export function canAutoAdvance(from: OpportunityStage, to: OpportunityStage): boolean {
  if (isClosedStage(from)) return false;
  const toRank = progressionRank(to);
  if (toRank < 0) return false; // 자동 전이로 기회를 마감시키지 않는다
  return toRank > progressionRank(from);
}

/** 전이하지 않은 이유 */
export type StageSkipReason =
  /** 이미 같은 단계 */
  | "same-stage"
  /** 수주·실주로 마감된 기회 */
  | "already-closed"
  /** 자동 전이가 단계를 되돌리려 함 (보수적으로 무시) */
  | "no-downgrade"
  /** 전이 규칙이 없는 트리거 (예: NDA·제안서 발송) */
  | "not-applicable";

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

/**
 * 수동 단계 변경 (F-112 칸반 드래그 · 기회 상세).
 * 사용자가 명시적으로 고른 단계이므로 되돌리기(강등)도 허용한다.
 *
 * TODO(Phase 4): WON 전이의 후속 처리(F-115 매출 반영·다음 기회 생성, F-117 실주 사유
 * 목록)는 여기에 얹는다. 확인 팝업이 필요한 흐름이라 UI 결정과 함께 붙인다.
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

export type DocumentSentInput = {
  opportunityId: string;
  orgId: string;
  actorId: string;
  documentId: string;
  documentType: DocumentType;
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
  const { opportunityId, orgId, actorId, documentId, documentType } = input;

  return runInTransaction(async (client) => {
    const opportunity = await findOpportunity(client, opportunityId, orgId);
    if (!opportunity) return { status: "not-found" };

    await recordActivity(client, {
      orgId,
      opportunityId,
      actorId,
      eventType: "DOCUMENT_SENT",
      detail: { documentId, documentType },
    });

    const toStage = stageForSentDocument(documentType);
    if (!toStage) {
      // NDA·제안서 발송은 이력만 남기고 단계는 그대로 둔다.
      const from = opportunity.stage;
      return { status: "skipped", from, to: from, reason: "not-applicable" };
    }

    return applyTransition(
      client,
      { opportunityId, orgId, actorId, toStage, detail: { documentId, documentType } },
      { allowDowngrade: false },
    );
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
  if (from === toStage) {
    return { status: "skipped", from, to: toStage, reason: "same-stage" };
  }
  if (!options.allowDowngrade && !canAutoAdvance(from, toStage)) {
    return {
      status: "skipped",
      from,
      to: toStage,
      reason: isClosedStage(from) ? "already-closed" : "no-downgrade",
    };
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
