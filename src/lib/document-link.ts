import "server-only";

import { prisma } from "./db";
import type { Prisma } from "@/generated/prisma/client";
import { ACTIVE_DOCUMENT_STATUSES, isDocumentType } from "./constants";
import { applyDocumentLinked } from "./opportunity-stage";

/**
 * 보관함 문서를 기회에 **연결**하는 공통 경로 (기회-5 2번 · 기회-17).
 *
 * 두 화면이 같은 규칙을 쓰도록 한곳에 모은다 — 기회 등록 팝업에서 고른 문서와 기회 상세에서
 * 고른 문서가 다른 조건으로 붙으면, 어느 쪽에서 붙였는지에 따라 예상 금액이 달라진다.
 *
 * 후보 규칙은 하나다: **현재 조직의 문서 · 아직 어느 기회에도 붙지 않음 · 폐기가 아님.**
 * 이미 다른 기회에 붙은 문서를 제외하는 이유는 한 문서가 두 기회의 예상 금액을 동시에
 * 좌우할 수 없기 때문이다(`Opportunity.confirmedDocumentId` 가 UNIQUE 인 것과 같은 이유).
 *
 * 연결 자체는 예상 금액을 정하지 않는다 — 호출측이 이어서 `@/lib/opportunity-amount` 로
 * 재판정한다. 연결과 재판정을 **같은 트랜잭션**에 넣어야 중간 상태가 노출되지 않는다.
 */

/** 연결 대상으로 확인된 문서 (이력에 필요한 최소 정보) */
export type LinkableDocument = {
  id: string;
  title: string;
  type: string;
};

/** 요청 본문의 `documentIds` 를 문자열 배열로 좁힌다 (없으면 빈 배열) */
export function parseDocumentIds(
  raw: unknown,
): { ids: string[] } | { error: string } {
  if (raw === undefined || raw === null) return { ids: [] };
  if (!Array.isArray(raw)) {
    return { error: "연결할 문서 목록이 올바르지 않습니다." };
  }

  const ids = [
    ...new Set(
      raw.flatMap((one) =>
        typeof one === "string" && one.trim() ? [one.trim()] : [],
      ),
    ),
  ];
  return { ids };
}

/**
 * 넘어온 id 가 전부 연결 가능한 문서인지 확인한다.
 * 하나라도 조건을 벗어나면 **아무것도 붙이지 않고** 사유를 돌려준다 —
 * 일부만 붙으면 사용자는 무엇이 붙었는지 알 수 없다.
 */
export async function findLinkableDocuments(
  orgId: string,
  ids: readonly string[],
): Promise<{ documents: LinkableDocument[] } | { error: string }> {
  if (ids.length === 0) return { documents: [] };

  const documents = await prisma.document.findMany({
    where: {
      id: { in: [...ids] },
      orgId,
      opportunityId: null,
      status: { in: [...ACTIVE_DOCUMENT_STATUSES] },
    },
    select: { id: true, title: true, type: true },
  });

  if (documents.length !== ids.length) {
    return {
      error:
        "연결할 수 없는 문서가 포함되어 있습니다. 이미 다른 기회에 연결되었거나 폐기된 문서가 아닌지 확인해주세요.",
    };
  }
  return { documents };
}

/**
 * 문서를 기회에 붙이고 활동 이력(DOCUMENT_CREATED)을 남긴다 (F-114).
 * 이 기회의 타임라인 관점에서 문서는 "붙는 순간" 생긴 것이다 — 보관함에서 먼저 만들어졌더라도.
 *
 * 종류가 정의 밖 값인 문서는 표시·전이 규칙을 적용할 수 없어 이력만 생략하고 연결은 유지한다.
 * 반드시 호출측 트랜잭션(`tx`) 안에서 부른다.
 */
export async function linkDocumentsToOpportunity(
  tx: Prisma.TransactionClient,
  input: {
    opportunityId: string;
    orgId: string;
    actorId: string;
    documents: readonly LinkableDocument[];
  },
): Promise<void> {
  const { opportunityId, orgId, actorId, documents } = input;

  for (const document of documents) {
    await tx.document.update({
      where: { id: document.id },
      data: { opportunityId },
    });

    if (isDocumentType(document.type)) {
      await applyDocumentLinked(
        {
          opportunityId,
          orgId,
          actorId,
          documentId: document.id,
          documentType: document.type,
          documentTitle: document.title,
        },
        tx,
      );
    }
  }
}
