import "server-only";

import { prisma } from "./db";
import type { Prisma } from "@/generated/prisma/client";
import { ACTIVE_DOCUMENT_STATUSES, isDocumentType } from "./constants";
import { applyDocumentLinked } from "./opportunity-stage";
import { rootIdOf } from "./document-version";

/**
 * 보관함 문서를 기회에 **연결**하는 공통 경로 (기회-5 2번 · 기회-17).
 *
 * 두 화면이 같은 규칙을 쓰도록 한곳에 모은다 — 기회 등록 팝업에서 고른 문서와 기회 상세에서
 * 고른 문서가 다른 조건으로 붙으면, 어느 쪽에서 붙였는지에 따라 예상 금액이 달라진다.
 *
 * 후보 규칙은 하나다: **현재 조직의 문서 · 그 버전 묶음이 아직 어느 기회에도 붙지 않음 ·
 * 고른 버전이 폐기가 아님.**
 * 이미 다른 기회에 붙은 문서를 제외하는 이유는 한 문서가 두 기회의 예상 금액을 동시에
 * 좌우할 수 없기 때문이다(`Opportunity.confirmedDocumentId` 가 UNIQUE 인 것과 같은 이유).
 *
 * ## 연결 단위는 문서 한 건이 아니라 **버전 묶음**이다
 *
 * 버전은 별도 테이블이 아니라 Document 행을 하나 더 만드는 방식이라(`rootId` 로 묶인다),
 * 문서 id 하나에만 `opportunityId` 를 걸면 **같은 견적서의 v1 은 기회 A, v2 는 기회 B** 에
 * 붙는 상태가 만들어진다. 그 순간 두 기회가 같은 문서의 서로 다른 버전을 근거로 각자
 * 다른 금액을 주장하고, 어느 쪽이 맞는지 화면으로는 가릴 수 없다.
 *
 * 그래서 묶음의 **모든 버전이 함께 붙는다**. 후보에서 빼는 판정도 묶음 단위다 —
 * 형제 버전이 이미 다른 기회에 붙어 있으면 남은 버전도 후보가 아니다.
 *
 * 활동 이력은 **묶음마다 1건**만 남긴다(사용자가 고른 버전 기준). 버전 수만큼 쌓으면
 * 타임라인에 같은 문서가 v1·v2·v3 로 세 번 나타나 무슨 일이 있었는지 읽기 어려워진다.
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

/**
 * 함께 붙는 **버전 묶음 하나**.
 *
 * `picked` 는 사용자가 목록에서 고른 그 버전이다 — 이력 문구와 연결 건수가 이것을 따른다.
 * `memberIds` 는 `picked` 를 포함한 묶음 전체이며, `opportunityId` 는 여기 전부에 걸린다.
 */
export type LinkableVersionGroup = {
  picked: LinkableDocument;
  memberIds: string[];
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
 * 넘어온 id 가 전부 연결 가능한지 확인하고 **버전 묶음**으로 묶어 돌려준다.
 * 하나라도 조건을 벗어나면 **아무것도 붙이지 않고** 사유를 돌려준다 —
 * 일부만 붙으면 사용자는 무엇이 붙었는지 알 수 없다.
 *
 * 같은 묶음의 두 버전을 함께 골랐다면 묶음 하나로 합친다(높은 버전이 `picked`) —
 * 어차피 함께 붙으므로 "2건 연결"이라고 알리면 사실과 다르다.
 */
export async function findLinkableDocuments(
  orgId: string,
  ids: readonly string[],
): Promise<{ groups: LinkableVersionGroup[] } | { error: string }> {
  if (ids.length === 0) return { groups: [] };

  const picked = await prisma.document.findMany({
    where: {
      id: { in: [...ids] },
      orgId,
      opportunityId: null,
      status: { in: [...ACTIVE_DOCUMENT_STATUSES] },
    },
    select: { id: true, title: true, type: true, rootId: true, version: true },
  });

  if (picked.length !== ids.length) {
    return {
      error:
        "연결할 수 없는 문서가 포함되어 있습니다. 이미 다른 기회에 연결되었거나 폐기된 문서가 아닌지 확인해주세요.",
    };
  }

  // 고른 문서들이 속한 버전 묶음 전체를 가져온다. 형제 버전이 이미 다른 기회에 붙어
  // 있으면 이 묶음은 통째로 후보가 아니다 — 한 문서의 두 버전이 두 기회로 갈릴 수 없다.
  const rootIds = [...new Set(picked.map(rootIdOf))];
  const members = await prisma.document.findMany({
    where: {
      orgId,
      OR: [{ id: { in: rootIds } }, { rootId: { in: rootIds } }],
    },
    select: { id: true, rootId: true, version: true, opportunityId: true },
  });

  if (members.some((member) => member.opportunityId !== null)) {
    return {
      error:
        "같은 문서의 다른 버전이 이미 어느 기회에 연결되어 있습니다. 문서의 모든 버전은 한 기회에만 연결됩니다.",
    };
  }

  // 묶음마다 대표 1건 — 같은 묶음을 여러 버전 고른 경우 높은 버전을 남긴다.
  const pickedByRoot = new Map<string, (typeof picked)[number]>();
  for (const doc of picked) {
    const key = rootIdOf(doc);
    const current = pickedByRoot.get(key);
    if (!current || doc.version > current.version) pickedByRoot.set(key, doc);
  }

  const groups = [...pickedByRoot].map(([rootId, doc]) => ({
    picked: { id: doc.id, title: doc.title, type: doc.type },
    memberIds: members
      .filter((member) => rootIdOf(member) === rootId)
      .map((member) => member.id),
  }));

  return { groups };
}

/**
 * 버전 묶음을 기회에 붙이고 활동 이력(DOCUMENT_CREATED)을 남긴다 (F-114).
 * 이 기회의 타임라인 관점에서 문서는 "붙는 순간" 생긴 것이다 — 보관함에서 먼저 만들어졌더라도.
 *
 * `opportunityId` 는 묶음의 **모든 버전**에 걸고, 이력은 사용자가 고른 버전으로 **1건**만
 * 남긴다. 종류가 정의 밖 값인 문서는 표시·전이 규칙을 적용할 수 없어 이력만 생략하고
 * 연결은 유지한다. 반드시 호출측 트랜잭션(`tx`) 안에서 부른다.
 */
export async function linkDocumentsToOpportunity(
  tx: Prisma.TransactionClient,
  input: {
    opportunityId: string;
    orgId: string;
    actorId: string;
    groups: readonly LinkableVersionGroup[];
  },
): Promise<void> {
  const { opportunityId, orgId, actorId, groups } = input;

  for (const group of groups) {
    await tx.document.updateMany({
      where: { id: { in: group.memberIds } },
      data: { opportunityId },
    });

    if (isDocumentType(group.picked.type)) {
      await applyDocumentLinked(
        {
          opportunityId,
          orgId,
          actorId,
          documentId: group.picked.id,
          documentType: group.picked.type,
          documentTitle: group.picked.title,
        },
        tx,
      );
    }
  }
}
