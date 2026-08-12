/**
 * 영업 기회(Opportunity) — 검증·정규화·DTO·목록 조회 조건 (PRD F-111).
 *
 * server-only 을 import 하지 않으므로 API 라우트·서버 컴포넌트·클라이언트 폼에서 모두 사용한다.
 * Prisma 타입은 `import type` 으로만 참조하므로 클라이언트 번들에는 남지 않는다.
 *
 * 단계(stage) 는 여기서 다루지 않는다 — 생성 시 INITIAL 고정이고, 이후 전이는
 * `@/lib/opportunity-stage` 가 활동 이력과 한 트랜잭션으로 처리한다 (AGENTS.md 규칙).
 */

import type { Prisma } from "@/generated/prisma/client";
import { isOpportunityStage, type OpportunityStage } from "./constants";

// ── 저장 제약 (정책 VAL_*) ──
export const OPPORTUNITY_NAME_MAX = 100;
export const OPPORTUNITY_MEMO_MAX = 2000;

/*
 * 예상 금액은 **이 모듈이 다루지 않는다** (기회-6).
 * 사용자가 입력하는 값이 아니라 확정 문서에서 파생되는 값이라, 판정은
 * `@/lib/confirmed-document`(규칙) · 저장은 `@/lib/opportunity-amount`(쓰기) 가 맡는다.
 * 금액 입력 헬퍼(천단위 구분·정수 변환)를 여기 남겨두면 폼이 다시 손으로 고칠 길을 열게 된다.
 */

// ─────────────────── 날짜 입력 (`<input type="date">` 형식) ───────────────────

const DATE_INPUT_RE = /^(\d{4})-(\d{2})-(\d{2})$/;

/** Date → `YYYY-MM-DD` (로컬 타임존 기준 — `@/lib/format` · `@/lib/pipeline` 과 기준을 맞춘다) */
export function toDateInputValue(date: Date | null): string {
  if (!date) return "";
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

/**
 * `YYYY-MM-DD` → 로컬 자정 Date. 형식이 아니거나 실재하지 않는 날짜(2026-02-31)면 null.
 * UTC 로 파싱하면 타임존에 따라 하루가 밀려 마감일이 어긋나므로 로컬 기준으로 만든다.
 */
export function parseDateInput(value: string): Date | null {
  const matched = DATE_INPUT_RE.exec(value.trim());
  if (!matched) return null;
  const [year, month, day] = matched.slice(1).map(Number);
  const date = new Date(year, month - 1, day);
  const isRealDate =
    date.getFullYear() === year &&
    date.getMonth() === month - 1 &&
    date.getDate() === day;
  return isRealDate ? date : null;
}

// ────────────────────────────── DTO · 폼 값 ──────────────────────────────

/** 클라이언트·서버 공용 기회 표현 (날짜는 직렬화 안전한 문자열) */
export type OpportunityDTO = {
  id: string;
  accountId: string;
  accountName: string;
  ownerId: string;
  ownerName: string;
  name: string;
  stage: OpportunityStage;
  /**
   * 예상 금액 (KRW 정수) — **확정 문서에서 파생된 읽기 전용 값**이다 (기회-6).
   * 확정 문서가 없으면 0 이며, 폼으로 고칠 수 없다.
   */
  expectedAmount: number;
  /** 금액의 근거가 된 확정 문서 id. 없으면 null → 화면은 `₩0 · 확정 문서 없음`. */
  confirmedDocumentId: string | null;
  /** 사용자가 확정 문서를 직접 고정했는지 (자동 판정에서 제외된 상태) */
  isConfirmedDocumentPinned: boolean;
  /** `YYYY-MM-DD`. 미정이면 null. */
  expectedCloseDate: string | null;
  memo: string | null;
  createdAt: string;
  updatedAt: string;
};

/** 셀렉트 후보 (거래처·담당자) — 클라이언트 폼에 직렬화해 넘긴다 */
export type OpportunityAccountOption = { id: string; companyName: string };
export type OpportunityOwnerOption = { id: string; name: string };

/**
 * 생성·수정 폼의 편집 값.
 * **예상 금액은 없다** — 확정 문서에서 파생되므로 폼이 다룰 값이 아니다 (기회-6 ④).
 */
export type OpportunityFormValues = {
  accountId: string;
  name: string;
  /** `YYYY-MM-DD`. 빈 문자열이면 미정. */
  expectedCloseDate: string;
  ownerId: string;
  memo: string;
};

/** 새 기회 폼의 초기값. 거래처 상세·거래처 목록 `⋯` 에서 열면 그 거래처가 미리 선택된다 (F-111 · 거래처-2). */
export function emptyOpportunityForm(defaults: {
  accountId?: string;
  ownerId: string;
}): OpportunityFormValues {
  return {
    accountId: defaults.accountId ?? "",
    name: "",
    expectedCloseDate: "",
    ownerId: defaults.ownerId,
    memo: "",
  };
}

/** DTO → 폼 값 (null 은 빈 문자열로) */
export function toOpportunityFormValues(
  opportunity: OpportunityDTO,
): OpportunityFormValues {
  return {
    accountId: opportunity.accountId,
    name: opportunity.name,
    expectedCloseDate: opportunity.expectedCloseDate ?? "",
    ownerId: opportunity.ownerId,
    memo: opportunity.memo ?? "",
  };
}

/** Prisma 레코드(부분) → DTO */
export function toOpportunityDTO(record: {
  id: string;
  accountId: string;
  account: { companyName: string };
  ownerId: string;
  owner: { name: string };
  name: string;
  stage: string;
  expectedAmount: number;
  confirmedDocumentId: string | null;
  isConfirmedDocumentPinned: boolean;
  expectedCloseDate: Date | null;
  memo: string | null;
  createdAt: Date;
  updatedAt: Date;
}): OpportunityDTO {
  return {
    id: record.id,
    accountId: record.accountId,
    accountName: record.account.companyName,
    ownerId: record.ownerId,
    ownerName: record.owner.name,
    name: record.name,
    // stage 는 DB 가 String 컬럼이라 정의 밖 값이 들어올 수 있다. 초기 단계로 보수 해석한다.
    stage: isOpportunityStage(record.stage) ? record.stage : "INITIAL",
    expectedAmount: record.expectedAmount,
    confirmedDocumentId: record.confirmedDocumentId,
    isConfirmedDocumentPinned: record.isConfirmedDocumentPinned,
    expectedCloseDate: toDateInputValue(record.expectedCloseDate) || null,
    memo: record.memo,
    createdAt: record.createdAt.toISOString(),
    updatedAt: record.updatedAt.toISOString(),
  };
}

// ────────────────────────────── 입력 검증 ──────────────────────────────

/**
 * 검증을 통과한 기회 입력값.
 * `expectedAmount` 는 없다 — 확정 문서가 정하는 값이라 요청 본문에 담겨도 무시한다 (기회-6).
 */
export type OpportunityInput = {
  accountId: string;
  ownerId: string;
  name: string;
  expectedCloseDate: Date | null;
  memo: string | null;
};

/** 부분 수정(PATCH)에서 빠진 필드를 채울 현재 값 */
export type OpportunityCurrentValues = {
  accountId: string;
  ownerId: string;
  name: string;
  expectedCloseDate: Date | null;
  memo: string | null;
};

/**
 * 부분 수정 본문에 **빠진 필드를 현재 값으로 채운다** (기회-7 인라인 수정).
 *
 * 인라인 수정은 고친 한 필드만 보낸다. 검증 규칙을 두 벌로 나누는 대신 여기서 전체 모양을
 * 만들어 `parseOpportunityInput()` 한 곳을 그대로 통과시킨다 — 규칙이 갈라지면 다이얼로그로
 * 저장한 값과 인라인으로 저장한 값의 제약이 달라진다.
 *
 * 보내지 않은 필드는 건드리지 않는다(현재 값 유지). 빈 문자열은 "비움"이라는 뜻이므로
 * 키가 있는지(`in`)로만 판단하고 값의 참·거짓으로 판단하지 않는다.
 */
export function withOpportunityDefaults(
  body: Record<string, unknown>,
  current: OpportunityCurrentValues,
): Record<string, unknown> {
  const pick = (key: keyof OpportunityFormValues, fallback: unknown): unknown =>
    key in body ? body[key] : fallback;

  return {
    accountId: pick("accountId", current.accountId),
    ownerId: pick("ownerId", current.ownerId),
    name: pick("name", current.name),
    expectedCloseDate: pick(
      "expectedCloseDate",
      toDateInputValue(current.expectedCloseDate),
    ),
    memo: pick("memo", current.memo ?? ""),
  };
}

/**
 * API 요청 본문을 검증·정규화한다 (POST · PATCH 공용).
 * 거래처·담당자·기회명이 필수이고 마감일·메모는 선택이다.
 * 거래처·담당자가 **현재 조직 소속인지**는 여기서 알 수 없으므로 라우트가 별도로 확인한다.
 * 실패 시 사용자용 한국어 메시지를 담은 `{ error }` 를 반환한다.
 *
 * 본문에 `expectedAmount` 가 섞여 와도 **조용히 버린다** (기회-6 ④) — 예상 금액은 확정
 * 문서에서만 정해지므로, 여기서 받아 넘기면 손으로 고칠 뒷문이 생긴다.
 */
export function parseOpportunityInput(
  body: Record<string, unknown>,
): OpportunityInput | { error: string } {
  const text = (key: keyof OpportunityFormValues) =>
    typeof body[key] === "string" ? (body[key] as string).trim() : "";

  const accountId = text("accountId");
  const ownerId = text("ownerId");
  const name = text("name");
  const memo = text("memo");
  const closeDateRaw = text("expectedCloseDate");

  if (!accountId) return { error: "거래처를 선택해주세요." };
  if (!ownerId) return { error: "영업 담당자를 선택해주세요." };
  if (!name) return { error: "기회명을 입력해주세요." };
  if (name.length > OPPORTUNITY_NAME_MAX) {
    return { error: `기회명은 ${OPPORTUNITY_NAME_MAX}자 이내여야 합니다.` };
  }
  if (memo.length > OPPORTUNITY_MEMO_MAX) {
    return { error: `메모는 ${OPPORTUNITY_MEMO_MAX}자 이내여야 합니다.` };
  }

  // 마감일은 비워둘 수 있고, 값이 있을 때만 형식을 본다 (정책 VAL_*).
  const expectedCloseDate = closeDateRaw ? parseDateInput(closeDateRaw) : null;
  if (closeDateRaw && !expectedCloseDate) {
    return { error: "예상 마감일 형식이 올바르지 않습니다." };
  }

  return {
    accountId,
    ownerId,
    name,
    expectedCloseDate,
    memo: memo || null,
  };
}

// ────────────────────────────── 목록 조회 조건 ──────────────────────────────

/** 목록 필터 (F-111) — 단계별 · 담당자별 · 기회명/거래처명 검색 */
export type OpportunityListFilters = {
  query: string;
  stage: OpportunityStage | null;
  ownerId: string | null;
};

/** 필터 없음 */
export const EMPTY_OPPORTUNITY_FILTERS: OpportunityListFilters = {
  query: "",
  stage: null,
  ownerId: null,
};

/** URL 쿼리(`?q=&stage=&owner=`) → 필터. 정의 밖 단계 값은 무시한다. */
export function parseOpportunityFilters(params: {
  q?: string | null;
  stage?: string | null;
  owner?: string | null;
}): OpportunityListFilters {
  const stage = params.stage?.trim() ?? "";
  const ownerId = params.owner?.trim() ?? "";
  return {
    query: params.q?.trim() ?? "",
    stage: isOpportunityStage(stage) ? stage : null,
    ownerId: ownerId || null,
  };
}

/** 필터가 하나라도 걸려 있는지 (빈 목록 안내 문구 분기용) */
export function hasOpportunityFilter(filters: OpportunityListFilters): boolean {
  return Boolean(filters.query || filters.stage || filters.ownerId);
}

/**
 * 기회 목록 조회의 Prisma where 조건.
 * orgId 스코프는 항상 걸고, 검색어가 있으면 기회명·거래처 회사명 부분 일치를 더한다.
 * SQLite 의 LIKE 는 ASCII 대소문자를 구분하지 않으므로 `contains` 만으로 대소문자 무시가 된다.
 * 인가·검색 규칙을 한 곳에 모아 목록 API 와 페이지가 같은 조건을 쓰게 한다.
 */
export function opportunitiesWhere(
  orgId: string,
  filters: OpportunityListFilters,
): Prisma.OpportunityWhereInput {
  const where: Prisma.OpportunityWhereInput = { orgId };
  if (filters.stage) where.stage = filters.stage;
  if (filters.ownerId) where.ownerId = filters.ownerId;
  if (filters.query) {
    where.OR = [
      { name: { contains: filters.query } },
      { account: { companyName: { contains: filters.query } } },
    ];
  }
  return where;
}

/**
 * 목록 기본 정렬 — 예상 마감일 오름차순(임박한 것 먼저), 마감일 미정은 뒤로.
 * 같은 날짜끼리는 최근 수정 순으로 안정화한다.
 */
export const OPPORTUNITY_LIST_ORDER_BY: Prisma.OpportunityOrderByWithRelationInput[] =
  [{ expectedCloseDate: { sort: "asc", nulls: "last" } }, { updatedAt: "desc" }];

/** 목록·상세가 공유하는 select (DTO 변환에 필요한 최소 필드) */
export const OPPORTUNITY_DTO_SELECT = {
  id: true,
  accountId: true,
  account: { select: { companyName: true } },
  ownerId: true,
  owner: { select: { name: true } },
  name: true,
  stage: true,
  expectedAmount: true,
  confirmedDocumentId: true,
  isConfirmedDocumentPinned: true,
  expectedCloseDate: true,
  memo: true,
  createdAt: true,
  updatedAt: true,
} satisfies Prisma.OpportunitySelect;
