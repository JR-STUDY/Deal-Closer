/**
 * 문서 버전 이력 유틸 (PRD F-214).
 *
 * 버전은 별도 테이블이 아니라 Document 행을 하나 더 만드는 방식이다.
 *  - 최초 버전(v1)은 rootId = null 이고, 그 문서의 id 가 묶음 키(rootId)가 된다.
 *  - 이후 버전은 rootId = v1 문서의 id, version = 이전 최대 + 1.
 *  - 확정본(isConfirmed)은 버전별 독립 플래그이므로 여러 버전을 동시에 지정할 수 있다.
 *
 * (서버·클라이언트 공용 순수 모듈)
 */

// 타입 전용 import — 런타임 의존이 없어 이 모듈은 순수하게 남는다
// (`@/lib/opportunity` 가 `Prisma.OpportunityWhereInput` 을 쓰는 것과 같은 방식).
import type { Prisma } from "@/generated/prisma/client";

/** 버전 묶음 키 — rootId 가 없으면 자기 자신이 뿌리(v1) */
export function rootIdOf(doc: { id: string; rootId?: string | null }): string {
  return doc.rootId ?? doc.id;
}

/** 같은 버전 묶음에 속한 문서를 찾는 Prisma where 조건 */
export function versionGroupWhere(rootId: string) {
  return { OR: [{ id: rootId }, { rootId }] };
}

type VersionedDoc = { id: string; rootId?: string | null; version: number };

/**
 * 버전 묶음별로 최신 버전만 남긴다 (보관함 목록 화면용).
 * 입력 순서는 유지한다 — 목록의 정렬 기준(최신 생성순 등)을 흔들지 않기 위해서다.
 */
export function latestVersionsOnly<T extends VersionedDoc>(docs: T[]): T[] {
  const latest = new Map<string, T>();
  for (const doc of docs) {
    const key = rootIdOf(doc);
    const current = latest.get(key);
    if (!current || doc.version > current.version) latest.set(key, doc);
  }
  const keep = new Set([...latest.values()].map((d) => d.id));
  return docs.filter((d) => keep.has(d.id));
}

/** 버전이 2개 이상인 묶음의 rootId 집합 (목록에 "v3" 배지를 붙일지 판단) */
export function multiVersionRootIds<T extends VersionedDoc>(docs: T[]): Set<string> {
  const count = new Map<string, number>();
  for (const doc of docs) {
    const key = rootIdOf(doc);
    count.set(key, (count.get(key) ?? 0) + 1);
  }
  return new Set([...count.entries()].filter(([, n]) => n > 1).map(([key]) => key));
}

/**
 * **어느 기회에도 붙지 않은 버전 묶음**만 남기는 where 조건 (기회-5 · 기회-17).
 *
 * 연결 단위가 버전 묶음이라(`@/lib/document-link`), 형제 버전이 이미 다른 기회에 붙어
 * 있으면 남은 버전도 후보가 아니다. 그 판정을 여기 한 곳에 둔다 — 목록(후보 조회)과
 * 저장(연결 검증)이 다른 조건을 쓰면 목록에는 뜨는데 저장에서 거부당한다.
 *
 * ## 묶음 키를 목록으로 나열하지 않는다
 *
 * 처음에는 붙은 문서를 먼저 조회해 묶음 키를 모으고 `notIn` 으로 뺐다. 두 번 깨졌다.
 *
 * ① **v1 이 전부 사라졌다.** 묶음 키는 `rootId ?? id` 라서 v1 은 `rootId` 가 NULL 인데,
 *    Prisma 의 부정 필터(`NOT`·`not`·`notIn`)는 **NULL 인 행을 돌려주지 않는다**
 *    (`NULL NOT IN (…)` 이 SQL 에서 참이 아니라 NULL 이다). 저장소 문서 56건 중 55건이
 *    v1 이던 시점에 후보 38건이 **0건**으로 나왔다.
 * ② **데이터가 늘자 쿼리가 죽었다.** NULL 분기를 더해 ①을 고쳤지만, 목록 방식은 붙은
 *    문서 수만큼 바인딩이 늘어난다. 문서가 1,200건인 시연 데이터에서 `id`·`rootId` 두
 *    조건에 각각 그 목록이 들어가 SQLite 의 한계를 넘었다(`P2029` → 500).
 *
 * 그래서 목록을 만들지 않고 **관계로 묻는다** — "내 묶음에 기회가 붙은 형제가 있는가".
 * 조회 왕복도 하나 줄고, 데이터가 아무리 늘어도 조건의 크기는 그대로다.
 *
 * 두 갈래를 함께 봐야 한다: 내가 뿌리(v1)면 **내 후속 버전들**을, 내가 후속 버전이면
 * **뿌리와 그 형제들**을 본다. 한쪽만 보면 반대 방향으로 붙은 형제를 놓친다.
 */
export function unlinkedVersionGroupWhere(): Prisma.DocumentWhereInput {
  /** 어느 기회에든 붙어 있는 형제가 하나도 없다 */
  const noLinkedSibling = {
    none: { opportunityId: { not: null } },
  } satisfies Prisma.DocumentListRelationFilter;

  return {
    AND: [
      // 내가 뿌리(v1)인 경우 — 내 뒤로 만들어진 버전들
      { versions: noLinkedSibling },
      // 내가 후속 버전인 경우 — 뿌리 자신과 뿌리의 다른 버전들
      {
        OR: [
          { rootId: null },
          { root: { opportunityId: null, versions: noLinkedSibling } },
        ],
      },
    ],
  };
}
