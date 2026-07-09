import { MAX_SIGNATURE_LENGTH } from "./constants";

/**
 * 서명 문자열이 HTML 형식인지(태그 포함) 판별한다.
 * 일반 텍스트 서명은 줄바꿈 그대로, HTML 서명은 렌더링해 보여주기 위한 분기.
 */
export function isHtmlSignature(value: string): boolean {
  return /<\/?[a-z][\s\S]*>/i.test(value);
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
