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
 * ## `NOT`/`notIn` 만으로는 v1 이 전부 사라진다
 *
 * 묶음 키는 `rootId ?? id` 라서 **v1 은 `rootId` 가 NULL** 이다. 그런데 Prisma 의 부정
 * 필터(`NOT`·`not`·`notIn`)는 **NULL 인 행을 돌려주지 않는다** — `NULL NOT IN (…)` 이
 * SQL 에서 참이 아니라 NULL 이기 때문이다. 그래서 예전
 * `NOT: [{ id: { in } }, { rootId: { in } }]` 는 붙지 않은 문서까지 통째로 걸러냈다
 * (실측: 후보 38건이 **0건**으로 나와 "연결할 수 있는 문서가 없습니다" 만 떴다.
 * 저장소 문서 56건 중 55건이 `rootId = NULL` 이었다).
 *
 * 그래서 NULL 분기를 **명시적으로** 적는다. 제외할 묶음이 없으면 조건 자체를 붙이지
 * 않는다 — 빈 배열에 부정 필터를 걸면 같은 함정을 다시 밟을 자리가 생긴다.
 */
export function unlinkedVersionGroupWhere(
  linkedRootIds: readonly string[],
): Prisma.DocumentWhereInput {
  if (linkedRootIds.length === 0) return {};
  const ids = [...linkedRootIds];
  return {
    AND: [
      // 뿌리 문서(v1)는 자기 id 가 묶음 키다
      { id: { notIn: ids } },
      // 후속 버전은 rootId 가 묶음 키다. NULL(=v1)은 위 줄이 이미 판정했다.
      { OR: [{ rootId: null }, { rootId: { notIn: ids } }] },
    ],
  };
}
