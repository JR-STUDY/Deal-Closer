/**
 * 확정 문서 판정 검증 — `@/lib/confirmed-document` (네트워크·DB 없이 순수 함수만).
 * 실행: pnpm test:confirmed-document
 *
 * 예상 금액이 확정 문서에서 오므로(기회-6), 이 판정이 흔들리면 **화면의 금액이 이유 없이
 * 바뀐다.** 그래서 다음을 집중적으로 본다.
 *  ① 우선순위 — 계약완료 > 발송완료 > 초안
 *  ② 폐기(VOID)는 후보에서 제외 (정의 밖 상태도 마찬가지)
 *  ③ 동순위는 최근 수정 순, 그마저 같으면 id 순 (같은 데이터면 항상 같은 결과)
 *  ④ 후보가 없으면 확정 문서 없음 → 0 원
 *  ⑤ 수동 잠금이 자동 판정을 이기고, 잠긴 문서가 사라지면 잠금이 풀린다
 *  ⑥ **버전 묶음** — 같은 견적서의 v1·v2 는 서로 경쟁하지 않는다 (묶음마다 대표 1건)
 */

import assert from "node:assert/strict";
import {
  confirmableDocuments,
  isConfirmableDocument,
  pinConfirmedDocument,
  representativeByVersionGroup,
  resolveConfirmedDocument,
  sortByConfirmPriority,
  unpinConfirmedDocument,
  type ConfirmableDocument,
  type ConfirmedDocumentState,
} from "../src/lib/confirmed-document";

let checks = 0;
function check(actual: unknown, expected: unknown, message: string) {
  assert.deepEqual(actual, expected, message);
  checks += 1;
}
function ok(condition: boolean, message: string) {
  assert.ok(condition, message);
  checks += 1;
}

/**
 * 합성 문서 한 건 — 시각은 ISO 문자열로 준다 (테스트가 로컬 타임존에 흔들리지 않도록).
 * 버전을 다루지 않는 케이스는 **v1 단독 묶음**(rootId=null · version=1)으로 본다 —
 * 실제 데이터에서도 버전을 만들지 않은 문서가 그 모양이다.
 */
function doc(
  id: string,
  status: string,
  amount: number,
  updatedAt: string,
): ConfirmableDocument {
  return {
    id,
    status,
    amount,
    updatedAt: new Date(updatedAt),
    rootId: null,
    version: 1,
    isConfirmed: false,
  };
}

/**
 * 버전 묶음에 속한 문서 한 건.
 * `rootId` 를 명시하면 그 묶음의 후속 버전이고, null 이면 이 문서가 묶음의 뿌리(v1)다.
 */
function versioned(
  id: string,
  status: string,
  amount: number,
  updatedAt: string,
  version: number,
  rootId: string | null,
  isConfirmed = false,
): ConfirmableDocument {
  return {
    ...doc(id, status, amount, updatedAt),
    version,
    rootId,
    isConfirmed,
  };
}

/** 자동 판정 상태 (잠금 없음) */
const AUTO: ConfirmedDocumentState = {
  confirmedDocumentId: null,
  isPinned: false,
};

const DRAFT = doc("doc_draft", "DRAFT", 10_000_000, "2026-08-10T09:00:00Z");
const SENT = doc("doc_sent", "SENT", 52_000_000, "2026-08-02T09:00:00Z");
const COMPLETED = doc(
  "doc_done",
  "COMPLETED",
  48_000_000,
  "2026-07-01T09:00:00Z",
);
const VOIDED = doc("doc_void", "VOID", 999_000_000, "2026-08-11T09:00:00Z");

// ───────────────────────── ① 우선순위 ─────────────────────────
check(
  resolveConfirmedDocument([DRAFT, SENT, COMPLETED], AUTO).confirmedDocumentId,
  "doc_done",
  "계약완료가 발송완료·초안보다 앞선다",
);
check(
  resolveConfirmedDocument([DRAFT, SENT], AUTO).confirmedDocumentId,
  "doc_sent",
  "발송완료가 초안보다 앞선다",
);
check(
  resolveConfirmedDocument([DRAFT], AUTO).confirmedDocumentId,
  "doc_draft",
  "초안뿐이면 초안이 확정 문서가 된다",
);
check(
  resolveConfirmedDocument([DRAFT, SENT, COMPLETED], AUTO).amount,
  48_000_000,
  "예상 금액은 확정 문서의 금액을 그대로 쓴다 (합계가 아니다)",
);
check(
  sortByConfirmPriority([DRAFT, SENT, COMPLETED]).map((d) => d.id),
  ["doc_done", "doc_sent", "doc_draft"],
  "정렬 결과도 계약완료 → 발송완료 → 초안 순이다",
);

// 원본 배열을 건드리지 않는다 (호출측이 넘긴 목록의 순서가 바뀌면 화면 표시가 흔들린다)
const original = [DRAFT, SENT, COMPLETED];
sortByConfirmPriority(original);
check(
  original.map((d) => d.id),
  ["doc_draft", "doc_sent", "doc_done"],
  "정렬은 새 배열을 돌려주고 원본을 바꾸지 않는다",
);

// ──────────────────── ② 폐기·정의 밖 상태는 후보에서 제외 ────────────────────
ok(!isConfirmableDocument(VOIDED), "폐기 문서는 후보가 아니다");
ok(
  !isConfirmableDocument(doc("doc_x", "ARCHIVED", 1, "2026-08-11T09:00:00Z")),
  "정의 밖 상태도 후보가 아니다 (무엇을 뜻하는지 알 수 없다)",
);
check(
  confirmableDocuments([DRAFT, VOIDED]).map((d) => d.id),
  ["doc_draft"],
  "후보 목록에서 폐기 문서가 빠진다",
);
check(
  resolveConfirmedDocument([VOIDED, DRAFT], AUTO).confirmedDocumentId,
  "doc_draft",
  "폐기 문서가 가장 최근·가장 큰 금액이어도 초안에 밀린다",
);
check(
  resolveConfirmedDocument([VOIDED], AUTO),
  { confirmedDocumentId: null, isPinned: false, amount: 0, hasChanged: false },
  "폐기 문서만 있으면 확정 문서 없음 (0원)",
);

// ─────────────── ③ 동순위는 최근 수정 순, 그다음 id 순 ───────────────
const olderSent = doc("doc_s1", "SENT", 30_000_000, "2026-08-01T09:00:00Z");
const newerSent = doc("doc_s2", "SENT", 44_000_000, "2026-08-05T09:00:00Z");
check(
  resolveConfirmedDocument([olderSent, newerSent], AUTO).confirmedDocumentId,
  "doc_s2",
  "같은 발송완료끼리는 최근 수정이 앞선다",
);
check(
  resolveConfirmedDocument([newerSent, olderSent], AUTO).confirmedDocumentId,
  "doc_s2",
  "입력 순서가 반대여도 결과는 같다",
);

const sameTimeB = doc("doc_b", "SENT", 20_000_000, "2026-08-05T09:00:00Z");
const sameTimeA = doc("doc_a", "SENT", 25_000_000, "2026-08-05T09:00:00Z");
check(
  resolveConfirmedDocument([sameTimeB, sameTimeA], AUTO).confirmedDocumentId,
  "doc_a",
  "수정 시각까지 같으면 id 오름차순으로 갈라 결과가 흔들리지 않는다",
);
check(
  resolveConfirmedDocument([sameTimeA, sameTimeB], AUTO).confirmedDocumentId,
  "doc_a",
  "id 로 갈랐으므로 입력 순서를 바꿔도 같은 문서가 뽑힌다",
);

// ─────────────────────── ④ 후보 없음 → 0원 ───────────────────────
check(
  resolveConfirmedDocument([], AUTO),
  { confirmedDocumentId: null, isPinned: false, amount: 0, hasChanged: false },
  "문서가 없으면 확정 문서 없음 · 0원이고 바뀐 것도 없다",
);
check(
  resolveConfirmedDocument([], {
    confirmedDocumentId: "doc_sent",
    isPinned: false,
  }),
  { confirmedDocumentId: null, isPinned: false, amount: 0, hasChanged: true },
  "있던 확정 문서가 사라지면 0원으로 내려가고 '바뀜' 으로 알린다",
);

// ─────────────────── ⑤ 수동 잠금 — 자동 판정보다 우선 ───────────────────
const PINNED_SENT: ConfirmedDocumentState = {
  confirmedDocumentId: "doc_sent",
  isPinned: true,
};

check(
  resolveConfirmedDocument([DRAFT, SENT, COMPLETED], PINNED_SENT),
  {
    confirmedDocumentId: "doc_sent",
    isPinned: true,
    amount: 52_000_000,
    hasChanged: false,
  },
  "잠긴 문서는 더 높은 우선순위(계약완료)가 있어도 유지된다",
);
check(
  resolveConfirmedDocument([DRAFT, COMPLETED], PINNED_SENT).confirmedDocumentId,
  "doc_done",
  "잠긴 문서가 후보에서 사라지면 자동 판정으로 되돌아간다",
);
check(
  resolveConfirmedDocument([DRAFT, COMPLETED], PINNED_SENT).isPinned,
  false,
  "그때 잠금도 함께 풀린다 (근거 없는 잠금을 남기지 않는다)",
);
check(
  resolveConfirmedDocument([DRAFT, SENT], {
    confirmedDocumentId: "doc_sent",
    isPinned: false,
  }).confirmedDocumentId,
  "doc_sent",
  "잠금이 아니어도 자동 판정 결과가 같으면 확정 문서는 그대로다",
);

// 잠금 지정 — 후보만 지정할 수 있다
const pinned = pinConfirmedDocument([DRAFT, SENT], "doc_draft", AUTO);
ok(!("error" in pinned), "연결된 후보 문서는 확정으로 지정할 수 있다");
if (!("error" in pinned)) {
  check(
    pinned,
    {
      confirmedDocumentId: "doc_draft",
      isPinned: true,
      amount: 10_000_000,
      hasChanged: true,
    },
    "지정하면 잠금 상태가 되고 금액도 그 문서 기준으로 바뀐다",
  );
}

const pinVoid = pinConfirmedDocument([DRAFT, VOIDED], "doc_void", AUTO);
ok("error" in pinVoid, "폐기 문서는 확정으로 지정할 수 없다");
if ("error" in pinVoid) {
  ok(
    pinVoid.error.includes("폐기"),
    "거부 사유에 폐기 상태가 드러난다 (사용자가 이유를 알 수 있다)",
  );
}

const pinForeign = pinConfirmedDocument([DRAFT], "doc_other", AUTO);
ok("error" in pinForeign, "이 기회에 연결되지 않은 문서는 지정할 수 없다");

// 잠금 해제 — 자동 판정으로 복귀
check(
  unpinConfirmedDocument([DRAFT, SENT, COMPLETED], PINNED_SENT),
  {
    confirmedDocumentId: "doc_done",
    isPinned: false,
    amount: 48_000_000,
    hasChanged: true,
  },
  "자동 판정으로 되돌리면 우선순위가 가장 높은 문서로 돌아간다",
);
check(
  unpinConfirmedDocument([SENT], PINNED_SENT),
  {
    confirmedDocumentId: "doc_sent",
    isPinned: false,
    amount: 52_000_000,
    hasChanged: false,
  },
  "되돌린 결과가 같은 문서면 금액은 그대로이고 잠금만 풀린다",
);

// ═══════════════ ⑥ 버전 묶음 — 같은 견적서의 v1·v2 는 경쟁하지 않는다 ═══════════════
//
// 버전은 별도 테이블이 아니라 Document 행을 하나 더 만드는 방식이라(F-214), 아무 처리도
// 하지 않으면 v1·v2 가 서로 다른 문서인 척 겨룬다. 묶음마다 대표 1건을 먼저 뽑고
// 대표들끼리만 기존 우선순위로 겨루는지 본다.

/** 견적서 묶음 A — v1 이 뿌리(rootId=null), v2·v3 는 rootId 로 v1 을 가리킨다 */
const A1 = versioned("doc_a1", "DRAFT", 10_000_000, "2026-08-01T09:00:00Z", 1, null);
const A2 = versioned("doc_a2", "DRAFT", 12_000_000, "2026-08-02T09:00:00Z", 2, "doc_a1");
const A3 = versioned("doc_a3", "DRAFT", 13_000_000, "2026-08-03T09:00:00Z", 3, "doc_a1");

// ── 상태가 버전 번호를 이긴다 (latestVersionsOnly 를 쓰면 안 되는 이유) ──
const A1_DONE = { ...A1, status: "COMPLETED", amount: 40_000_000 };
check(
  resolveConfirmedDocument([A1_DONE, A2], AUTO).confirmedDocumentId,
  "doc_a1",
  "v1 이 계약완료면 뒤에 v2 초안이 생겨도 v1 이 기준이다 (서명된 금액을 잃지 않는다)",
);
check(
  resolveConfirmedDocument([A1_DONE, A2], AUTO).amount,
  40_000_000,
  "그때 금액도 계약된 v1 의 금액이다",
);
check(
  resolveConfirmedDocument([A2, A1_DONE], AUTO).confirmedDocumentId,
  "doc_a1",
  "입력 순서를 바꿔도 같다",
);

// ── 상태가 같으면 버전 번호가 갈라준다 (updatedAt 이 아니다) ──
check(
  resolveConfirmedDocument([A1, A2], AUTO).confirmedDocumentId,
  "doc_a2",
  "v1·v2 가 둘 다 초안이면 뒤 버전(v2)이 대표다",
);
// v1 을 나중에 열어 고쳐도 v2 가 후속본이라는 사실은 변하지 않는다.
const A1_TOUCHED = { ...A1, updatedAt: new Date("2026-08-09T09:00:00Z") };
check(
  resolveConfirmedDocument([A1_TOUCHED, A2], AUTO).confirmedDocumentId,
  "doc_a2",
  "v1 을 나중에 수정해도 묶음 안에서는 버전 번호가 기준이다 (updatedAt 이 아니다)",
);
check(
  resolveConfirmedDocument([A1, A2, A3], AUTO).confirmedDocumentId,
  "doc_a3",
  "버전이 셋이면 가장 높은 번호가 대표다",
);

// ── 버전 확정본(isConfirmed)이 상태·버전보다 앞선다 ──
const A1_MARKED = { ...A1, isConfirmed: true };
check(
  resolveConfirmedDocument([A1_MARKED, A2, A3], AUTO).confirmedDocumentId,
  "doc_a1",
  "낮은 버전이라도 버전 확정본으로 표시돼 있으면 그것이 대표다",
);
const A1_MARKED_DRAFT = { ...A1, isConfirmed: true };
const A2_SENT = { ...A2, status: "SENT" };
check(
  resolveConfirmedDocument([A1_MARKED_DRAFT, A2_SENT], AUTO).confirmedDocumentId,
  "doc_a1",
  "상태가 더 낮은 버전에 확정본이 붙어 있어도 그 표시를 따른다 (사용자가 직접 고른 신호)",
);

// ── 확정본이 여러 버전에 붙을 수 있다 → 상태 → 버전 번호로 이어서 가른다 ──
check(
  resolveConfirmedDocument(
    [{ ...A1, isConfirmed: true }, { ...A2, isConfirmed: true }],
    AUTO,
  ).confirmedDocumentId,
  "doc_a2",
  "확정본이 둘이면 (상태가 같으므로) 뒤 버전이 대표다",
);
check(
  resolveConfirmedDocument(
    [
      { ...A1, isConfirmed: true, status: "SENT" },
      { ...A2, isConfirmed: true },
    ],
    AUTO,
  ).confirmedDocumentId,
  "doc_a1",
  "확정본이 둘이면 그다음은 상태 우선순위로 가른다 (발송완료 > 초안)",
);

// ── 묶음 2개가 경쟁 — 대표끼리만 기존 우선순위로 겨룬다 ──
const B1 = versioned("doc_b1", "SENT", 20_000_000, "2026-07-20T09:00:00Z", 1, null);
const B2 = versioned("doc_b2", "DRAFT", 25_000_000, "2026-08-05T09:00:00Z", 2, "doc_b1");
check(
  resolveConfirmedDocument([A1, A2, B1, B2], AUTO).confirmedDocumentId,
  "doc_b1",
  "묶음 B 의 대표(발송완료 v1)가 묶음 A 의 대표(초안 v2)를 이긴다",
);
check(
  resolveConfirmedDocument([A1, A2, B1, B2], AUTO).amount,
  20_000_000,
  "금액도 이긴 묶음의 대표 문서에서 온다",
);
check(
  representativeByVersionGroup([A1, A2, A3, B1, B2]).map((d) => d.id),
  ["doc_a3", "doc_b1"],
  "묶음마다 대표가 정확히 1건씩 나온다 (묶음 수만큼)",
);
check(
  representativeByVersionGroup([B2, A2, B1, A1, A3]).map((d) => d.id).sort(),
  ["doc_a3", "doc_b1"],
  "입력 순서가 달라도 같은 대표가 뽑힌다",
);

// ── rootId=null 인 v1 단독 — 자기 자신이 묶음 키다 ──
check(
  representativeByVersionGroup([A1]).map((d) => d.id),
  ["doc_a1"],
  "rootId 가 null 인 v1 단독 문서는 자기 자신이 묶음이 되어 그대로 대표가 된다",
);
check(
  resolveConfirmedDocument([A1], AUTO).confirmedDocumentId,
  "doc_a1",
  "v1 단독이면 그 문서가 확정 문서다",
);
check(
  representativeByVersionGroup([DRAFT, SENT, COMPLETED]).map((d) => d.id),
  ["doc_draft", "doc_sent", "doc_done"],
  "버전을 만들지 않은 문서들은 각자 별개 묶음이라 하나도 걸러지지 않는다",
);

// ── 폐기 버전은 묶음 안에서도 제외된다 ──
const A2_VOID = { ...A2, status: "VOID", amount: 999_000_000 };
check(
  resolveConfirmedDocument([A1, A2_VOID], AUTO).confirmedDocumentId,
  "doc_a1",
  "뒤 버전이 폐기되면 앞 버전이 그 묶음의 대표가 된다",
);
check(
  resolveConfirmedDocument([A1, A2_VOID], AUTO).amount,
  10_000_000,
  "폐기된 v2 의 금액이 새어 들어오지 않는다",
);
check(
  resolveConfirmedDocument(
    [{ ...A1, status: "VOID" }, A2_VOID],
    AUTO,
  ),
  { confirmedDocumentId: null, isPinned: false, amount: 0, hasChanged: false },
  "묶음의 모든 버전이 폐기면 그 묶음은 대표가 없다 (확정 문서 없음 · 0원)",
);
check(
  resolveConfirmedDocument([{ ...A1, isConfirmed: true, status: "VOID" }, A2], AUTO)
    .confirmedDocumentId,
  "doc_a2",
  "폐기된 버전은 확정본 표시가 붙어 있어도 후보가 아니다",
);

// ── 수동 고정은 묶음이 아니라 그 버전을 가리킨다 ──
const PINNED_A1: ConfirmedDocumentState = {
  confirmedDocumentId: "doc_a1",
  isPinned: true,
};
check(
  resolveConfirmedDocument([A1, A2, A3], PINNED_A1).confirmedDocumentId,
  "doc_a1",
  "고정한 버전은 대표로 뽑히지 못했어도 그대로 유지된다 (직접 지정의 뜻)",
);
check(
  resolveConfirmedDocument([A1, A2, A3], PINNED_A1).amount,
  10_000_000,
  "그때 금액도 고정한 그 버전의 금액이다 — 뒤 버전이 생겨도 따라가지 않는다",
);
check(
  resolveConfirmedDocument([A2, A3], PINNED_A1).confirmedDocumentId,
  "doc_a3",
  "고정한 버전이 사라지면(삭제·해제) 같은 묶음의 새 대표로 자동 판정이 돌아간다",
);
check(
  resolveConfirmedDocument([A2, A3], PINNED_A1).isPinned,
  false,
  "그때 고정도 함께 풀린다 (없는 버전을 계속 가리키지 않는다)",
);
check(
  resolveConfirmedDocument([{ ...A1, status: "VOID" }, A2], PINNED_A1)
    .confirmedDocumentId,
  "doc_a2",
  "고정한 버전이 폐기되면 후보에서 빠지므로 고정이 풀리고 다시 판정한다",
);

// 고정 지정도 버전을 가리지 않는다 — 후보이기만 하면 어느 버전이든 지정할 수 있다.
const pinOldVersion = pinConfirmedDocument([A1, A2, A3], "doc_a1", AUTO);
ok(!("error" in pinOldVersion), "뒤 버전이 있어도 앞 버전을 확정 문서로 지정할 수 있다");
if (!("error" in pinOldVersion)) {
  check(
    pinOldVersion.amount,
    10_000_000,
    "지정한 버전의 금액이 그대로 예상 금액이 된다",
  );
}
const pinVoidVersion = pinConfirmedDocument([A1, A2_VOID], "doc_a2", AUTO);
ok("error" in pinVoidVersion, "폐기된 버전은 확정 문서로 지정할 수 없다");

console.log(`✅ 확정 문서 판정 검증 통과 — ${checks}건`);
