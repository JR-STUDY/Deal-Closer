/**
 * 문서 편집 잠금 판정 검증 — `@/lib/document-edit` (네트워크·DB 없이 순수 함수만).
 * 실행: pnpm test:document-edit
 *
 * 이 판정이 화면과 서버에서 갈라지면 **화면에서는 막혔는데 API 로는 통한다**(또는 반대).
 * 문서 금액은 확정 문서를 통해 기회 예상 금액이 되므로(기회-6), 사후 편집이 새면
 * 고객이 받은 PDF 와 파이프라인 숫자가 둘 다 조용히 어긋난다. 다음을 본다.
 *  ① 초안만 자유롭게 고친다
 *  ② 발송완료·계약완료·폐기는 잠긴다
 *  ③ 확정본은 **상태보다 먼저** 본다 (초안 확정본도 잠긴다)
 *  ④ 잠긴 이유 문구는 비어 있지 않다 (배너·409 응답이 같은 말을 쓴다)
 *  ⑤ 본문 변경 판정 — 상태·확정본·폴더 변경은 잠긴 문서에도 허용해야 한다
 *     (발송 라우트가 상태를 올리고, 확정본 해제가 잠금을 푸는 유일한 길이다)
 */

import assert from "node:assert/strict";
import { documentEditLock, isContentMutation } from "../src/lib/document-edit";

let checks = 0;
function check(actual: unknown, expected: unknown, message: string) {
  assert.deepEqual(actual, expected, message);
  checks += 1;
}
function ok(condition: boolean, message: string) {
  assert.ok(condition, message);
  checks += 1;
}

// ── ① 초안만 고칠 수 있다 ──
check(
  documentEditLock({ status: "DRAFT", isConfirmed: false }),
  { locked: false, reason: "" },
  "초안은 자유롭게 고친다",
);

// ── ② 바깥에 나간 문서·폐기 문서는 잠긴다 ──
for (const status of ["SENT", "COMPLETED", "VOID"]) {
  const lock = documentEditLock({ status, isConfirmed: false });
  ok(lock.locked, `${status} 는 잠긴다`);
  ok(lock.reason.length > 0, `${status} 의 잠긴 이유가 있다`);
  ok(
    lock.reason.includes("새 버전"),
    `${status} 안내가 고치는 방법(새 버전)을 알려준다`,
  );
}

// 정의 밖 상태도 잠근다 — 모르는 상태를 편집 가능으로 열어 주지 않는다
ok(
  documentEditLock({ status: "무엇인가", isConfirmed: false }).locked,
  "알 수 없는 상태는 잠근다 (모르면 막는다)",
);

// ── ③ 확정본은 상태보다 먼저 본다 ──
const confirmedDraft = documentEditLock({ status: "DRAFT", isConfirmed: true });
ok(confirmedDraft.locked, "초안이어도 확정본이면 잠긴다");
ok(
  confirmedDraft.reason.includes("확정본"),
  "확정본이 이유임을 밝힌다 (상태 문구로 뭉개지 않는다)",
);

// ── ⑤ 본문 변경 판정 ──
ok(isContentMutation({ contentJson: "{}" }), "contentJson 은 본문 변경");
ok(isContentMutation({ title: "새 제목" }), "제목은 본문 변경");
ok(isContentMutation({ items: [] }), "라인아이템은 본문 변경");
ok(isContentMutation({ amount: 100 }), "금액은 본문 변경");
ok(isContentMutation({ type: "CONTRACT" }), "문서 종류는 본문 변경");
ok(isContentMutation({ clientName: "다올테크" }), "거래처명은 본문 변경");

ok(
  !isContentMutation({ status: "SENT" }),
  "상태 변경은 본문 변경이 아니다 — 발송 라우트가 잠긴 문서의 상태를 올린다",
);
ok(
  !isContentMutation({ isConfirmed: false }),
  "확정본 해제는 본문 변경이 아니다 — 이것이 잠금을 푸는 유일한 길이다",
);
ok(
  !isContentMutation({ folderId: "folder_1" }),
  "폴더 이동은 본문을 바꾸지 않는다",
);
ok(!isContentMutation({}), "빈 본문은 변경이 아니다");

// 섞여 있으면 본문 변경으로 본다 (한 요청에 실어 우회할 수 없게)
ok(
  isContentMutation({ status: "SENT", contentJson: "{}" }),
  "상태와 본문을 함께 보내도 본문 변경으로 잡는다",
);

console.log(`✅ 문서 편집 잠금 판정 검증 통과 — ${checks}건`);
