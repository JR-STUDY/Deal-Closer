/**
 * 회사 정보(Branding) 검증·정규화·DTO — **순수 모듈** (설정 7).
 *
 * 회사 정보는 문서의 **공급자** 자리에 그대로 박히는 값이다(상호·대표자·사업자등록번호·
 * 주소·대표 연락처·로고·인감). 그래서 개인 정보(`User.position`·`User.phone`)와 한 테이블에
 * 섞지 않는다 — 팀원이 늘면 서로의 직함으로 회사 대표 연락처를 덮어쓴다.
 *
 * **검증 규칙을 새로 만들지 않는다.** 사업자등록번호는 거래처와 같은
 * `@/lib/account` 의 `normalizeBizRegNo`·`isBizRegNo`, 연락처는 담당자와 같은
 * `@/lib/contact` 의 `normalizePhone`·`isPhone` 을 쓴다 — 같은 값이 화면마다 다르게
 * 취급되면 어느 표기가 맞는지 아무도 모른다.
 *
 * `server-only` 를 import 하지 않으므로 폼(클라이언트)·라우트(서버)가 함께 쓴다.
 */

import { isBizRegNo, normalizeBizRegNo } from "./account";
import { isPhone, normalizePhone } from "./contact";

export const COMPANY_NAME_MAX = 100;
export const CEO_NAME_MAX = 60;
export const COMPANY_ADDRESS_MAX = 200;
export const COMPANY_PHONE_MAX = 30;

/** 기본 색상 기본값 (prisma/schema.prisma 의 `Branding.primaryColor` 와 같은 값) */
export const DEFAULT_PRIMARY_COLOR = "#4F46E5";

/**
 * 로고·인감 이미지의 크기 상한 (1MB).
 *
 * 별도 파일 저장소가 없어 이미지는 **dataUrl 로 컬럼에 그대로** 들어간다(에디터 이미지
 * 블록과 같은 방식). 그래서 상한이 곧 DB 행 크기의 상한이다 — 로고·인감 수준의 그림에
 * 1MB 면 충분하고, 넘는 파일은 서버가 거절한다.
 * **화면에서만 막은 것은 막은 것이 아니다** — 폼도 재고 라우트도 다시 잰다.
 */
export const MAX_BRANDING_IMAGE_BYTES = 1024 * 1024;

const HEX_COLOR_RE = /^#[0-9a-fA-F]{6}$/;

/** 클라이언트·서버 공용 회사 정보 표현 (폼이 그대로 상태로 쓴다) */
export type BrandingFormValues = {
  companyName: string;
  ceoName: string;
  bizRegNo: string;
  address: string;
  phone: string;
  logoUrl: string;
  stampUrl: string;
  primaryColor: string;
};

export const EMPTY_BRANDING_FORM: BrandingFormValues = {
  companyName: "",
  ceoName: "",
  bizRegNo: "",
  address: "",
  phone: "",
  logoUrl: "",
  stampUrl: "",
  primaryColor: DEFAULT_PRIMARY_COLOR,
};

/** Prisma 레코드(또는 없음) → 폼 초기값. null 은 빈 문자열로 눕힌다 */
export function toBrandingFormValues(
  record: {
    companyName: string | null;
    ceoName: string | null;
    bizRegNo: string | null;
    address: string | null;
    phone: string | null;
    logoUrl: string | null;
    stampUrl: string | null;
    primaryColor: string;
  } | null,
  fallbackCompanyName = "",
): BrandingFormValues {
  if (!record) {
    return { ...EMPTY_BRANDING_FORM, companyName: fallbackCompanyName };
  }
  return {
    companyName: record.companyName ?? fallbackCompanyName,
    ceoName: record.ceoName ?? "",
    bizRegNo: record.bizRegNo ?? "",
    address: record.address ?? "",
    phone: record.phone ?? "",
    logoUrl: record.logoUrl ?? "",
    stampUrl: record.stampUrl ?? "",
    primaryColor: record.primaryColor || DEFAULT_PRIMARY_COLOR,
  };
}

/** 검증을 통과한 회사 정보 (빈 값은 null — 컬럼이 모두 optional 이다) */
export type BrandingInput = {
  companyName: string | null;
  ceoName: string | null;
  bizRegNo: string | null;
  address: string | null;
  phone: string | null;
  logoUrl: string | null;
  stampUrl: string | null;
  primaryColor: string;
};

function readString(body: Record<string, unknown>, key: string): string {
  const raw = body[key];
  return typeof raw === "string" ? raw.trim() : "";
}

function tooLong(label: string, value: string, max: number): string | null {
  return value.length > max ? `${label}은(는) ${max}자 이내여야 합니다.` : null;
}

/**
 * 이미지 값 검증 — `data:image/...` 또는 `http(s)` 주소만 받는다.
 *
 * dataUrl 의 실제 크기는 base64 길이에서 되짚는다(4글자 → 3바이트). 문자열 길이를 그대로
 * 재면 33% 더 크게 잡혀, 상한 바로 아래의 정상 파일이 거절된다.
 */
export function brandingImageError(label: string, value: string): string | null {
  if (!value) return null;
  if (/^https?:\/\//i.test(value)) return null;
  if (!value.startsWith("data:image/")) {
    return `${label} 이미지는 파일을 선택해 올려주세요.`;
  }
  const base64 = value.slice(value.indexOf(",") + 1);
  const bytes = Math.floor((base64.length * 3) / 4);
  if (bytes > MAX_BRANDING_IMAGE_BYTES) {
    const mb = Math.round(MAX_BRANDING_IMAGE_BYTES / (1024 * 1024));
    return `${label} 이미지가 너무 큽니다. ${mb}MB 이하 파일을 사용해주세요.`;
  }
  return null;
}

/**
 * API 요청 본문을 검증·정규화한다 (PATCH /api/branding).
 *
 * 모든 항목이 **선택 입력**이다 — 회사 정보를 아직 채우지 않은 조직도 문서를 만들 수 있어야
 * 한다. 대신 적어 넣은 값의 형식은 거래처·담당자와 **같은 기준**으로 본다.
 * 실패 시 사용자용 한국어 메시지를 담은 `{ error }` 를 반환한다.
 */
export function parseBrandingInput(
  body: Record<string, unknown>,
): { error: string } | BrandingInput {
  const companyName = readString(body, "companyName");
  const ceoName = readString(body, "ceoName");
  const address = readString(body, "address");
  const logoUrl = readString(body, "logoUrl");
  const stampUrl = readString(body, "stampUrl");

  const lengthError =
    tooLong("회사명", companyName, COMPANY_NAME_MAX) ??
    tooLong("대표자명", ceoName, CEO_NAME_MAX) ??
    tooLong("회사 주소", address, COMPANY_ADDRESS_MAX);
  if (lengthError) return { error: lengthError };

  // 사업자등록번호·연락처는 **저장 시 정규화**한다 (거래처·담당자와 같은 선례)
  const bizRegNo = normalizeBizRegNo(readString(body, "bizRegNo"));
  if (bizRegNo && !isBizRegNo(bizRegNo)) {
    return { error: "사업자등록번호는 000-00-00000 형식으로 입력해주세요." };
  }

  const phone = normalizePhone(readString(body, "phone"));
  if (phone) {
    const lengthIssue = tooLong("대표 연락처", phone, COMPANY_PHONE_MAX);
    if (lengthIssue) return { error: lengthIssue };
    if (!isPhone(phone)) {
      return { error: "대표 연락처는 010-1234-5678 형식으로 입력해주세요." };
    }
  }

  const imageError =
    brandingImageError("로고", logoUrl) ?? brandingImageError("인감", stampUrl);
  if (imageError) return { error: imageError };

  const rawColor = readString(body, "primaryColor");
  const primaryColor = rawColor || DEFAULT_PRIMARY_COLOR;
  if (!HEX_COLOR_RE.test(primaryColor)) {
    return { error: "기본 색상은 #RRGGBB 형식으로 입력해주세요." };
  }

  return {
    companyName: companyName || null,
    ceoName: ceoName || null,
    bizRegNo: bizRegNo || null,
    address: address || null,
    phone: phone || null,
    logoUrl: logoUrl || null,
    stampUrl: stampUrl || null,
    primaryColor,
  };
}
