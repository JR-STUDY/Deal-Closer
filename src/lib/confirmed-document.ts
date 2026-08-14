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

/**
 * 판정에 필요한 최소 필드. Prisma 의 `Document` row 를 그대로 넘길 수 있다
 * (구조적 타이핑이라 추가 필드가 있어도 된다).
 * `status` 는 DB 가 String 컬럼이라 넓게 받고 내부에서 좁힌다 —
 * 정의 밖 값은 어떤 규칙을 적용할지 알 수 없으므로 후보에서 뺀다.
 */
export type ConfirmableDocument = {
  id: string;
  status: string;
  /** 문서 총액 (KRW 정수) */
  amount: number;
  /** 동순위를 가르는 기준 — 최근 수정이 앞선다 */
  updatedAt: Date;
};

/**
 * 확정 문서 우선순위 — 큰 값이 먼저다 (기회-6 ①).
 *
 * 계약완료 > 발송완료 > 초안 순인 이유는 "얼마로 합의됐는가"에 가까운 문서일수록
 * 예상 금액으로서 신뢰도가 높기 때문이다. **폐기(VOID)는 후보에서 제외**하므로 값이 가장 낮다.
 * `prisma/migrations/20260812023824_add_opportunity_confirmed_document` 의 백필 SQL 이
 * 같은 순서를 쓴다 — 여기를 고치면 그 SQL 의 CASE 도 함께 봐야 한다.
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
 * 자동 판정 순서로 정렬한 새 배열 (원본은 건드리지 않는다).
 * ① 상태 우선순위 내림차순 → ② 최근 수정 순 → ③ id 오름차순.
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
    return a.id < b.id ? -1 : a.id > b.id ? 1 : 0;
  });
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
 *  ③ 그 외에는 우선순위(계약완료 > 발송완료 > 초안, 동순위는 최근 수정)로 뽑는다.
 *  ④ 후보가 하나도 없으면 확정 문서 없음 → 금액 0 이고 고정도 풀린다.
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

  const [best] = sortByConfirmPriority(candidates);
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
