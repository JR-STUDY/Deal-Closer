/**
 * 품목 카탈로그 — 목록 조회 조건·정렬 + 등록·수정 검증·DTO **순수 함수**
 * (2.0.0 · 관리자 콘솔에서 이전).
 *
 * 카탈로그 화면은 관리자 콘솔의 `마스터 데이터 관리` 였고 **전체를 한 번에** 실었다.
 * 담당자 포털(`/settings/catalog`)로 옮기면서 다른 목록과 같은 규칙을 적용한다 —
 * 검색·필터·정렬·페이지는 모두 URL 쿼리로만 주고받고(`@/lib/pagination` ·
 * `@/lib/opportunity-sort` 와 같은 설계), 서버가 잘라서 내려준다.
 *
 * DB 에 접근하지 않고 `server-only` 도 import 하지 않으므로 서버 컴포넌트·표 머리글
 * 어디서든 쓴다. Prisma 타입은 `import type` 으로만 참조한다.
 */

import type { Prisma } from "@/generated/prisma/client";
import { pageHref } from "./pagination";
import {
  SORT_DIR_PARAM,
  SORT_PARAM,
  type SortDirection,
  type SortState,
} from "./opportunity-sort";
// 단가 입력 파싱은 캔버스·인스펙터와 **같은 함수**를 쓴다 (세 번째 파서를 만들지 않는다)
import { parseIntInput } from "./editor-schema";

/** 카테고리 필터를 담는 쿼리 키 */
export const CATEGORY_PARAM = "category";

/**
 * 정렬할 수 있는 컬럼.
 *
 * **자연스러운 순서가 있는 값만 연다.** 상태(활성/비활성)는 두 값뿐이라 정렬보다 필터의
 * 일이고, 단위(EA·식·월)는 문자열 정렬이 사람이 기대하는 순서와 무관하다
 * (`OPPORTUNITY_SORT_KEYS` 가 단계·담당자를 열지 않은 것과 같은 이유).
 */
export const CATALOG_SORT_KEYS = [
  "category",
  "name",
  "sku",
  "unitPrice",
] as const;

export type CatalogSortKey = (typeof CATALOG_SORT_KEYS)[number];
export type CatalogSort = { key: CatalogSortKey; direction: SortDirection };

/**
 * 기본 정렬 — **카테고리 가나다순**. 옮겨오기 전 화면의 순서(카테고리 → 등록순)를 잇는다.
 * 카탈로그는 "무엇이 있는지" 훑는 목록이라 종류끼리 붙어 있는 편이 읽힌다.
 */
export const DEFAULT_CATALOG_SORT: CatalogSort = {
  key: "category",
  direction: "asc",
};

/** 그 컬럼을 **처음 눌렀을 때**의 방향 (단가만 "비싼 것 먼저"가 기대에 맞는다) */
const FIRST_DIRECTION: Record<CatalogSortKey, SortDirection> = {
  category: "asc",
  name: "asc",
  sku: "asc",
  unitPrice: "desc",
};

/** 정렬 키인지 (URL 을 손으로 고쳐도 깨지지 않게) */
export function isCatalogSortKey(value: string): value is CatalogSortKey {
  return (CATALOG_SORT_KEYS as readonly string[]).includes(value);
}

/** URL 쿼리(`?sort=&dir=`) → 정렬 상태 */
export function parseCatalogSort(params: {
  sort?: string | null;
  dir?: string | null;
}): CatalogSort {
  const key = params.sort?.trim() ?? "";
  if (!isCatalogSortKey(key)) return DEFAULT_CATALOG_SORT;

  const dir = params.dir?.trim().toLowerCase() ?? "";
  const direction: SortDirection =
    dir === "asc" || dir === "desc" ? dir : FIRST_DIRECTION[key];
  return { key, direction };
}

/**
 * 머리글을 눌렀을 때의 다음 정렬 상태.
 * 같은 컬럼을 다시 누르면 방향만 뒤집고, 다른 컬럼이면 그 컬럼의 기본 방향으로 간다.
 */
export function nextCatalogSort(
  current: CatalogSort,
  key: CatalogSortKey,
): CatalogSort {
  if (current.key === key) {
    return { key, direction: current.direction === "asc" ? "desc" : "asc" };
  }
  return { key, direction: FIRST_DIRECTION[key] };
}

/** 기본 정렬 그대로인지 (주소에 파라미터를 남길지 판단) */
export function isDefaultCatalogSort(sort: CatalogSort): boolean {
  return (
    sort.key === DEFAULT_CATALOG_SORT.key &&
    sort.direction === DEFAULT_CATALOG_SORT.direction
  );
}

/** 정렬 상태 → URL 파라미터. **기본 정렬이면 빈 값**이라 주소에 남지 않는다 */
export function catalogSortParams(sort: CatalogSort): Record<string, string> {
  if (isDefaultCatalogSort(sort)) {
    return { [SORT_PARAM]: "", [SORT_DIR_PARAM]: "" };
  }
  return { [SORT_PARAM]: sort.key, [SORT_DIR_PARAM]: sort.direction };
}

/**
 * 머리글 링크의 주소 — 검색·카테고리는 그대로 두고 정렬만 바꾸며 **page 를 1로 되돌린다**
 * (`pageHref(..., 1)` 이 `page` 를 지운다).
 */
export function catalogSortHref(
  basePath: string,
  query: Readonly<Record<string, string>>,
  sort: CatalogSort,
): string {
  return pageHref(basePath, { ...query, ...catalogSortParams(sort) }, 1);
}

/** `aria-sort` 에 넣을 값 — 지금 정렬 중인 컬럼만 방향을 알린다 (정책 ACC_*) */
export function catalogSortStateOf(
  sort: CatalogSort,
  key: CatalogSortKey,
): SortState {
  return sort.key === key ? sort.direction : "none";
}

/**
 * 정렬 상태 → Prisma `orderBy`.
 *
 * SKU 는 비어 있을 수 있어 **어느 방향이든 미정(null)을 뒤로** 보낸다 — 방향을 뒤집었다고
 * 값이 없는 행이 맨 위로 올라오면 정렬을 건 사람이 보려던 것이 아래로 밀린다
 * (기회 목록의 예상 마감일과 같은 처리).
 *
 * 마지막에 안정화 기준(`id`)을 덧붙인다 — 같은 값이 여러 행이면 DB 가 순서를 보장하지 않아
 * 페이지를 넘길 때 같은 행이 두 번 나오거나 빠질 수 있다.
 */
export function catalogOrderBy(
  sort: CatalogSort,
): Prisma.CatalogItemOrderByWithRelationInput[] {
  const { direction } = sort;
  const primary: Prisma.CatalogItemOrderByWithRelationInput =
    sort.key === "category"
      ? { category: direction }
      : sort.key === "name"
        ? { name: direction }
        : sort.key === "sku"
          ? { sku: { sort: direction, nulls: "last" } }
          : { unitPrice: direction };

  return [
    primary,
    // 묶음 안의 순서까지 정해 준다 (카테고리로 묶으면 그 안이 품목명 가나다순)
    ...(sort.key === "name"
      ? []
      : [{ name: "asc" } as Prisma.CatalogItemOrderByWithRelationInput]),
    { id: "asc" },
  ];
}

/**
 * 목록 조회 조건 — 조직 범위 + 검색어 + 카테고리 필터 (`accountsWhere` 와 같은 역할).
 *
 * 검색은 **품목명·SKU·설명** 부분 일치다. SQLite 는 `mode: "insensitive"` 를 지원하지 않아
 * 거래처 검색과 같은 방식(그대로 `contains`)으로 둔다.
 * 카테고리는 목록·건수 양쪽에 같은 조건이 걸려야 "총 N개"가 화면과 어긋나지 않는다.
 */
export function catalogWhere(
  orgId: string,
  query: string,
  category: string,
): Prisma.CatalogItemWhereInput {
  const q = query.trim();
  const cat = category.trim();
  return {
    orgId,
    ...(cat ? { category: cat } : {}),
    ...(q
      ? {
          OR: [
            { name: { contains: q } },
            { sku: { contains: q } },
            { description: { contains: q } },
          ],
        }
      : {}),
  };
}

// ════════════════════ 품목 등록·수정 — 검증 · DTO (순수 함수) ════════════════════
//
// 목록 규칙(위)과 같은 파일에 두는 이유는 **하나의 도메인이기 때문**이다. 검증을 라우트에
// 흩어 놓으면 등록 팝업과 인라인 토글이 서로 다른 제약을 갖게 된다 — 거래처(`account.ts`)·
// 담당자(`contact.ts`) 와 같은 배치다: `parse*Input` + DTO + 폼 값 변환을 한곳에 모으고,
// 화면과 서버가 **같은 함수**를 통과시킨다("화면에서만 막은 것은 막은 것이 아니다").

// ── 저장 제약 (정책 VAL_*) ──
export const CATALOG_CATEGORY_MAX = 40;
export const CATALOG_NAME_MAX = 120;
export const CATALOG_SKU_MAX = 40;
export const CATALOG_UNIT_MAX = 20;
export const CATALOG_DESCRIPTION_MAX = 500;

/**
 * 단가 상한 — Prisma `Int` 는 **32비트 부호 있는 정수**다 (SQLite 컬럼은 더 넓지만
 * 클라이언트가 32비트로 검증한다). 상한을 앱에서 먼저 막지 않으면 사용자가 자릿수를
 * 잘못 넣었을 때 사람이 읽을 수 없는 드라이버 오류가 그대로 화면에 뜬다.
 */
export const CATALOG_UNIT_PRICE_MAX = 2_147_483_647;

/** 단위를 비워 두면 쓰는 기본값 — 스키마 기본값(`@default("EA")`)과 같아야 한다 */
export const CATALOG_DEFAULT_UNIT = "EA";

/** 클라이언트·서버 공용 품목 표현 (날짜는 직렬화 안전한 ISO 문자열) */
export type CatalogItemDTO = {
  id: string;
  category: string;
  name: string;
  sku: string | null;
  unit: string;
  unitPrice: number;
  description: string | null;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
};

/**
 * 저장(POST · PATCH) 응답 — DTO + **같은 SKU 를 쓰는 다른 품목 수**.
 *
 * SKU 는 유니크가 아니다(스키마에 제약이 없다). 중복을 막는 대신 저장 결과에 건수를 실어
 * 화면이 "같은 SKU 가 이미 있습니다" 라고 알려 준다 — 라우트 주석에 근거를 적어 두었다.
 */
export type CatalogSaveResult = CatalogItemDTO & { duplicateSkuCount: number };

/** 등록·수정 폼의 편집 값 (선택 항목은 빈 문자열, 단가도 입력 중에는 문자열이다) */
export type CatalogFormValues = {
  category: string;
  name: string;
  sku: string;
  unit: string;
  unitPrice: string;
  description: string;
  isActive: boolean;
};

/** 빈 폼 초기값 — 새 품목은 **활성**으로 시작한다(등록하자마자 견적서에서 고를 수 있게) */
export const EMPTY_CATALOG_FORM: CatalogFormValues = {
  category: "",
  name: "",
  sku: "",
  unit: CATALOG_DEFAULT_UNIT,
  unitPrice: "",
  description: "",
  isActive: true,
};

/** Prisma 레코드(부분) → DTO */
export function toCatalogItemDTO(record: {
  id: string;
  category: string;
  name: string;
  sku: string | null;
  unit: string;
  unitPrice: number;
  description: string | null;
  isActive: boolean;
  createdAt: Date;
  updatedAt: Date;
}): CatalogItemDTO {
  return {
    id: record.id,
    category: record.category,
    name: record.name,
    sku: record.sku,
    unit: record.unit,
    unitPrice: record.unitPrice,
    description: record.description,
    isActive: record.isActive,
    createdAt: record.createdAt.toISOString(),
    updatedAt: record.updatedAt.toISOString(),
  };
}

/** DTO → 폼 값 (null 은 빈 문자열, 단가는 사람이 고칠 수 있게 숫자 문자열로) */
export function toCatalogFormValues(item: CatalogItemDTO): CatalogFormValues {
  return {
    category: item.category,
    name: item.name,
    sku: item.sku ?? "",
    unit: item.unit,
    unitPrice: String(item.unitPrice),
    description: item.description ?? "",
    isActive: item.isActive,
  };
}

/** 검증을 통과한 품목 입력값 (선택 항목은 빈 값이면 null) */
export type CatalogInput = {
  category: string;
  name: string;
  sku: string | null;
  unit: string;
  unitPrice: number;
  description: string | null;
  isActive: boolean;
};

/** 길이 초과 검사 — 통과하면 null, 아니면 사용자용 메시지 (`account.ts` 와 같은 형태) */
function tooLong(label: string, value: string, max: number): string | null {
  return value.length > max ? `${label}은(는) ${max}자 이내여야 합니다.` : null;
}

/**
 * API 요청 본문을 검증·정규화한다 (POST · PATCH 공용).
 *
 * 필수는 **카테고리·품목명** 둘이다 — 카테고리는 목록의 탭이자 묶음 기준이라 비면 이름
 * 없는 탭이 생기고, 품목명은 견적서 품목표에 그대로 박히는 값이다. SKU·설명은 선택이고
 * 단위는 비우면 기본값(`EA`)을 쓴다.
 *
 * **단가는 `parseIntInput()` 을 재사용한다** — 캔버스·인스펙터가 쓰는 그 함수다.
 * 파서를 새로 만들면 같은 `1,200,000.5` 가 카탈로그에서는 다른 값으로 저장되고, 그 품목을
 * 견적서에 꽂는 순간 단가가 화면마다 달라진다(에디터에서 실제로 겪은 사고다 — 캔버스는
 * 소수점을 지워 10배, 인스펙터는 버려서 정상이었다). 음수·소수 처리 규칙도 그 함수가
 * 단일 기준이다(소수점 앞까지만 읽고, 음수는 0).
 */
export function parseCatalogInput(
  body: Record<string, unknown>,
): CatalogInput | { error: string } {
  const text = (key: keyof CatalogFormValues) =>
    typeof body[key] === "string" ? (body[key] as string).trim() : "";

  const category = text("category");
  const name = text("name");
  const sku = text("sku");
  const unit = text("unit") || CATALOG_DEFAULT_UNIT;
  const description = text("description");

  if (!category) return { error: "카테고리를 입력해주세요." };
  if (!name) return { error: "품목명을 입력해주세요." };

  const lengthError =
    tooLong("카테고리", category, CATALOG_CATEGORY_MAX) ??
    tooLong("품목명", name, CATALOG_NAME_MAX) ??
    tooLong("SKU", sku, CATALOG_SKU_MAX) ??
    tooLong("단위", unit, CATALOG_UNIT_MAX) ??
    tooLong("설명", description, CATALOG_DESCRIPTION_MAX);
  if (lengthError) return { error: lengthError };

  // 단가는 수량·단가 입력의 단일 파서를 지난다 (원 단위 정수 — 정책 FORM_CURRENCY_KRW)
  const unitPrice = parseIntInput(
    typeof body.unitPrice === "number" || typeof body.unitPrice === "string"
      ? body.unitPrice
      : "",
  );
  if (unitPrice > CATALOG_UNIT_PRICE_MAX) {
    return {
      error: `단가는 ${CATALOG_UNIT_PRICE_MAX.toLocaleString("ko-KR")}원 이하로 입력해주세요.`,
    };
  }

  return {
    category,
    name,
    sku: sku || null,
    unit,
    unitPrice,
    description: description || null,
    // 값을 주지 않으면 활성이다 — 등록 직후 견적서에서 고를 수 없으면 등록한 뜻이 없다
    isActive: typeof body.isActive === "boolean" ? body.isActive : true,
  };
}

/** 부분 수정에서 기준으로 삼는 현재 값 */
export type CatalogCurrentValues = {
  category: string;
  name: string;
  sku: string | null;
  unit: string;
  unitPrice: number;
  description: string | null;
  isActive: boolean;
};

/**
 * 부분 수정(목록의 활성 토글)에서 **빠진 필드를 현재 값으로 채운다**
 * (`withOpportunityDefaults` 와 같은 역할).
 *
 * 이게 없으면 토글이 `{ isActive }` 하나만 보냈을 때 `parseCatalogInput` 이 카테고리·
 * 품목명을 빈 값으로 읽어 400 을 돌려준다. 반대로 토글 전용 라우트를 따로 만들면 검증
 * 규칙이 두 벌이 되어, 다이얼로그로 저장할 때와 토글로 저장할 때의 제약이 갈린다.
 */
export function withCatalogDefaults(
  body: Record<string, unknown>,
  current: CatalogCurrentValues,
): Record<string, unknown> {
  const pick = (key: keyof CatalogFormValues, fallback: unknown): unknown =>
    key in body ? body[key] : fallback;

  return {
    category: pick("category", current.category),
    name: pick("name", current.name),
    sku: pick("sku", current.sku ?? ""),
    unit: pick("unit", current.unit),
    unitPrice: pick("unitPrice", current.unitPrice),
    description: pick("description", current.description ?? ""),
    isActive: pick("isActive", current.isActive),
  };
}

/**
 * 이 품목을 품목표에 담은 문서를 세는 조회 조건.
 *
 * 문서의 품목표는 **카탈로그를 참조하지 않는다** — 고른 순간 이름·단가를 본문
 * (`contentJson`)과 `DocumentItem` 행으로 **복사**한다. 그래서 카탈로그에서 품목을 지워도
 * 참조가 끊기지 않고 이미 만든 문서의 금액도 변하지 않는다. 세는 목적은 "지우면 무엇이
 * 깨지는가"가 아니라 **"이 품목이 실제로 쓰이고 있다"** 를 삭제 전에 알려 주기 위해서다.
 *
 * 이어 주는 열이 없으므로 **품목명 일치**로 센다(그래서 화면 문구도 "품목명이 같은 문서"
 * 라고 적는다 — 링크가 있는 척하지 않는다). 이름이 비면 아무것도 세지 않는다 —
 * `contains: ""` 는 모든 행에 걸려 조직의 전체 문서 수를 "사용 중" 으로 보고한다.
 */
export function catalogUsageWhere(
  orgId: string,
  name: string,
): Prisma.DocumentWhereInput {
  const n = name.trim();
  if (!n) return { orgId, id: { in: [] } };
  return {
    orgId,
    OR: [
      // 구버전·AI 생성 경로가 남기는 품목 행
      { items: { some: { name: n } } },
      // 블록 캔버스 본문(품목표 블록의 값 복사본)
      { contentJson: { contains: n } },
    ],
  };
}

/**
 * 삭제 확인창 문구 — **되돌릴 수 없는 조작은 결과를 미리 말한다**.
 *
 * 세 가지를 함께 알린다: ① 품목명이 같은 문서가 몇 건인지, ② 그래도 **이미 만든 문서의
 * 품목·금액은 바뀌지 않는다**(값 복사본이므로), ③ 앞으로 견적서에서 고를 수 없게 된다.
 * ②를 빼면 사용자는 지나간 견적서의 금액이 흔들릴까 두려워 삭제를 못 하고, ③을 빼면
 * 왜 목록에서 사라졌는지 나중에 알 수 없다. 문구를 순수 함수로 둬 테스트가 지킨다.
 */
export function catalogDeleteMessage(
  name: string,
  documentCount: number,
): string {
  const usage =
    documentCount > 0
      ? `품목명이 같은 문서가 ${documentCount.toLocaleString("ko-KR")}건 있습니다. 문서의 품목표는 담을 때 이름·단가를 복사해 두므로, 삭제하셔도 이미 만든 문서의 품목과 금액은 그대로 유지됩니다.`
      : "이 품목을 담은 문서는 아직 없습니다.";
  return `"${name}" 을(를) 삭제합니다. ${usage} 삭제하시면 앞으로 견적서 품목표에서 이 품목을 고를 수 없습니다. 이 작업은 되돌릴 수 없습니다.`;
}
