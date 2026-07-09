import { MAX_SIGNATURE_LENGTH } from "./constants";

/**
 * 서명이 HTML 형식인지 판별한다 (일반 텍스트는 줄바꿈 그대로, HTML은 렌더).
 * 닫는 태그(`</...>`) 또는 서명에 흔히 쓰이는 태그가 있을 때만 HTML로 본다.
 * 이렇게 해야 `홍길동 <hong@company.com>` 같은 흔한 텍스트 서명을 HTML 로 오판하지 않는다.
 */
const HTML_TAG_PATTERN =
  /<\/[a-z][a-z0-9]*\s*>|<(?:table|tr|td|th|thead|tbody|div|span|p|br|hr|img|a|font|style|ul|ol|li|b|i|u|strong|em|h[1-6])\b[^>]*>/i;

export function isHtmlSignature(value: string): boolean {
  return HTML_TAG_PATTERN.test(value);
}

/**
 * HTML 조각을 미리보기·편집용 최소 문서로 감싼다.
 * 앱 CSS 와 격리하고 body 여백을 정리한다. 이미 완전한 문서면 그대로 둔다.
 */
export function signatureSrcDoc(html: string): string {
  const trimmed = html.trimStart();
  if (/^<!doctype|^<html/i.test(trimmed)) return html;
  return `<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width"><style>html,body{margin:0;padding:8px;background:#fff;font-family:'Malgun Gothic','Apple SD Gothic Neo','Noto Sans KR',Arial,sans-serif;}</style></head><body>${html}</body></html>`;
}

/**
 * PATCH /api/signature 본문 검증·정규화 (텍스트/HTML 공용).
 * - 잘못된 형식(문자열 아님·null 등)이면 사용자용 메시지를 담은 `{ error }` 반환
 * - 빈 값은 null(서명 없음)로 정규화
 */
export function parseSignatureInput(
  body: unknown,
): { signature: string | null } | { error: string } {
  if (typeof body !== "object" || body === null || !("signature" in body)) {
    return { error: "잘못된 요청 본문입니다." };
  }
  const raw = (body as Record<string, unknown>).signature;
  if (typeof raw !== "string") {
    return { error: "서명 형식이 올바르지 않습니다." };
  }
  const trimmed = raw.trim();
  if (trimmed.length > MAX_SIGNATURE_LENGTH) {
    return { error: `서명은 ${MAX_SIGNATURE_LENGTH}자 이내여야 합니다.` };
  }
  return { signature: trimmed ? trimmed : null };
}
