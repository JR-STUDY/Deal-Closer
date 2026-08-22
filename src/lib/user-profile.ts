/**
 * 담당자 개인 정보(User) 검증·정규화 — **순수 모듈** (설정 7).
 *
 * 회사 정보(`@/lib/branding`)와 나눠 둔 이유는 하나다 — 직함·연락처는 **사람마다 다르다**.
 * 조직 단위(Branding)에 두면 팀원이 늘 때 서로의 값을 덮어쓴다.
 *
 * 연락처는 담당자(Contact)와 **같은** `normalizePhone`·`isPhone` 을 쓴다 — 같은 전화번호가
 * 화면마다 다른 표기로 저장되면 번호로 찾을 방법이 사라진다.
 */

import { isPhone, normalizePhone } from "./contact";

export const PROFILE_NAME_MAX = 60;
export const PROFILE_POSITION_MAX = 60;
export const PROFILE_PHONE_MAX = 30;

/** 클라이언트·서버 공용 개인 정보 표현 (폼이 그대로 상태로 쓴다) */
export type ProfileFormValues = {
  name: string;
  position: string;
  phone: string;
};

export function toProfileFormValues(record: {
  name: string;
  position: string | null;
  phone: string | null;
}): ProfileFormValues {
  return {
    name: record.name,
    position: record.position ?? "",
    phone: record.phone ?? "",
  };
}

/** 검증을 통과한 개인 정보 (선택 항목은 빈 값이면 null) */
export type ProfileInput = {
  name: string;
  position: string | null;
  phone: string | null;
};

/**
 * API 요청 본문을 검증·정규화한다 (PATCH /api/profile).
 * 이름만 필수다 — 문서·발송 화면 곳곳에 표시되는 값이라 비워 둘 수 없다.
 */
export function parseProfileInput(
  body: Record<string, unknown>,
): { error: string } | ProfileInput {
  const read = (key: string) =>
    typeof body[key] === "string" ? (body[key] as string).trim() : "";

  const name = read("name");
  if (!name) return { error: "이름을 입력해주세요." };
  if (name.length > PROFILE_NAME_MAX) {
    return { error: `이름은 ${PROFILE_NAME_MAX}자 이내여야 합니다.` };
  }

  const position = read("position");
  if (position.length > PROFILE_POSITION_MAX) {
    return { error: `직함은 ${PROFILE_POSITION_MAX}자 이내여야 합니다.` };
  }

  const phone = normalizePhone(read("phone"));
  if (phone) {
    if (phone.length > PROFILE_PHONE_MAX) {
      return { error: `연락처는 ${PROFILE_PHONE_MAX}자 이내여야 합니다.` };
    }
    if (!isPhone(phone)) {
      return { error: "연락처는 010-1234-5678 형식으로 입력해주세요." };
    }
  }

  return { name, position: position || null, phone: phone || null };
}
