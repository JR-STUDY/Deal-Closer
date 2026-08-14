import "server-only";

import { prisma } from "./db";
import type { Prisma } from "@/generated/prisma/client";
import {
  pinConfirmedDocument,
  resolveConfirmedDocument,
  unpinConfirmedDocument,
  type ConfirmedDocumentResolution,
} from "./confirmed-document";

/**
 * 기회 예상 금액 = 확정 문서 금액 — **저장**을 맡는 서버 도메인 (기회-6).
 *
 * 판정 규칙은 여기 없다 — `@/lib/confirmed-document` 의 순수 함수가 단일 기준이고,
 * 이 파일은 그 판정을 DB 쓰기로 옮기는 일만 한다 (`opportunity-transition` ↔
 * `opportunity-stage` 와 같은 짝이다).
 *
 * **예상 금액을 쓰는 곳은 이 모듈뿐이다.** 라우트가 `expectedAmount` 를 직접 update 하면
 * 확정 문서와 금액이 어긋나고, 그 순간 화면의 "…기준" 안내가 거짓말이 된다.
 *
 * DB 접근은 `src/lib/db.ts` 의 prisma 싱글톤만 경유한다. 호출측이 이미 트랜잭션을 열었다면
 * `tx` 로 넘겨 합류시킨다 (문서 발송처럼 상태 전환·이력과 함께 묶어야 하는 경우).
 */

/** 화면이 "무엇을 기준으로 얼마"인지 말할 수 있도록 확정 문서의 표시 정보를 함께 돌려준다 */
export type ConfirmedDocumentSummary = {
  id: string;
  title: string;
  /** 문서 종류 원본 값 (배지가 라벨로 옮긴다) */
  type: string;
  status: string;
  /** KRW 정수 */
  amount: number;
};

export type AmountSyncResult =
  | { status: "not-found" }
  | {
      status: "synced";
      /** 재판정 후의 예상 금액 (KRW 정수). 확정 문서가 없으면 0. */
      amount: number;
      /** 확정 문서. 없으면 null → 화면은 `₩0 · 확정 문서 없음` 으로 안내한다. */
      confirmed: ConfirmedDocumentSummary | null;
      /** 수동 고정 상태인지 (기회-6 ③) */
      isPinned: boolean;
      /**
       * **확정 문서가 바뀌었는지** — 자동 판정으로 금액의 근거가 달라졌다는 뜻이라
       * 화면이 toast 로 알리고 되돌릴 길을 준다 (기회-6 ②).
       */
      documentChanged: boolean;
      /** 금액이 달라졌는지 (같은 문서의 금액만 바뀐 경우도 포함) */
      amountChanged: boolean;
      /** 직전 확정 문서 id — toast 의 [되돌리기] 가 이 문서로 수동 고정한다 */
      previousDocumentId: string | null;
      /** 직전 예상 금액 (KRW 정수) */
      previousAmount: number;
    };

/** 재판정에 필요한 기회 1건 + 그 기회에 붙어 있는 문서 전부 */
const SYNC_SELECT = {
  id: true,
  expectedAmount: true,
  confirmedDocumentId: true,
  isConfirmedDocumentPinned: true,
  documents: {
    select: {
      id: true,
      title: true,
      type: true,
      status: true,
      amount: true,
      updatedAt: true,
      // 버전 묶음 판정에 필요하다 — 빠지면 같은 견적서의 v1·v2 가 서로 경쟁한다 (기회-6)
      rootId: true,
      version: true,
      isConfirmed: true,
    },
  },
} satisfies Prisma.OpportunitySelect;

/**
 * 확정 문서를 다시 판정하고 예상 금액을 맞춘다 (기회-6 ①).
 *
 * 재판정 시점은 세 가지다 — **문서 연결(해제) · 문서 상태 변경 · 문서 금액 변경**.
 * 문서 쪽을 바꾼 라우트가 같은 트랜잭션 안에서 이 함수를 부르면 두 값이 갈라지지 않는다.
 */
export function syncOpportunityAmount(
  input: { opportunityId: string; orgId: string },
  tx?: Prisma.TransactionClient,
): Promise<AmountSyncResult> {
  return runInTransaction(
    (client) => applyResolution(client, input, resolveConfirmedDocument),
    tx,
  );
}

/**
 * 여러 기회를 **차례대로** 재판정한다.
 *
 * 순서가 중요하다. 문서를 기회 A → B 로 옮기면 A 가 그 문서를 확정으로 붙들고 있을 수 있는데,
 * `confirmedDocumentId` 는 UNIQUE 라 B 를 먼저 맞추면 제약에 걸린다.
 * **놓아주는 쪽(A)을 먼저, 집어가는 쪽(B)을 나중에** 넘긴다.
 * null·중복 id 는 무시하므로 호출측이 분기하지 않아도 된다.
 */
export async function syncOpportunityAmounts(
  opportunityIds: readonly (string | null | undefined)[],
  orgId: string,
  tx?: Prisma.TransactionClient,
): Promise<AmountSyncResult[]> {
  const unique = [...new Set(opportunityIds.filter(isNonEmptyId))];
  if (unique.length === 0) return [];

  return runInTransaction(async (client) => {
    const results: AmountSyncResult[] = [];
    for (const opportunityId of unique) {
      results.push(
        await applyResolution(
          client,
          { opportunityId, orgId },
          resolveConfirmedDocument,
        ),
      );
    }
    return results;
  }, tx);
}

/**
 * 사용자가 문서를 확정으로 **직접 지정**한다 (기회-6 ③ 수동 고정).
 * 지정한 기회는 이후 자동 판정에서 제외되며, 상세 화면의 "자동 판정으로 되돌리기" 로 푼다.
 * 후보가 아닌 문서(폐기 등)는 순수 함수가 거부하고 사용자용 메시지를 돌려준다.
 */
export function setConfirmedDocument(
  input: { opportunityId: string; orgId: string; documentId: string },
  tx?: Prisma.TransactionClient,
): Promise<AmountSyncResult | { status: "invalid"; error: string }> {
  const { documentId, ...scope } = input;

  return runInTransaction(async (client) => {
    let failure: string | null = null;

    const result = await applyResolution(client, scope, (documents, current) => {
      const pinned = pinConfirmedDocument(documents, documentId, current);
      if ("error" in pinned) {
        failure = pinned.error;
        // 저장하지 않는다 — 현재 상태를 그대로 돌려 update 가 일어나지 않게 한다.
        return {
          ...current,
          amount: currentAmountOf(documents, current.confirmedDocumentId),
          hasChanged: false,
        };
      }
      return pinned;
    });

    if (failure !== null) {
      return { status: "invalid" as const, error: failure as string };
    }
    return result;
  }, tx);
}

/** 잠금을 풀고 자동 판정으로 되돌린다 (기회-6 ③) */
export function clearConfirmedDocumentPin(
  input: { opportunityId: string; orgId: string },
  tx?: Prisma.TransactionClient,
): Promise<AmountSyncResult> {
  return runInTransaction(
    (client) =>
      applyResolution(client, input, (documents, current) =>
        unpinConfirmedDocument(documents, current),
      ),
    tx,
  );
}

// ────────────────────────────── 내부 구현 ──────────────────────────────

/**
 * 재판정에 넘기는 문서의 최소 모양.
 * 버전 필드는 `ConfirmableDocument` 가 요구한다 (같은 묶음의 여러 버전을 하나로 묶기 위해).
 */
type SyncDocument = {
  id: string;
  status: string;
  amount: number;
  updatedAt: Date;
  rootId: string | null;
  version: number;
  /** 버전 확정본 플래그(F-214) — 기회의 확정 문서(금액 기준)와 다른 개념이다 */
  isConfirmed: boolean;
};

/** 재판정 방식 — 자동 판정·수동 고정·잠금 해제가 이 모양을 공유한다 */
type Resolver = (
  documents: readonly SyncDocument[],
  current: { confirmedDocumentId: string | null; isPinned: boolean },
) => ConfirmedDocumentResolution;

/** 현재 확정 문서의 금액 (없으면 0) — 저장 없이 되돌릴 때 쓴다 */
function currentAmountOf(
  documents: readonly SyncDocument[],
  confirmedDocumentId: string | null,
): number {
  if (!confirmedDocumentId) return 0;
  return documents.find((doc) => doc.id === confirmedDocumentId)?.amount ?? 0;
}

/**
 * 기회와 그 문서를 읽어 재판정하고, 달라진 것이 있을 때만 저장한다.
 *
 * 실제로 바뀐 게 없으면 update 를 건너뛴다 — 문서를 저장할 때마다 기회의 `updatedAt` 이
 * 딸려 올라가면 목록의 "최근 수정" 정렬이 문서 저장 순서로 뒤바뀐다.
 */
async function applyResolution(
  client: Prisma.TransactionClient,
  scope: { opportunityId: string; orgId: string },
  resolve: Resolver,
): Promise<AmountSyncResult> {
  const opportunity = await client.opportunity.findFirst({
    where: { id: scope.opportunityId, orgId: scope.orgId },
    select: SYNC_SELECT,
  });
  if (!opportunity) return { status: "not-found" };

  const previousDocumentId = opportunity.confirmedDocumentId;
  const previousAmount = opportunity.expectedAmount;

  const resolution = resolve(opportunity.documents, {
    confirmedDocumentId: previousDocumentId,
    isPinned: opportunity.isConfirmedDocumentPinned,
  });

  const needsWrite =
    resolution.confirmedDocumentId !== previousDocumentId ||
    resolution.isPinned !== opportunity.isConfirmedDocumentPinned ||
    resolution.amount !== previousAmount;

  if (needsWrite) {
    await client.opportunity.update({
      where: { id: opportunity.id },
      data: {
        confirmedDocumentId: resolution.confirmedDocumentId,
        isConfirmedDocumentPinned: resolution.isPinned,
        expectedAmount: resolution.amount,
      },
    });
  }

  const confirmed =
    opportunity.documents.find(
      (document) => document.id === resolution.confirmedDocumentId,
    ) ?? null;

  return {
    status: "synced",
    amount: resolution.amount,
    confirmed: confirmed
      ? {
          id: confirmed.id,
          title: confirmed.title,
          type: confirmed.type,
          status: confirmed.status,
          amount: confirmed.amount,
        }
      : null,
    isPinned: resolution.isPinned,
    documentChanged: resolution.confirmedDocumentId !== previousDocumentId,
    amountChanged: resolution.amount !== previousAmount,
    previousDocumentId,
    previousAmount,
  };
}

/** 호출측 트랜잭션이 있으면 합류하고, 없으면 새로 연다 (opportunity-stage 와 같은 방식) */
function runInTransaction<T>(
  work: (client: Prisma.TransactionClient) => Promise<T>,
  tx?: Prisma.TransactionClient,
): Promise<T> {
  if (tx) return work(tx);
  return prisma.$transaction((client) => work(client));
}

function isNonEmptyId(value: string | null | undefined): value is string {
  return typeof value === "string" && value.length > 0;
}
