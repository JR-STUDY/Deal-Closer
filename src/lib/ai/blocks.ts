/**
 * 프로바이더 중립 메시지 블록 (서버 전용).
 *
 * Claude(Messages API)와 GPT(Responses API)는 content 블록 형식이 서로 다르다.
 * 프롬프트 조립부(prompts.ts · content.ts)는 이 중립 형태만 만들고,
 * 실제 요청 형식으로의 변환은 providers/ 아래 어댑터가 담당한다.
 * → 프로바이더를 추가·교체할 때 프롬프트 코드를 건드리지 않는다.
 */

import "server-only";

/** 두 프로바이더가 공통으로 받는 이미지 형식 */
export type ImageMediaType =
  | "image/png"
  | "image/jpeg"
  | "image/gif"
  | "image/webp";

export type AiContentBlock =
  | { type: "text"; text: string }
  | { type: "image"; mediaType: ImageMediaType; dataBase64: string }
  | { type: "pdf"; fileName: string; dataBase64: string };

/** 텍스트 블록 헬퍼 (조립부에서 가장 많이 쓴다) */
export function text(value: string): AiContentBlock {
  return { type: "text", text: value };
}

/** data: URL — GPT(Responses API)는 base64 를 data URL 로 받는다 */
export function dataUrl(mimeType: string, dataBase64: string): string {
  return `data:${mimeType};base64,${dataBase64}`;
}
