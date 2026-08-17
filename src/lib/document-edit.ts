/**
 * 문서 편집 잠금 **규칙** 순수 함수 (진단 3).
 *
 * 고객에게 이미 보낸 문서(발송완료)·체결한 문서(계약완료)·확정본·폐기 문서를
 * 그 자리에서 고칠 수 있으면, 손에 든 PDF 와 DB 가 갈라진다. 게다가 문서 금액은
 * 확정 문서를 통해 기회 예상 금액이 되므로(기회-6) 사후 편집이 파이프라인 숫자까지
 * 조용히 바꾼다.
 *
 * 그래서 이 문서들은 **읽기 전용**으로 두고, 고치려면 이미 있는 버전 기능(F-214)으로
 * **새 버전을 만들어** 편집한다 — 원본은 보존되고 무엇이 언제 바뀌었는지 남는다.
 *
 * 판정과 안내 문구를 여기 한곳에 둔다. 화면과 라우트가 각자 판단하면 화면에서는
 * 막혔는데 API 로는 통하거나(그 반대), 같은 상황을 다른 말로 설명하게 된다.
 *
 * (서버·클라이언트 공용 순수 모듈 — server-only import 금지)
 */

import { DOCUMENT_STATUS_LABELS, type DocumentStatus } from "./constants";

/** 잠금 판정에 필요한 문서의 최소 모양 */
export type EditLockInput = {
  status: string;
  isConfirmed: boolean;
};

export type DocumentEditLock = {
  locked: boolean;
  /** 왜 잠겼는지 — 배너·에러 응답이 같은 말을 쓴다. 잠기지 않았으면 빈 문자열 */
  reason: string;
};

/** 초안(DRAFT)만 자유롭게 고친다 — 나머지는 이미 바깥에 나갔거나 확정된 상태다 */
const EDITABLE_STATUSES: readonly string[] = ["DRAFT"];

function statusLabel(status: string): string {
  return DOCUMENT_STATUS_LABELS[status as DocumentStatus] ?? status;
}

/**
 * 이 문서를 지금 고칠 수 있는지 판정한다.
 *
 * **확정본을 상태보다 먼저 본다** — 초안이어도 확정본으로 지정했다면 그것을 기준으로
 * 삼기로 한 문서이므로 함부로 바뀌면 안 된다.
 */
export function documentEditLock(input: EditLockInput): DocumentEditLock {
  if (input.isConfirmed) {
    return {
      locked: true,
      reason:
        "확정본으로 지정된 문서입니다. 내용을 고치려면 새 버전을 만들어 주세요.",
    };
  }
  if (!EDITABLE_STATUSES.includes(input.status)) {
    return {
      locked: true,
      reason: `${statusLabel(input.status)} 상태의 문서입니다. 내용을 고치려면 새 버전을 만들어 주세요.`,
    };
  }
  return { locked: false, reason: "" };
}

/**
 * 잠긴 문서에 대해 **본문을 바꾸려는 요청**인지 판정한다.
 *
 * 상태·확정본·폴더 변경은 막지 않는다 — 발송 라우트가 상태를 SENT 로 올리고,
 * 확정본 해제가 잠금을 푸는 유일한 길이며, 폴더 이동은 내용을 바꾸지 않는다.
 * 여기서 상태 변경까지 막으면 문서를 영영 잠긴 채로 둔다.
 */
export function isContentMutation(body: Record<string, unknown>): boolean {
  return (
    typeof body.contentJson === "string" ||
    typeof body.title === "string" ||
    Array.isArray(body.items) ||
    typeof body.amount === "number" ||
    typeof body.type === "string" ||
    typeof body.clientName === "string"
  );
}
