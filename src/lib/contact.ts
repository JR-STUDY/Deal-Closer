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

/** 연락처 표기 형식 — 화면 안내·placeholder·오류 문구에 함께 쓴다 */
export const CONTACT_PHONE_FORMAT = "010-1234-5678";

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

// ─────────────────────── 연락처 정규화·검증 (순수 함수) ───────────────────────

/**
 * 국내 표기(0으로 시작하는 숫자열)로 맞춘다.
 * 국가번호(+82 · 0082 · 82)는 떼고 국내 표기의 앞자리 0 을 되살린다 —
 * 명함에서 옮겨 적은 `+82 10-1234-5678` 과 손으로 친 `010-1234-5678` 이
 * 같은 사람의 같은 번호인데 목록에서 다르게 보이면 곤란하다.
 * 대표번호(15xx·16xx·18xx)는 0 으로 시작하지 않으므로 그대로 둔다.
 */
function toLocalPhoneDigits(raw: string): string {
  const digits = raw.replace(/\D/g, "");
  const stripped = digits.startsWith("0082")
    ? digits.slice(4)
    : digits.startsWith("82")
      ? digits.slice(2)
      : null;
  if (stripped === null) return digits;
  // 8자리 1xxx-xxxx 는 대표번호라 앞에 0 을 붙이면 안 된다
  if (stripped.startsWith("0")) return stripped;
  if (stripped.length === 8 && stripped.startsWith("1")) return stripped;
  return `0${stripped}`;
}

/**
 * 연락처를 하이픈 표기로 정규화한다 (사업자등록번호 `normalizeBizRegNo` 와 같은 선례).
 *
 * **저장 시 정규화한다** — 같은 번호가 `01012345678` · `010 1234 5678` ·
 * `+82-10-1234-5678` 로 제각각 저장되면 목록·상세의 표기가 입력 방식에 따라 갈리고,
 * 나중에 번호로 찾거나 중복을 가려낼 방법도 사라진다. 표기를 하나로 모으는 비용은
 * 이 함수 하나뿐이고, 되돌릴 필요도 없다(사람이 읽는 값이라 원본 보존의 이득이 없다).
 *
 * 입력은 너그럽게 받는다 — 하이픈·공백·괄호·점 구분, 국가번호, 대표번호를 모두 받는다.
 * 정규화할 수 없는 값(해외 번호·내선 포함 등)은 **원본을 그대로 돌려주고**,
 * 형식 판정은 `isPhone` 이 맡는다.
 */
export function normalizePhone(raw: string): string {
  const trimmed = raw.trim();
  if (!trimmed) return "";

  const digits = toLocalPhoneDigits(trimmed);

  // 대표번호 15xx-xxxx · 16xx-xxxx · 18xx-xxxx
  if (/^1\d{7}$/.test(digits)) {
    return `${digits.slice(0, 4)}-${digits.slice(4)}`;
  }
  if (!digits.startsWith("0")) return trimmed;

  // 지역·서비스 식별번호 길이: 서울 02 는 2자리, 안심번호 050X 는 4자리, 나머지는 3자리
  const areaLength = digits.startsWith("02")
    ? 2
    : /^050\d/.test(digits)
      ? 4
      : 3;
  const rest = digits.slice(areaLength);
  if (rest.length !== 7 && rest.length !== 8) return trimmed;

  const head = rest.slice(0, rest.length - 4);
  return `${digits.slice(0, areaLength)}-${head}-${rest.slice(-4)}`;
}

/** 국내 표기: 0XX(X)-XXX(X)-XXXX · 대표번호 1XXX-XXXX */
const PHONE_RE = /^(?:0\d{1,3}-\d{3,4}-\d{4}|1\d{3}-\d{4})$/;
/**
 * 해외 번호는 국내 규칙으로 재단하지 않는다. `+` 로 시작하면 국가번호를 명시한 것이므로
 * 숫자·공백·하이픈만으로 이루어졌는지만 본다 — 나라마다 자릿수가 달라 더 좁히면 오탐이 난다.
 */
const INTL_PHONE_RE = /^\+\d[\d -]{6,18}\d$/;

/** 연락처 형식 여부 (빈 값 허용 판단은 호출자가 한다. 정규화한 값을 넘긴다) */
export function isPhone(value: string): boolean {
  const trimmed = value.trim();
  return PHONE_RE.test(trimmed) || INTL_PHONE_RE.test(trimmed);
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
  const phone = normalizePhone(text("phone"));
  const email = text("email");

  if (!name) return { error: "담당자명을 입력해주세요." };

  const lengthError =
    tooLong("담당자명", name, CONTACT_NAME_MAX) ??
    tooLong("직책", position, CONTACT_POSITION_MAX) ??
    tooLong("연락처", phone, CONTACT_PHONE_MAX) ??
    tooLong("담당자 이메일", email, CONTACT_EMAIL_MAX);
  if (lengthError) return { error: lengthError };

  // 연락처·이메일은 빈 값을 허용하고, 값이 있을 때만 형식을 본다 (정책 VAL_*)
  if (phone && !isPhone(phone)) {
    return {
      error: `연락처는 ${CONTACT_PHONE_FORMAT} 형식으로 입력해주세요.`,
    };
  }
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

// ──────────────── 여러 명 한 번에 등록 (거래처 등록 팝업, 거래처-8) ────────────────

/** 네 칸이 모두 빈 행 — "추가"만 눌러 두고 채우지 않은 자리다. 저장 대상에서 뺀다 */
export function isBlankContactForm(values: ContactFormValues): boolean {
  return (
    !values.name.trim() &&
    !values.position.trim() &&
    !values.phone.trim() &&
    !values.email.trim()
  );
}

/**
 * 여러 명을 **한 번에 붙일 때**의 대표 여부. 새로 들어오는 사람 중 대표는 **최대 한 명**이다.
 *
 * `resolveCreateIsPrimary`(첫 담당자 자동 대표)를 배열로 늘린 것이다.
 *  - 기존 담당자가 없으면(`existingCount === 0`) 아무도 고르지 않아도 **첫 사람**이 대표가 된다
 *    — 하나뿐인데 대표가 아니면 거래처 목록의 담당자 칸이 빈다.
 *  - **이미 담당자가 있고 아무도 고르지 않았으면 새로 들어오는 사람 중 대표는 없다** —
 *    담당자를 덧붙였을 뿐인데 대표가 바뀌면 거래처 목록에 나오는 이름이 예고 없이 달라진다.
 *  - 여러 명을 골랐으면 **가장 앞의 한 명만** 남긴다 — 화면의 라디오는 하나만 고르게 하지만
 *    API 로는 여러 개가 들어올 수 있고, 그때 대표가 2명인 상태를 만들면 안 된다.
 *
 * 기존 대표를 내리는 일은 이 함수가 하지 않는다 — true 가 하나라도 있으면 저장하는 쪽이
 * `demotionTargetIds` 로 **같은 트랜잭션에서** 해제한다.
 */
export function resolveAppendIsPrimary(
  existingCount: number,
  requests: readonly { isPrimary: boolean }[],
): boolean[] {
  if (requests.length === 0) return [];
  const requested = requests.findIndex((one) => one.isPrimary);
  // 고른 사람이 없을 때: 기존 담당자가 있으면 아무도 대표가 아니다(-1 은 어느 행과도 안 맞는다)
  const primaryIndex =
    requested !== -1 ? requested : existingCount === 0 ? 0 : -1;
  return requests.map((_, index) => index === primaryIndex);
}

/**
 * 대표 플래그만 규칙에 맞게 바꾼 새 목록 (편집 중인 폼 행에 그대로 쓴다).
 * 행을 넣거나 지울 때마다 이 함수를 통과시키면 화면의 라디오와 서버의 판정이 어긋나지 않는다.
 */
export function withAppendPrimary<T extends { isPrimary: boolean }>(
  existingCount: number,
  rows: readonly T[],
): T[] {
  const flags = resolveAppendIsPrimary(existingCount, rows);
  return rows.map((row, index) => ({ ...row, isPrimary: flags[index] }));
}

/**
 * 거래처를 **새로 만들 때** 함께 오는 담당자들의 대표 여부. **정확히 한 명만 true** 다.
 * 새 거래처에는 담당자가 아직 없으므로 `resolveAppendIsPrimary` 의 `existingCount = 0` 이다.
 */
export function resolveBatchIsPrimary(
  requests: readonly { isPrimary: boolean }[],
): boolean[] {
  return resolveAppendIsPrimary(0, requests);
}

/**
 * 담당자 배열을 **검증만** 한다 (한 명씩은 `parseContactInput` 이 본다).
 * 어느 줄이 잘못됐는지 알려야 고칠 수 있으므로 메시지에 순번을 붙인다.
 *
 * `isPrimary` 는 **사용자가 고른 그대로** 남긴다 — 기존 담당자 수를 알아야 대표를 정할 수
 * 있고, 그 수는 저장 트랜잭션 안에서만 믿을 수 있기 때문이다(트랜잭션 밖에서 세면 그 사이에
 * 담당자가 늘거나 줄어 대표가 0명 또는 2명이 되는 순간이 생긴다). 검증은 요청을 받자마자,
 * 대표 판정은 `resolveAppendIsPrimary` 로 저장 직전에 — 이렇게 나누면 잘못된 입력은 트랜잭션을
 * 열기도 전에 되돌려보낼 수 있다.
 */
export function parseContactAdditions(
  value: unknown,
): ContactInput[] | { error: string } {
  if (value === undefined || value === null) return [];
  if (!Array.isArray(value)) {
    return { error: "담당자 목록 형식이 올바르지 않습니다." };
  }

  const parsed: ContactInput[] = [];
  for (const [index, row] of value.entries()) {
    if (typeof row !== "object" || row === null || Array.isArray(row)) {
      return { error: `담당자 ${index + 1}: 입력값을 확인해주세요.` };
    }
    const one = parseContactInput(row as Record<string, unknown>);
    if ("error" in one) return { error: `담당자 ${index + 1}: ${one.error}` };
    parsed.push(one);
  }
  return parsed;
}

/**
 * 거래처 **등록 시** 함께 보낸 담당자 배열을 검증하고 대표까지 확정한다.
 * 새 거래처에는 담당자가 아직 없으므로 대표는 이 함수가 정할 수 있다(정확히 1명).
 * 이미 있는 거래처에 덧붙일 때는 `parseContactAdditions` + `resolveAppendIsPrimary` 를 쓴다.
 */
export function parseContactInputs(
  value: unknown,
): ContactInput[] | { error: string } {
  const parsed = parseContactAdditions(value);
  if ("error" in parsed) return parsed;

  const flags = resolveBatchIsPrimary(parsed);
  return parsed.map((one, index) => ({ ...one, isPrimary: flags[index] }));
}
