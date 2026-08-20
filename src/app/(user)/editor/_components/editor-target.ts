import type { AiModelOption } from "@/lib/ai/models";
import type { DocumentEditLock } from "@/lib/document-edit";

/**
 * 에디터가 **무엇을** 편집하는지.
 *
 * 문서와 표준 양식은 같은 블록 캔버스 문서(`contentJson`)를 다루지만 주변 기능이 다르다 —
 * 양식에는 상태·버전·확정본·발송·금액이 없다. 에디터를 두 벌 만들면 캔버스·되돌리기·정렬 같은
 * 본체가 갈라지므로(고칠 때마다 두 곳을 손대야 한다) **다른 점만** 이 타입으로 넘긴다.
 *
 * 선택적 필드로 두지 않고 판별 유니온으로 쓰는 이유: "양식에는 상태가 없다"는 것은
 * 빠뜨린 값이 아니라 사실이다. 유니온이면 양식 분기에서 상태를 읽는 코드가 컴파일되지 않는다.
 */
export type EditorTarget =
  | {
      kind: "document";
      documentId: string;
      /** 발송·계약완료·폐기·확정본 판정 결과 (서버 PATCH 와 같은 순수 함수) */
      lock: DocumentEditLock;
      initialStatus: string;
      /** 저장된 Document.amount — 저장으로 금액이 0 이 되는지 판단하는 기준 */
      initialAmount: number;
      version: number;
      isConfirmed: boolean;
      /** AI 부분 재작성용 */
      models: AiModelOption[];
      defaultModel: string;
      mockProvider: boolean;
    }
  | { kind: "template"; templateId: string };

/** 저장 대상 API */
export function targetEndpoint(target: EditorTarget): string {
  return target.kind === "document"
    ? `/api/documents/${target.documentId}`
    : `/api/templates/${target.templateId}`;
}

/**
 * 제목이 저장되는 필드 이름.
 * 문서는 `title`, 양식은 `name` 이다 (Prisma 모델이 그렇게 다르다).
 */
export function targetTitleField(target: EditorTarget): "title" | "name" {
  return target.kind === "document" ? "title" : "name";
}

/**
 * 양식은 잠기지 않는다 — 발송·계약완료 같은 상태가 없다.
 * 잠금 판정을 여기서 한 번에 내려 본체가 `kind` 를 다시 살피지 않게 한다.
 */
export function targetLock(target: EditorTarget): DocumentEditLock {
  return target.kind === "document"
    ? target.lock
    : { locked: false, reason: "" };
}
