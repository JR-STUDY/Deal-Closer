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
