import type { MailDomainStatus } from "./constants";

/**
 * 팀 발신 메일 도메인 도메인 로직.
 * - 관리자는 조직 단위로 도메인을 등록/인증(TeamMailDomain)한다.
 * - 담당자는 인증된(VERIFIED) 도메인을 골라 개인 계정 대신 "<핸들>@<도메인>" 으로 발신한다.
 * - 서버·클라이언트 양쪽에서 쓰므로 순수 함수만 둔다("server-only" 금지).
 */

/** 도메인 표시/저장용 최대 길이 (RFC 상 253, 여유 두고 제한) */
export const DOMAIN_MAX_LENGTH = 253;
/** 별칭(label) 최대 길이 */
export const MAIL_DOMAIN_LABEL_MAX = 60;

/** 유효한 도메인 호스트명 형식 (레이블 1~63자, TLD 2자 이상) */
const DOMAIN_PATTERN =
  /^(?=.{1,253}$)([a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z]{2,}$/;

/**
 * 입력 도메인을 정규화한다. 앞의 `@`·`mailto:`·공백을 제거하고 소문자로 바꾼다.
 * (사용자가 "@specflow.ai" 나 "hong@specflow.ai" 처럼 붙여넣는 경우 대비)
 */
export function normalizeDomain(input: string): string {
  let value = input.trim().toLowerCase();
  value = value.replace(/^mailto:/, "");
  // 이메일 형태로 붙여넣으면 @ 뒤만 취한다
  const at = value.lastIndexOf("@");
  if (at >= 0) value = value.slice(at + 1);
  return value.replace(/\/+$/, "");
}

/** 정규화된 문자열이 유효한 도메인인지 검사 */
export function isValidDomain(value: string): boolean {
  return value.length <= DOMAIN_MAX_LENGTH && DOMAIN_PATTERN.test(value);
}

/** 이메일에서 로컬파트(@ 앞)를 추출한다. @ 가 없으면 전체를 반환. */
export function emailLocalPart(email: string): string {
  const at = email.indexOf("@");
  return at > 0 ? email.slice(0, at) : email;
}

/** 담당자 이메일 핸들 + 팀 도메인 → 팀 발신 주소 (예: kildong.hong@specflow.ai) */
export function teamAddress(userEmail: string, domain: string): string {
  return `${emailLocalPart(userEmail)}@${domain}`;
}

/** 관리자 콘솔·API 응답용 DTO */
export type TeamMailDomainDTO = {
  id: string;
  domain: string;
  label: string | null;
  status: MailDomainStatus;
  isDefault: boolean;
};

export function toMailDomainDTO(row: {
  id: string;
  domain: string;
  label: string | null;
  status: string;
  isDefault: boolean;
}): TeamMailDomainDTO {
  return {
    id: row.id,
    domain: row.domain,
    label: row.label,
    status: row.status as MailDomainStatus,
    isDefault: row.isDefault,
  };
}

/** 발신 신원 종류 */
export type SendingIdentityKind = "team" | "personal" | "none";

/** 발신 주소가 있으면 kind 는 team/personal, 없으면 none (판별 유니온) */
export type SendingIdentity =
  | { email: string; kind: Exclude<SendingIdentityKind, "none"> }
  | { email: null; kind: "none" };

/**
 * 담당자의 발신 신원을 해석한다.
 * - 인증된 팀 도메인을 선택했으면 팀 주소로 발신한다.
 * - 아니면 개인 기본 연동 계정으로 발신한다.
 * - 둘 다 없으면 none.
 */
export function resolveSendingIdentity(input: {
  userEmail: string;
  selectedDomain: { domain: string; status: string } | null;
  personalEmail: string | null;
}): SendingIdentity {
  const { userEmail, selectedDomain, personalEmail } = input;
  if (selectedDomain && selectedDomain.status === "VERIFIED") {
    return { email: teamAddress(userEmail, selectedDomain.domain), kind: "team" };
  }
  if (personalEmail) {
    return { email: personalEmail, kind: "personal" };
  }
  return { email: null, kind: "none" };
}
