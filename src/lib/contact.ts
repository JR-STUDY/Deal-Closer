/**
 * 거래처 담당자(Contact) — 검증·DTO·**대표 담당자 규칙** (거래처-8).
 * server-only 을 import 하지 않으므로 API 라우트·서버 컴포넌트·클라이언트 폼에서 모두 쓴다.
 *
 * 대표 담당자는 거래처당 최대 1명이지만 DB 제약으로 막을 수 없다
 * (`@@unique([accountId, isPrimary])` 는 "비대표도 1명뿐"이 되고, SQLite 의 부분 유니크
 * 인덱스는 Prisma 스키마로 표현되지 않는다). 그래서 **규칙은 이 파일의 순수 함수가 단일 기준**이고,
 * 저장은 한 트랜잭션이다 — 판정이 흩어지면 화면 안내와 실제 저장 결과가 어긋난다.
 *
 * 이 파일이 지키는 불변식: **담당자가 1명 이상이면 대표는 정확히 1명이다.**
 *  - 첫 담당자는 요청과 무관하게 대표가 된다 (하나뿐인데 대표가 아니면 목록에서 사라진다)
 *  - 대표는 스스로 내려올 수 없다 (다른 담당자를 대표로 올려야 바뀐다 → 대표 0명이 생기지 않는다)
 *  - 대표를 지우면 남은 담당자 중 가장 먼저 만들어진 사람이 올라간다
 *  - 담당자 0명은 허용한다 (거래처를 먼저 등록하고 담당자를 나중에 넣는 흐름)
 */

import { isEmail } from "./validation";

// ── 저장 제약 (정책 VAL_*) ──
export const CONTACT_NAME_MAX = 60;
export const CONTACT_POSITION_MAX = 60;
export const CONTACT_PHONE_MAX = 30;
export const CONTACT_EMAIL_MAX = 200;

/** 클라이언트·서버 공용 담당자 표현 (날짜는 직렬화 안전한 ISO 문자열) */
export type ContactDTO = {
  id: string;
  accountId: string;
  name: string;
  position: string | null;
  phone: string | null;
  email: string | null;
  isPrimary: boolean;
  createdAt: string;
  updatedAt: string;
};

/** 생성·수정 폼의 편집 값 (선택 항목은 빈 문자열로 다룬다) */
export type ContactFormValues = {
  name: string;
  position: string;
  phone: string;
  email: string;
  isPrimary: boolean;
};

/** 빈 폼 초기값 */
export const EMPTY_CONTACT_FORM: ContactFormValues = {
  name: "",
  position: "",
  phone: "",
  email: "",
  isPrimary: false,
};

/** Prisma 레코드(부분) → DTO */
export function toContactDTO(record: {
  id: string;
  accountId: string;
  name: string;
  position: string | null;
  phone: string | null;
  email: string | null;
  isPrimary: boolean;
  createdAt: Date;
  updatedAt: Date;
}): ContactDTO {
  return {
    id: record.id,
    accountId: record.accountId,
    name: record.name,
    position: record.position,
    phone: record.phone,
    email: record.email,
    isPrimary: record.isPrimary,
    createdAt: record.createdAt.toISOString(),
    updatedAt: record.updatedAt.toISOString(),
  };
}

/** DTO → 폼 값 (null 은 빈 문자열로) */
export function toContactFormValues(contact: ContactDTO): ContactFormValues {
  return {
    name: contact.name,
    position: contact.position ?? "",
    phone: contact.phone ?? "",
    email: contact.email ?? "",
    isPrimary: contact.isPrimary,
  };
}

/** 검증을 통과한 담당자 입력값 (선택 항목은 빈 값이면 null) */
export type ContactInput = {
  name: string;
  position: string | null;
  phone: string | null;
  email: string | null;
  /** 사용자가 "대표로 지정"을 요청했는지. 실제 반영 여부는 아래 resolve* 가 정한다 */
  isPrimary: boolean;
};

/** 길이 초과 검사 — 통과하면 null, 아니면 사용자용 메시지 */
function tooLong(label: string, value: string, max: number): string | null {
  return value.length > max ? `${label}은(는) ${max}자 이내여야 합니다.` : null;
}

/**
 * API 요청 본문을 검증·정규화한다 (POST · PATCH 공용).
 * 담당자명만 필수이고 나머지는 선택이다 (Contact 모델의 optional 정의와 일치).
 * 실패 시 사용자용 한국어 메시지를 담은 `{ error }` 를 반환한다.
 */
export function parseContactInput(
  body: Record<string, unknown>,
): ContactInput | { error: string } {
  const text = (key: "name" | "position" | "phone" | "email") =>
    typeof body[key] === "string" ? (body[key] as string).trim() : "";

  const name = text("name");
  const position = text("position");
  const phone = text("phone");
  const email = text("email");

  if (!name) return { error: "담당자명을 입력해주세요." };

  const lengthError =
    tooLong("담당자명", name, CONTACT_NAME_MAX) ??
    tooLong("직책", position, CONTACT_POSITION_MAX) ??
    tooLong("핸드폰 번호", phone, CONTACT_PHONE_MAX) ??
    tooLong("담당자 이메일", email, CONTACT_EMAIL_MAX);
  if (lengthError) return { error: lengthError };

  // 이메일은 빈 값을 허용하고, 값이 있을 때만 형식을 본다 (정책 VAL_*)
  if (email && !isEmail(email)) {
    return { error: "담당자 이메일 형식이 올바르지 않습니다." };
  }

  return {
    name,
    position: position || null,
    phone: phone || null,
    email: email || null,
    isPrimary: body.isPrimary === true,
  };
}

// ─────────────────────── 대표 담당자 규칙 (순수 함수) ───────────────────────

/**
 * 대표 규칙 판정에 필요한 최소 정보. DTO(ISO 문자열)와 Prisma 레코드(Date) 어느 쪽이든 받는다 —
 * 서버 라우트와 클라이언트 화면이 같은 함수를 쓰려면 날짜 표현에 얽매이지 않아야 한다.
 */
export type ContactOrderRef = {
  id: string;
  isPrimary: boolean;
  createdAt: string | Date;
};

/** 정렬용 시각. 읽을 수 없는 값은 0으로 떨어뜨리고 id 로 순서를 확정한다(결정론 유지) */
function createdTime(value: string | Date): number {
  const time = value instanceof Date ? value.getTime() : Date.parse(value);
  return Number.isNaN(time) ? 0 : time;
}

/**
 * 표시 순서 — 대표가 맨 앞, 그다음 만들어진 순.
 * 같은 시각에 만들어진 담당자(시드·일괄 등록)는 id 로 갈라 순서가 매번 바뀌지 않게 한다.
 */
export function compareContacts(
  a: ContactOrderRef,
  b: ContactOrderRef,
): number {
  if (a.isPrimary !== b.isPrimary) return a.isPrimary ? -1 : 1;
  const diff = createdTime(a.createdAt) - createdTime(b.createdAt);
  if (diff !== 0) return diff;
  return a.id < b.id ? -1 : a.id > b.id ? 1 : 0;
}

/** 원본을 건드리지 않고 표시 순서로 정렬한다 */
export function sortContacts<T extends ContactOrderRef>(
  contacts: readonly T[],
): T[] {
  return [...contacts].sort(compareContacts);
}

/**
 * 목록·요약이 쓰는 대표 담당자 1명. 없으면 null (담당자 0명을 허용하므로 정상 상태다).
 * 어긋난 데이터로 대표가 여럿이면 가장 먼저 만들어진 한 명만 대표로 본다 —
 * 화면이 상황에 따라 다른 이름을 보여주는 것보다 낫다.
 */
export function primaryContact<T extends ContactOrderRef>(
  contacts: readonly T[],
): T | null {
  const flagged = contacts.filter((contact) => contact.isPrimary);
  if (flagged.length === 0) return null;
  return sortContacts(flagged)[0];
}

/**
 * 생성 시 대표 여부. **첫 담당자는 요청과 무관하게 대표**가 된다 —
 * 담당자가 하나뿐인데 대표가 아니면 목록의 담당자 칸이 비어 그 거래처만 담당자가 없어 보인다.
 */
export function resolveCreateIsPrimary(
  existingCount: number,
  requested: boolean,
): boolean {
  return existingCount === 0 ? true : requested;
}

/**
 * 수정 시 대표 여부. **이미 대표면 스스로 내려올 수 없다** —
 * 내려올 수 있게 두면 담당자가 있는데 대표는 0명인 상태가 만들어져 목록에서 사라진다.
 * 대표를 바꾸려면 다른 담당자를 대표로 올린다(그때 이 사람이 자동으로 내려간다).
 */
export function resolveUpdateIsPrimary(
  wasPrimary: boolean,
  requested: boolean,
): boolean {
  return wasPrimary ? true : requested;
}

/**
 * 새 대표를 세울 때 **내려야 할 기존 대표들의 id**.
 * 보통 0~1명이지만, 데이터가 어긋나 여러 명이어도 이 한 번으로 전부 정리된다.
 * 생성 시에는 아직 목록에 없는 id 를 넘기면 되고(현재 대표 전원이 대상이 된다),
 * 반환값이 비어 있으면 해제할 대상이 없다는 뜻이다.
 */
export function demotionTargetIds(
  contacts: readonly ContactOrderRef[],
  nextPrimaryId: string,
): string[] {
  return contacts
    .filter((contact) => contact.isPrimary && contact.id !== nextPrimaryId)
    .map((contact) => contact.id);
}

/**
 * 삭제 후 승격 대상. **대표를 지웠을 때만** 남은 담당자 중 가장 먼저 만들어진 사람을 올린다.
 * 삭제 한 번으로 목록에서 그 거래처의 담당자가 통째로 사라지는 편이 더 나쁘기 때문이다.
 * 남은 사람이 없으면 null 이다 — 담당자 0명은 허용한다.
 */
export function resolveDeletion<T extends ContactOrderRef>(
  contacts: readonly T[],
  deletedId: string,
): { deleted: T | null; remaining: T[]; promoted: T | null } {
  const deleted = contacts.find((contact) => contact.id === deletedId) ?? null;
  const remaining = contacts.filter((contact) => contact.id !== deletedId);
  if (!deleted || !deleted.isPrimary || remaining.length === 0) {
    return { deleted, remaining, promoted: null };
  }
  // 남은 사람 중 이미 대표인 사람이 있으면 그를 유지한다(어긋난 데이터 대비)
  const promoted = primaryContact(remaining) ?? sortContacts(remaining)[0];
  return { deleted, remaining, promoted };
}
