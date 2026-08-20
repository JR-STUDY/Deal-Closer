/**
 * 거래처(Account) — 검증·정규화·DTO 헬퍼 (PRD F-101 · F-102 · F-103).
 * server-only 을 import 하지 않으므로 API 라우트·서버 컴포넌트·클라이언트 폼에서 모두 사용한다.
 *
 * 담당자는 이 모듈이 다루지 않는다 — 한 거래처에 여러 명이 붙으므로 별도 모델·모듈이다
 * (`src/lib/contact.ts`, 거래처-8). 이 파일은 회사 자체의 정보만 본다.
 */

import type { Prisma } from "@/generated/prisma/client";
import { OPPORTUNITY_PEEK_LIMIT } from "./constants";
import type { ContactDTO } from "./contact";

// ── 저장 제약 (정책 VAL_*) ──
export const ACCOUNT_COMPANY_NAME_MAX = 100;
export const ACCOUNT_BIZ_REG_NO_MAX = 20;
export const ACCOUNT_MEMO_MAX = 2000;

/** 사업자등록번호 표기 형식 — 화면 안내·placeholder 에 함께 쓴다 */
export const BIZ_REG_NO_FORMAT = "000-00-00000";

const BIZ_REG_NO_RE = /^\d{3}-\d{2}-\d{5}$/;

/**
 * 사업자등록번호를 `000-00-00000` 형태로 정규화한다.
 * 숫자만 10자리로 입력해도(예: 1234567890) 하이픈을 넣어 저장하므로
 * 목록·상세의 표기가 입력 방식에 따라 갈리지 않는다.
 * 정규화할 수 없는 값은 원본을 그대로 돌려주고, 형식 검증에서 걸러진다.
 */
export function normalizeBizRegNo(raw: string): string {
  const trimmed = raw.trim();
  const digits = trimmed.replace(/\D/g, "");
  if (digits.length !== 10) return trimmed;
  return `${digits.slice(0, 3)}-${digits.slice(3, 5)}-${digits.slice(5)}`;
}

/** `000-00-00000` 형식 여부 (빈 값 허용 판단은 호출자가 한다) */
export function isBizRegNo(value: string): boolean {
  return BIZ_REG_NO_RE.test(value.trim());
}

/** 클라이언트·서버 공용 거래처 표현 (날짜는 직렬화 안전한 ISO 문자열) */
export type AccountDTO = {
  id: string;
  companyName: string;
  bizRegNo: string | null;
  memo: string | null;
  createdAt: string;
  updatedAt: string;
};

/**
 * 목록 행 (F-102: 회사명 · 담당자 · 연락처 · 기회 수 · 최근 수정일).
 * 담당자는 **대표 1명만** 싣는다 (거래처-8). 총원은 "외 N명" 표기의 근거다.
 */
export type AccountListItem = AccountDTO & {
  /** 연관 영업 기회 수 */
  opportunityCount: number;
  /** 담당자 총원 (0명을 허용한다) */
  contactCount: number;
  /** 목록에 노출하는 대표 담당자. 담당자가 없으면 null */
  primaryContact: ContactDTO | null;
};

/** 생성·수정 폼의 편집 값 (선택 항목은 빈 문자열로 다룬다) */
export type AccountFormValues = {
  companyName: string;
  bizRegNo: string;
  memo: string;
};

/** 빈 폼 초기값 */
export const EMPTY_ACCOUNT_FORM: AccountFormValues = {
  companyName: "",
  bizRegNo: "",
  memo: "",
};

/** Prisma 레코드(부분) → DTO */
export function toAccountDTO(record: {
  id: string;
  companyName: string;
  bizRegNo: string | null;
  memo: string | null;
  createdAt: Date;
  updatedAt: Date;
}): AccountDTO {
  return {
    id: record.id,
    companyName: record.companyName,
    bizRegNo: record.bizRegNo,
    memo: record.memo,
    createdAt: record.createdAt.toISOString(),
    updatedAt: record.updatedAt.toISOString(),
  };
}

/** DTO → 폼 값 (null 은 빈 문자열로) */
export function toAccountFormValues(account: AccountDTO): AccountFormValues {
  return {
    companyName: account.companyName,
    bizRegNo: account.bizRegNo ?? "",
    memo: account.memo ?? "",
  };
}

/** 검증을 통과한 거래처 입력값 (선택 항목은 빈 값이면 null) */
export type AccountInput = {
  companyName: string;
  bizRegNo: string | null;
  memo: string | null;
};

/** 길이 초과 검사 — 통과하면 null, 아니면 사용자용 메시지 */
function tooLong(label: string, value: string, max: number): string | null {
  return value.length > max ? `${label}은(는) ${max}자 이내여야 합니다.` : null;
}

/**
 * API 요청 본문을 검증·정규화한다 (POST · PATCH 공용).
 * 회사명만 필수이고 나머지는 선택이다 (Account 모델의 optional 정의와 일치).
 * 실패 시 사용자용 한국어 메시지를 담은 `{ error }` 를 반환한다.
 */
export function parseAccountInput(
  body: Record<string, unknown>,
): AccountInput | { error: string } {
  const text = (key: keyof AccountFormValues) =>
    typeof body[key] === "string" ? (body[key] as string).trim() : "";

  const companyName = text("companyName");
  const memo = text("memo");
  const bizRegNo = normalizeBizRegNo(text("bizRegNo"));

  if (!companyName) return { error: "회사명을 입력해주세요." };

  const lengthError =
    tooLong("회사명", companyName, ACCOUNT_COMPANY_NAME_MAX) ??
    tooLong("메모", memo, ACCOUNT_MEMO_MAX);
  if (lengthError) return { error: lengthError };

  // 사업자등록번호는 빈 값을 허용하고, 값이 있을 때만 형식을 본다 (정책 VAL_*).
  if (bizRegNo && !isBizRegNo(bizRegNo)) {
    return {
      error: `사업자등록번호는 ${BIZ_REG_NO_FORMAT} 형식으로 입력해주세요.`,
    };
  }

  return {
    companyName,
    bizRegNo: bizRegNo || null,
    memo: memo || null,
  };
}

/**
 * 거래처 목록 조회의 Prisma where 조건 (F-102).
 * orgId 스코프는 항상 걸고, 검색어가 있으면 회사명·담당자명 부분 일치를 더한다.
 * 담당자는 별도 테이블이므로 **소속 담당자 중 한 명이라도** 이름이 걸리면 그 거래처가 나온다
 * (대표만 보는 것이 아니다 — "김대리가 있는 회사"를 찾는 것이 검색의 쓰임이다).
 * SQLite 의 LIKE 는 ASCII 대소문자를 구분하지 않으므로 `contains` 만으로 대소문자 무시가 된다.
 * 인가·검색 규칙을 한 곳에 모아 목록 API 와 페이지가 같은 조건을 쓰게 한다.
 */
export function accountsWhere(orgId: string, query: string) {
  const q = query.trim();
  if (!q) return { orgId };
  return {
    orgId,
    OR: [
      { companyName: { contains: q } },
      { contacts: { some: { name: { contains: q } } } },
    ],
  };
}

/**
 * 거래처 **목록 한 행**이 필요한 관계 데이터 (F-102 · 거래처-3).
 *
 * 조회는 페이지가 하고 표는 `_components/accounts-table` 이 그리는데, 둘이 같은 모양을
 * 봐야 해서 조회 모양을 여기 한 곳에 둔다(`OPPORTUNITY_DTO_SELECT` 와 같은 선례).
 * 표가 쓰는 필드를 빼면 이 상수에서 파생된 `AccountListRow` 타입이 곧바로 타입 오류를 낸다.
 */
export const ACCOUNT_LIST_INCLUDE = {
  _count: { select: { opportunities: true, contacts: true } },
  // 목록에 노출하는 담당자는 **대표 1명뿐**이다 (거래처-8).
  // 전원을 실어 오면 행마다 조회량이 담당자 수만큼 늘고, 보여줄 곳도 없다.
  contacts: { where: { isPrimary: true } },
  /**
   * 기회 칸 팝오버가 펼칠 **제목 몇 건** (5차 피드백 2).
   *
   * 건수만 필요할 때는 `_count` 로 충분했지만, 제목을 보여주려면 기회를 실제로 읽어야
   * 한다. **거래처마다 따로 조회하지 않는다** — 이 `include` 는 목록 조회에 딸린 관계
   * 로드라 Prisma 가 한 페이지분(거래처 10곳)을 **한 번의 질의**로 가져온다. 행을
   * 그리며 `prisma` 를 다시 부르는 것이 N+1 이고, 여기서는 그 길을 열지 않는다.
   *
   * `take` 로 **거래처당 상한을 DB 에서 건다** — 기회가 200건인 거래처 한 곳이 한
   * 화면의 조회량을 통째로 끌어올리지 못한다. 전체 건수는 위의 `_count` 가 이미 들고
   * 있으므로, 잘린 만큼은 팝오버가 "외 N건" 으로 알린다.
   *
   * 정렬은 **기회 목록의 기본 정렬과 같은 `updatedAt desc`** 다
   * (`DEFAULT_OPPORTUNITY_SORT`). 두 화면이 다른 순서를 주장하면 "이 거래처의 기회
   * 5건" 이 기회 목록에서 본 차례와 달라 같은 데이터로 읽히지 않는다. 최근에 손댄
   * 기회가 대체로 지금 들여다보는 기회이기도 하다. 같은 시각이 여럿일 때를 대비해
   * `id` 를 마지막 기준으로 붙인다(DB 는 동순위 순서를 보장하지 않는다).
   */
  opportunities: {
    orderBy: [{ updatedAt: "desc" }, { id: "asc" }],
    take: OPPORTUNITY_PEEK_LIMIT,
    select: { id: true, name: true, stage: true },
  },
} satisfies Prisma.AccountInclude;

/** 거래처 목록 한 행 — 페이지가 `ACCOUNT_LIST_INCLUDE` 로 읽은 그대로다 */
export type AccountListRow = Prisma.AccountGetPayload<{
  include: typeof ACCOUNT_LIST_INCLUDE;
}>;
