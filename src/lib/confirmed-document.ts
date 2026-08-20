/**
 * 확정 문서 판정 — 기회의 예상 금액이 어느 문서에서 오는지 정하는 **규칙** (기회-6).
 *
 * 예상 금액은 사용자가 입력하지 않는다. 기회에 연결된 문서 중 **확정 문서 1건**을 골라
 * 그 문서의 금액을 쓴다. 합계나 "최신 견적서" 같은 암묵적 규칙 대신 문서 1건을 지목하므로
 * 금액이 어디서 왔는지 화면에 드러나고, 견적서 1차·2차가 쌓여도 결과가 예측 가능하다.
 *
 * 이 모듈은 **DB 에 접근하지 않는 순수 함수만** 둔다 (`@/lib/pipeline`·
 * `@/lib/opportunity-transition` 과 같은 방식). server-only 를 import 하지 않으므로
 * 서버 라우트·클라이언트 컴포넌트·tsx 테스트가 같은 판정을 공유한다 — 규칙이 갈라지면
 * 화면이 안내한 확정 문서와 실제로 저장된 확정 문서가 어긋난다.
 * 실제 저장(재판정 후 쓰기)은 서버 전용 `@/lib/opportunity-amount` 가 맡는다.
 *
 * 금액은 모두 원(KRW) 단위 정수다 (정책 FORM_CURRENCY_KRW).
 */

import {
  DOCUMENT_STATUS_LABELS,
  isDocumentStatus,
  type DocumentStatus,
} from "./constants";
import { rootIdOf } from "./document-version";

/**
 * ⚠️ **"확정" 이 두 가지를 가리킨다 — 이 파일에서는 늘 구분해서 읽어야 한다.**
 *
 *  - **버전 확정본** = `Document.isConfirmed` (F-214). "같은 견적서의 v1·v2·v3 중
 *    이 버전이 확정본인가". 버전별 독립 플래그라 **여러 버전을 동시에 지정할 수 있다.**
 *  - **확정 문서** = `Opportunity.confirmedDocumentId` (기회-6). "이 기회의 예상 금액을
 *    어느 문서에서 가져오는가". 기회당 **정확히 1건**이고 UNIQUE 제약이 걸려 있다.
 *
 * 이 모듈이 정하는 것은 **확정 문서**이고, 버전 확정본은 그 판정에 쓰는 **입력 신호**다.
 * DB 컬럼 이름을 바꾸는 건 범위 밖이라, 대신 이 파일·화면 문구에서 앞의 두 낱말
 * (`버전 확정본` / `확정 문서`)을 섞어 쓰지 않는 것으로 구분한다.
 */

/**
 * 판정에 필요한 최소 필드. Prisma 의 `Document` row 를 그대로 넘길 수 있다
 * (구조적 타이핑이라 추가 필드가 있어도 된다).
 * `status` 는 DB 가 String 컬럼이라 넓게 받고 내부에서 좁힌다 —
 * 정의 밖 값은 어떤 규칙을 적용할지 알 수 없으므로 후보에서 뺀다.
 *
 * 버전 필드(`rootId`·`version`·`isConfirmed`)는 **선택이 아니다.** 호출측이 빠뜨리면
 * 판정이 조용히 "모든 버전을 서로 다른 문서로 취급하던" 옛 방식으로 되돌아가므로,
 * 타입 오류로 막아 조회의 `select` 를 함께 고치게 한다.
 */
export type ConfirmableDocument = {
  id: string;
  status: string;
  /** 문서 총액 (KRW 정수) */
  amount: number;
  /** 동순위를 가르는 기준 — 최근 수정이 앞선다 */
  updatedAt: Date;
  /** 버전 묶음 키. null 이면 이 문서가 v1(묶음의 뿌리)이고 자기 id 가 키가 된다 */
  rootId: string | null;
  /** 버전 번호(1부터). 같은 묶음 안에서 1씩 올라간다 */
  version: number;
  /** **버전 확정본** 플래그(F-214) — 확정 문서(금액 기준)와 다른 개념이다 */
  isConfirmed: boolean;
};

/**
 * 확정 문서 우선순위 — 큰 값이 먼저다 (기회-6 ①).
 *
 * 계약완료 > 발송완료 > 초안 순인 이유는 "얼마로 합의됐는가"에 가까운 문서일수록
 * 예상 금액으로서 신뢰도가 높기 때문이다. **폐기(VOID)는 후보에서 제외**하므로 값이 가장 낮다.
 *
 * `prisma/migrations/20260814020000_add_contacts_and_confirmed_document` 의 백필 SQL 이
 * 같은 CASE 순서를 쓴다 — 여기를 고치면 그 SQL 도 함께 봐야 한다.
 * ⚠️ **알려진 한계**: 그 백필은 버전을 모른 채 1회 판정했다(모든 버전을 독립 후보로 취급).
 * 이미 적용된 마이그레이션이라 고치지 않는다(체크섬이 깨진다). 어긋난 행은 다음 재판정
 * 시점(문서 연결·상태 변경·금액 변경)에 스스로 바로잡히며, 그 전에 맞추고 싶으면
 * **SQL 이 아니라 이 순수 함수를 재사용하는 일회성 스크립트**로 다시 판정해야 한다 —
 * 대표 선정 규칙을 SQL 로 옮겨 적으면 규칙이 둘로 갈라진다.
 */
const STATUS_PRIORITY: Record<DocumentStatus, number> = {
  COMPLETED: 3,
  SENT: 2,
  DRAFT: 1,
  VOID: 0,
};

/**
 * 확정 문서 후보인지 — 상태를 알 수 있고 폐기되지 않았어야 한다.
 * 폐기 문서를 금액 근거로 삼으면 "버린 견적서로 파이프라인이 잡히는" 일이 생긴다.
 */
export function isConfirmableDocument(document: ConfirmableDocument): boolean {
  return isDocumentStatus(document.status) && document.status !== "VOID";
}

/** 후보만 남긴다 (순서는 건드리지 않는다) */
export function confirmableDocuments<T extends ConfirmableDocument>(
  documents: readonly T[],
): T[] {
  return documents.filter(isConfirmableDocument);
}

/** 정의 밖 상태는 가장 낮은 우선순위로 본다 (후보 필터가 이미 걸러내지만 정렬도 안전하게) */
function statusPriority(status: string): number {
  return isDocumentStatus(status) ? STATUS_PRIORITY[status] : -1;
}

/**
 * **버전 묶음마다 대표 1건**을 뽑는다 (기회-6 × F-214).
 *
 * 버전은 별도 테이블이 아니라 Document 행을 하나 더 만드는 방식이라(`@/lib/document-version`),
 * 아무 처리도 하지 않으면 같은 견적서의 v1·v2 가 **서로 다른 문서인 척 경쟁한다.**
 * 둘 다 초안이면 `updatedAt` 순으로 갈리는데, 그건 "어느 문서를 금액 근거로 삼을까"의
 * 답이 아니다 — 우연히 맞는 경우가 많을 뿐이다. 그래서 묶음 안에서 먼저 대표를 정하고,
 * 대표들끼리만 기존 우선순위로 겨루게 한다.
 *
 * 묶음 안의 순서:
 *  ① **버전 확정본(`isConfirmed`)** — 사용자가 "이게 확정본"이라 직접 표시한 것이라
 *     가장 강한 신호다. 여러 버전에 동시에 붙을 수 있으므로 아래 ②·③ 으로 이어서 가른다.
 *  ② 상태 우선순위 (계약완료 > 발송완료 > 초안)
 *  ③ **높은 version 번호** — 묶음 안에서는 `updatedAt` 보다 버전 번호가 의도된 순서다
 *     (v1 을 나중에 열어 고쳐도 v2 가 후속본이라는 사실은 변하지 않는다).
 *  ④·⑤ 최근 수정 → id — 여기까지 같은 값은 데이터가 깨진 경우뿐이지만, 그때도 결과가
 *     입력 배열 순서에 좌우되면 같은 데이터로 화면마다 다른 금액이 나온다.
 *
 * **`latestVersionsOnly()` 를 쓰지 않는 이유**(중요 — 다음 사람이 반드시 다시 시도한다):
 * 그 함수는 `@/lib/document-version` 에 이미 있지만 **보관함 목록용**이다. 금액 판정에
 * 쓰면 "v1 로 계약이 체결된 뒤 누군가 v2 초안을 만들면 서명된 금액을 잃는다" —
 * 최신이 곧 권위 있는 버전은 아니다. 그래서 여기서는 상태·확정본이 버전 번호를 이긴다.
 *
 * 폐기(VOID)·정의 밖 상태는 애초에 후보가 아니므로 이 함수에 넘기기 전에
 * `confirmableDocuments()` 로 걸러 둔다 — 묶음의 모든 버전이 폐기면 그 묶음은 대표가 없다.
 */
export function representativeByVersionGroup<T extends ConfirmableDocument>(
  documents: readonly T[],
): T[] {
  // Map 은 처음 만난 묶음의 순서를 지킨다 — 뒤에서 정렬하지만 입력 순서에 따른 흔들림이 없다.
  const byGroup = new Map<string, T>();
  for (const document of documents) {
    const key = rootIdOf(document);
    const current = byGroup.get(key);
    if (!current || compareWithinVersionGroup(document, current) < 0) {
      byGroup.set(key, document);
    }
  }
  return [...byGroup.values()];
}

/** 묶음 안의 대표 순서 — 음수면 `a` 가 앞선다 */
function compareWithinVersionGroup(
  a: ConfirmableDocument,
  b: ConfirmableDocument,
): number {
  const confirmedGap = Number(b.isConfirmed) - Number(a.isConfirmed);
  if (confirmedGap !== 0) return confirmedGap;
  const priorityGap = statusPriority(b.status) - statusPriority(a.status);
  if (priorityGap !== 0) return priorityGap;
  const versionGap = b.version - a.version;
  if (versionGap !== 0) return versionGap;
  const timeGap = b.updatedAt.getTime() - a.updatedAt.getTime();
  if (timeGap !== 0) return timeGap;
  return compareId(a.id, b.id);
}

/**
 * 자동 판정 순서로 정렬한 새 배열 (원본은 건드리지 않는다).
 * ① 상태 우선순위 내림차순 → ② 최근 수정 순 → ③ id 오름차순.
 *
 * **묶음 사이의 경쟁 규칙**이다 — 같은 묶음의 여러 버전을 그대로 넘기면 버전끼리
 * 겨루게 되므로, 자동 판정은 `representativeByVersionGroup()` 을 먼저 통과시킨다.
 *
 * ③ 이 필요한 이유: 시드처럼 여러 문서의 `updatedAt` 이 똑같을 수 있는데, 그때 순서가
 * 입력 배열에 좌우되면 같은 데이터로도 화면마다 다른 확정 문서가 나온다.
 */
export function sortByConfirmPriority<T extends ConfirmableDocument>(
  documents: readonly T[],
): T[] {
  return [...documents].sort((a, b) => {
    const priorityGap = statusPriority(b.status) - statusPriority(a.status);
    if (priorityGap !== 0) return priorityGap;
    const timeGap = b.updatedAt.getTime() - a.updatedAt.getTime();
    if (timeGap !== 0) return timeGap;
    return compareId(a.id, b.id);
  });
}

/** id 오름차순 (같은 데이터면 항상 같은 결과가 나오도록 마지막에 쓰는 기준) */
function compareId(a: string, b: string): number {
  return a < b ? -1 : a > b ? 1 : 0;
}

/** 재판정 직전의 상태 — 무엇이 확정이었고, 사용자가 고정했는지 */
export type ConfirmedDocumentState = {
  /** 현재 확정 문서 id (없으면 null) */
  confirmedDocumentId: string | null;
  /** 사용자가 직접 고른 상태인지 (기회-6 ③ 잠금) */
  isPinned: boolean;
};

/** 재판정 결과 */
export type ConfirmedDocumentResolution = ConfirmedDocumentState & {
  /** 확정 문서의 금액. 확정 문서가 없으면 0 이다 (기회-6 ④). */
  amount: number;
  /** 직전 상태와 확정 문서가 달라졌는지 — 달라졌으면 화면에 알려야 한다 (기회-6 ②) */
  hasChanged: boolean;
};

/**
 * 확정 문서를 다시 판정한다 (기회-6 ①·③·④).
 *
 * 재판정 시점은 세 가지다 — **문서 연결(해제) · 문서 상태 변경 · 문서 금액 변경**.
 * 호출측은 그 기회에 지금 붙어 있는 문서 전부와 직전 상태를 넘긴다.
 *
 * 규칙:
 *  ① **수동 고정(pinned)이 자동 판정보다 우선한다.** 사용자가 고른 문서가 여전히 후보면
 *     문서가 몇 개 더 붙든 그 문서를 유지한다 — 그게 "잠금"의 뜻이다.
 *  ② 고정된 문서가 후보에서 사라지면(연결 해제·폐기·삭제) **고정이 자동으로 풀리고**
 *     자동 판정으로 돌아간다. 사라진 문서를 계속 가리키면 금액의 근거가 없어진다.
 *  ③ 그 외에는 **버전 묶음마다 대표를 먼저 뽑고**(`representativeByVersionGroup`),
 *     대표들끼리 우선순위(계약완료 > 발송완료 > 초안, 동순위는 최근 수정)로 겨룬다.
 *     같은 견적서의 v1·v2 가 서로 경쟁하면 금액의 근거가 우연에 좌우된다.
 *  ④ 후보가 하나도 없으면 확정 문서 없음 → 금액 0 이고 고정도 풀린다.
 *
 * ①의 고정 여부는 **대표를 거르기 전에** 본다 — 사용자가 고른 것은 묶음이 아니라
 * 그 버전이므로, 대표로 뽑히지 못한 버전이라도 고정되어 있으면 그대로 유지한다.
 */
export function resolveConfirmedDocument(
  documents: readonly ConfirmableDocument[],
  current: ConfirmedDocumentState,
): ConfirmedDocumentResolution {
  const candidates = confirmableDocuments(documents);

  const pinned = current.isPinned
    ? candidates.find((document) => document.id === current.confirmedDocumentId)
    : undefined;

  if (pinned) {
    return {
      confirmedDocumentId: pinned.id,
      isPinned: true,
      amount: pinned.amount,
      hasChanged: current.confirmedDocumentId !== pinned.id,
    };
  }

  const [best] = sortByConfirmPriority(representativeByVersionGroup(candidates));
  if (!best) {
    return {
      confirmedDocumentId: null,
      isPinned: false,
      amount: 0,
      hasChanged: current.confirmedDocumentId !== null,
    };
  }

  return {
    confirmedDocumentId: best.id,
    isPinned: false,
    amount: best.amount,
    hasChanged: current.confirmedDocumentId !== best.id,
  };
}

/**
 * 사용자가 문서를 확정으로 **직접 지정**한다 (기회-6 ③).
 * 후보가 아닌 문서(폐기·정의 밖 상태)는 지정할 수 없다 — 지정되면 금액의 근거가 무너진다.
 * 성공하면 잠금 상태가 되어 이후 자동 판정에서 제외된다.
 *
 * **버전 동작: 묶음이 아니라 사용자가 고른 그 버전을 고정한다.** "직접 지정"의 뜻이 그것이고,
 * 묶음을 고정하면 나중에 만들어진 v3 초안이 서명된 v2 를 밀어내는 일이 벌어진다.
 * 대신 고정된 버전보다 **뒤 버전이 생겨도 금액이 따라가지 않는다**는 사실을 사용자가
 * 알 수 있어야 한다 — 판정 결과만으로는 그 사실이 드러나지 않으므로, 화면이 "이 묶음에
 * 더 새 버전이 있다"를 알리려면 같은 rootId 의 최대 version 을 따로 읽어 비교해야 한다
 * (이번 범위에서는 UI 를 만들지 않았다).
 */
export function pinConfirmedDocument(
  documents: readonly ConfirmableDocument[],
  documentId: string,
  current: ConfirmedDocumentState,
): ConfirmedDocumentResolution | { error: string } {
  const target = documents.find((document) => document.id === documentId);
  if (!target) {
    return { error: "이 기회에 연결된 문서가 아닙니다." };
  }
  if (!isConfirmableDocument(target)) {
    return {
      error: `${statusLabel(target.status)} 문서는 예상 금액의 기준으로 지정할 수 없습니다.`,
    };
  }
  return {
    confirmedDocumentId: target.id,
    isPinned: true,
    amount: target.amount,
    hasChanged: current.confirmedDocumentId !== target.id,
  };
}

/** 잠금을 풀고 자동 판정으로 되돌린다 (기회-6 ③ "자동 판정으로 되돌리기") */
export function unpinConfirmedDocument(
  documents: readonly ConfirmableDocument[],
  current: ConfirmedDocumentState,
): ConfirmedDocumentResolution {
  return resolveConfirmedDocument(documents, {
    confirmedDocumentId: current.confirmedDocumentId,
    isPinned: false,
  });
}

/** 상태 라벨 (정의 밖 값이면 원문 그대로) */
function statusLabel(status: string): string {
  return isDocumentStatus(status) ? DOCUMENT_STATUS_LABELS[status] : status;
}
