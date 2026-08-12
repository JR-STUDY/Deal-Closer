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
 */

import assert from "node:assert/strict";
import {
  confirmableDocuments,
  isConfirmableDocument,
  pinConfirmedDocument,
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

/** 합성 문서 한 건 — 시각은 ISO 문자열로 준다 (테스트가 로컬 타임존에 흔들리지 않도록) */
function doc(
  id: string,
  status: string,
  amount: number,
  updatedAt: string,
): ConfirmableDocument {
  return { id, status, amount, updatedAt: new Date(updatedAt) };
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

console.log(`✅ 확정 문서 판정 검증 통과 — ${checks}건`);
