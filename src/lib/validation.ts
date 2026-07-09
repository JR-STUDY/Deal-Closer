/**
 * 입력 검증 유틸 (정책 VAL_*).
 * 이메일 형식 검사와 다중 수신자 파싱을 제공한다.
 */

// RFC 전수 검사는 과하므로, 실무적으로 충분한 수준의 이메일 형식만 확인한다.
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export function isEmail(value: string): boolean {
  return EMAIL_RE.test(value.trim());
}

export type ParsedRecipients = {
  /** 형식이 유효한 수신자 (중복 제거) */
  valid: string[];
  /** 형식이 올바르지 않은 토큰 */
  invalid: string[];
};

/**
 * 세미콜론·쉼표·공백·줄바꿈으로 구분된 수신자 문자열을 파싱해 유효/무효로 분류한다.
 * EmailLog.recipients 는 세미콜론(;) 구분 규약을 따르므로, 발송 시 valid 를 "; " 로 합치면 된다.
 */
export function parseRecipients(raw: string): ParsedRecipients {
  const tokens = raw
    .split(/[;,\s]+/)
    .map((token) => token.trim())
    .filter(Boolean);

  const valid: string[] = [];
  const invalid: string[] = [];
  const seen = new Set<string>();

  for (const token of tokens) {
    if (!isEmail(token)) {
      invalid.push(token);
      continue;
    }
    const key = token.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    valid.push(token);
  }

  return { valid, invalid };
}
