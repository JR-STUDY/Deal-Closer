/**
 * 문서 생성 화면이 서버 컴포넌트에서 받는 선택지 타입.
 *
 * 폼과 하위 피커들이 함께 쓰므로 별도 모듈로 둔다 (서로 import 하다 순환하지 않게).
 * 모두 직렬화 가능한 값만 담는다 — 클라이언트 컴포넌트로 넘어간다.
 */

/** 불러올 수 있는 표준 양식 (F-211) */
export type TemplateChoice = {
  id: string;
  name: string;
  type: string;
  scope: string;
  variables: {
    key: string;
    label: string;
    sample: string | null;
    required: boolean;
  }[];
};

/** 계약서의 소스로 고를 수 있는 확정 견적서 (F-213) */
export type ConfirmedQuote = {
  id: string;
  title: string;
  clientName: string | null;
  amount: number;
  version: number;
};

/** 문서를 붙일 수 있는 영업 기회 (F-212) */
export type OpportunityChoice = {
  id: string;
  name: string;
  stage: string;
  expectedAmount: number;
  accountName: string;
};

/** 생성 플로우 — 새로 작성 / 표준 양식으로 */
export type GenerateMode = "blank" | "template";

/** 끌어다 놓은 폴더 (내용은 읽지 않고 이름만 보관 — 데모 일괄 변환 트리거용) */
export type FolderAttach = { name: string; fileNames: string[] };

/** 바이트 크기를 사람이 읽는 형태로 */
export function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes}B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)}KB`;
  return `${(bytes / 1024 / 1024).toFixed(1)}MB`;
}
