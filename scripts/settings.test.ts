/**
 * `src/lib/branding.ts` · `src/lib/user-profile.ts` · `src/lib/catalog.ts` 검증
 * (네트워크·DB 없이 순수 함수만). 실행: pnpm test:settings
 *
 * 지키려는 경계는 셋이다 (설정 7 · 2.0.0).
 *  ① 회사·개인 정보의 검증은 **기존 규칙을 재사용**한다 — 사업자등록번호는 거래처와,
 *    연락처는 담당자와 같은 정규화를 지난다. 규칙이 두 벌이 되면 같은 값이 화면마다
 *    다르게 저장된다.
 *  ② 로고·인감은 dataUrl 로 컬럼에 들어가므로 **크기 상한이 서버에서도** 걸린다.
 *  ③ 옮겨온 품목 카탈로그 목록이 다른 목록과 같은 URL 규칙을 쓴다 — 기본 정렬은 주소에
 *    남지 않고, 정렬·필터를 바꾸면 page 가 1로 돌아간다.
 *  ④ 품목 등록·수정 검증은 **한 함수**(`parseCatalogInput`)가 맡고 단가는 캔버스·인스펙터와
 *    **같은 파서**(`parseIntInput`)를 쓴다. 부분 수정(활성 토글)도 같은 검증을 지난다.
 */

import assert from "node:assert/strict";
import {
  DEFAULT_PRIMARY_COLOR,
  MAX_BRANDING_IMAGE_BYTES,
  brandingImageError,
  parseBrandingInput,
  toBrandingFormValues,
} from "../src/lib/branding";
import { parseProfileInput } from "../src/lib/user-profile";
import {
  CATALOG_DEFAULT_UNIT,
  CATALOG_UNIT_PRICE_MAX,
  CATEGORY_PARAM,
  DEFAULT_CATALOG_SORT,
  catalogOrderBy,
  catalogSortHref,
  catalogSortParams,
  catalogSortStateOf,
  catalogDeleteMessage,
  catalogUsageWhere,
  catalogWhere,
  nextCatalogSort,
  parseCatalogInput,
  parseCatalogSort,
  toCatalogFormValues,
  toCatalogItemDTO,
  withCatalogDefaults,
} from "../src/lib/catalog";
import { parseIntInput } from "../src/lib/editor-schema";
import { PAGE_PARAM } from "../src/lib/pagination";

let checks = 0;
function check(actual: unknown, expected: unknown, message: string) {
  assert.deepEqual(actual, expected, message);
  checks += 1;
}

// ─────────────────────── 회사 정보 — 기존 규칙 재사용 ───────────────────────
const saved = parseBrandingInput({
  companyName: "  (주)지란지교소프트 ",
  ceoName: "박승애",
  // 숫자만 넣어도 거래처와 같은 정규화를 지난다 (000-00-00000)
  bizRegNo: "1111111111",
  address: "대전광역시 유성구 테크노중앙로 74",
  // 담당자와 같은 정규화를 지난다 (구분자·국가번호를 너그럽게 받는다)
  phone: "+82-42-000-0000",
  primaryColor: "#4F46E5",
});
assert.ok(!("error" in saved), "정상 입력은 통과한다");
check(saved.companyName, "(주)지란지교소프트", "회사명은 공백을 다듬는다");
check(saved.bizRegNo, "111-11-11111", "사업자등록번호를 하이픈 형식으로 정규화");
check(saved.phone, "042-000-0000", "대표 연락처를 국내 표기로 정규화");

// 빈 값은 null 이다 — 모든 항목이 선택 입력이라 "안 적었다" 를 그대로 남긴다
const blank = parseBrandingInput({});
assert.ok(!("error" in blank), "빈 본문도 통과한다(모두 선택 입력)");
check(
  [blank.companyName, blank.ceoName, blank.bizRegNo, blank.address, blank.phone],
  [null, null, null, null, null],
  "적지 않은 값은 null 로 저장한다",
);
check(
  blank.primaryColor,
  DEFAULT_PRIMARY_COLOR,
  "기본 색상은 빈 값이면 기본값으로 채운다",
);

// 형식이 틀린 값은 사용자용 문구로 막는다 (화면·서버가 같은 함수를 쓴다)
const badBiz = parseBrandingInput({ bizRegNo: "12345" });
check("error" in badBiz, true, "자릿수가 모자란 사업자등록번호는 막는다");
const badPhone = parseBrandingInput({ phone: "042-00" });
check("error" in badPhone, true, "형식이 아닌 대표 연락처는 막는다");
const badColor = parseBrandingInput({ primaryColor: "royalblue" });
check("error" in badColor, true, "색상 이름은 #RRGGBB 가 아니라 막는다");

// ─────────────────────── 로고·인감 — 서버가 다시 잰다 ───────────────────────
check(brandingImageError("로고", ""), null, "비어 있으면 검사하지 않는다");
check(
  brandingImageError("로고", "https://example.com/ci.png"),
  null,
  "외부 주소는 그대로 받는다(시드 로고가 이 형태다)",
);
check(
  brandingImageError("인감", "javascript:alert(1)") !== null,
  true,
  "이미지가 아닌 문자열은 거절한다",
);
// base64 4글자 = 3바이트 → 상한을 넘는 길이를 만든다
const overBase64 = "A".repeat(
  Math.ceil(((MAX_BRANDING_IMAGE_BYTES + 1024) * 4) / 3),
);
check(
  brandingImageError("로고", `data:image/png;base64,${overBase64}`) !== null,
  true,
  "상한을 넘는 dataUrl 은 서버에서도 거절한다",
);
const underBase64 = "A".repeat(1024);
check(
  brandingImageError("로고", `data:image/png;base64,${underBase64}`),
  null,
  "상한 아래 dataUrl 은 통과한다",
);
check(
  "error" in parseBrandingInput({ stampUrl: `data:image/png;base64,${overBase64}` }),
  true,
  "본문 검증도 같은 판정을 지난다",
);

// ─────────────────────── 폼 초기값 — null 은 빈 문자열로 ───────────────────────
check(
  toBrandingFormValues(null, "RAINMAKER Demo").companyName,
  "RAINMAKER Demo",
  "브랜딩 행이 없으면 조직명으로 시작한다",
);
check(
  toBrandingFormValues({
    companyName: null,
    ceoName: null,
    bizRegNo: null,
    address: null,
    phone: null,
    logoUrl: null,
    stampUrl: null,
    primaryColor: "",
  }).primaryColor,
  DEFAULT_PRIMARY_COLOR,
  "색상이 비면 기본값을 보여준다(색 없는 입력이 되지 않게)",
);

// ─────────────────────── 개인 정보 — 이름만 필수 ───────────────────────
check("error" in parseProfileInput({ name: "  " }), true, "이름은 비울 수 없다");
const profile = parseProfileInput({
  name: " 김레인 ",
  position: "",
  phone: "01034567890",
});
assert.ok(!("error" in profile), "직함·연락처는 선택 입력이다");
check(profile.name, "김레인", "이름은 공백을 다듬는다");
check(profile.position, null, "적지 않은 직함은 null");
check(profile.phone, "010-3456-7890", "연락처는 담당자와 같은 규칙으로 정규화");
check(
  "error" in parseProfileInput({ name: "김레인", phone: "010-34" }),
  true,
  "형식이 아닌 연락처는 막는다",
);

// ─────────────────────── 품목 카탈로그 목록 규칙 ───────────────────────
check(
  parseCatalogSort({ sort: "nope", dir: "asc" }),
  DEFAULT_CATALOG_SORT,
  "정렬 키가 아니면 기본 정렬로 떨어진다(주소를 손으로 고쳐도 깨지지 않게)",
);
check(
  parseCatalogSort({ sort: "unitPrice", dir: "" }),
  { key: "unitPrice", direction: "desc" },
  "방향이 없으면 그 컬럼의 첫 방향(단가는 비싼 것 먼저)",
);
check(
  nextCatalogSort({ key: "name", direction: "asc" }, "name"),
  { key: "name", direction: "desc" },
  "같은 컬럼을 다시 누르면 방향만 뒤집는다",
);
check(
  catalogSortParams(DEFAULT_CATALOG_SORT),
  { sort: "", dir: "" },
  "기본 정렬은 주소에 남지 않는다",
);
check(
  catalogSortStateOf({ key: "sku", direction: "asc" }, "name"),
  "none",
  "정렬 중이 아닌 컬럼은 none (aria-sort)",
);

// 정렬을 바꾸면 page 가 1로 돌아간다 — 3페이지에 머문 채 정렬만 바꾸면 딴 구간이 뜬다
const sorted = catalogSortHref(
  "/settings/catalog",
  { q: "보안", [CATEGORY_PARAM]: "소프트웨어", [PAGE_PARAM]: "3" },
  { key: "unitPrice", direction: "asc" },
);
check(
  sorted.includes(`${PAGE_PARAM}=`),
  false,
  "정렬 링크에 page 가 남지 않는다(=1페이지)",
);
check(
  sorted.includes("category=") && sorted.includes("sort=unitPrice"),
  true,
  "검색·카테고리는 유지하고 정렬만 바꾼다",
);

// 조회 조건 — 조직 범위는 언제나 걸리고, 빈 검색·빈 카테고리는 조건을 만들지 않는다
check(
  catalogWhere("org_1", "  ", "  "),
  { orgId: "org_1" },
  "빈 검색·빈 카테고리는 조직 범위만 남는다",
);
const filtered = catalogWhere("org_1", "보안", "소프트웨어");
check(filtered.category, "소프트웨어", "카테고리 필터가 걸린다");
check(
  Array.isArray(filtered.OR) && filtered.OR.length,
  3,
  "검색은 품목명·SKU·설명을 함께 본다",
);

// 안정화 기준(id)이 항상 마지막에 붙는다 — 없으면 페이지를 넘길 때 행이 겹치거나 빠진다
for (const key of ["category", "name", "sku", "unitPrice"] as const) {
  const orderBy = catalogOrderBy({ key, direction: "asc" });
  check(
    orderBy[orderBy.length - 1],
    { id: "asc" },
    `${key} 정렬의 마지막 기준은 id`,
  );
}
check(
  catalogOrderBy({ key: "sku", direction: "desc" })[0],
  { sku: { sort: "desc", nulls: "last" } },
  "SKU 는 어느 방향이든 미정(null)을 뒤로 보낸다",
);

// ─────────────────── 품목 등록·수정 검증 (parseCatalogInput) ───────────────────

const item = parseCatalogInput({
  category: "  라이선스 ",
  name: " 통합 보안 솔루션 ",
  sku: " SEC-01 ",
  // 사람이 실제로 붙여 넣는 형태 — 통화기호·쉼표·단위·소수점이 섞여 들어온다
  unitPrice: "₩1,200,000.5원",
  description: "  ",
  unit: "  ",
});
assert.ok(!("error" in item), "정상 입력은 통과한다");
check(item.category, "라이선스", "카테고리는 공백을 다듬는다");
check(item.name, "통합 보안 솔루션", "품목명은 공백을 다듬는다");
check(item.sku, "SEC-01", "SKU 도 공백을 다듬는다");
check(item.description, null, "적지 않은 설명은 null");
check(
  item.unit,
  CATALOG_DEFAULT_UNIT,
  `단위를 비우면 기본값(${CATALOG_DEFAULT_UNIT})으로 저장한다(스키마 기본값과 같아야 한다)`,
);
check(item.isActive, true, "활성 여부를 주지 않으면 활성으로 등록한다");

// 단가는 **캔버스·인스펙터와 같은 파서**를 지난다 — 세 번째 파서를 만들면 같은 값이
// 카탈로그에서만 다르게 저장되고, 그 품목을 견적서에 꽂는 순간 단가가 화면마다 갈린다.
check(
  item.unitPrice,
  parseIntInput("₩1,200,000.5원"),
  "단가는 parseIntInput 결과와 정확히 같다(파서를 새로 만들지 않는다)",
);
check(item.unitPrice, 1_200_000, "소수점 앞까지만 읽는다(10배가 되지 않는다)");

const negative = parseCatalogInput({
  category: "서비스",
  name: "환불",
  unitPrice: "-50000",
});
assert.ok(!("error" in negative), "음수 입력 자체는 파서가 정리한다");
check(negative.unitPrice, 0, "음수 단가는 0 이다(파서의 규칙을 그대로 따른다)");

// 필수 두 개 — 카테고리는 목록의 묶음 기준이고 품목명은 견적서에 그대로 박히는 값이다
check(
  "error" in parseCatalogInput({ category: " ", name: "이름" }),
  true,
  "카테고리는 비울 수 없다",
);
check(
  "error" in parseCatalogInput({ category: "서비스", name: "  " }),
  true,
  "품목명은 비울 수 없다",
);
// 상한은 앱이 먼저 막는다 — Prisma Int(32비트)를 넘기면 사람이 읽을 수 없는 오류가 뜬다
check(
  "error" in
    parseCatalogInput({
      category: "서비스",
      name: "초고가",
      unitPrice: String(CATALOG_UNIT_PRICE_MAX + 1),
    }),
  true,
  "32비트 상한을 넘는 단가는 사용자 문구로 막는다",
);
check(
  "error" in
    parseCatalogInput({
      category: "서비스",
      name: "가장 비싼 품목",
      unitPrice: String(CATALOG_UNIT_PRICE_MAX),
    }),
  false,
  "상한 자체는 저장할 수 있다(경계값)",
);
check(
  "error" in parseCatalogInput({ category: "가".repeat(41), name: "이름" }),
  true,
  "길이 상한을 넘으면 막는다",
);

// ─────────── 부분 수정(활성 토글) — 검증을 두 벌로 만들지 않는다 ───────────
const current = {
  category: "라이선스",
  name: "모니터링 SW 라이선스",
  sku: "LIC-MON",
  unit: "연",
  unitPrice: 2_400_000,
  description: null,
  isActive: true,
};
const toggled = parseCatalogInput(
  withCatalogDefaults({ isActive: false }, current),
);
assert.ok(!("error" in toggled), "isActive 하나만 보내도 통과한다");
check(toggled.isActive, false, "토글한 값은 반영된다");
check(
  { ...toggled, isActive: true },
  { ...current, isActive: true },
  "보내지 않은 필드는 현재 값 그대로다(토글이 다른 값을 덮지 않는다)",
);
check(
  "error" in parseCatalogInput({ isActive: false }),
  true,
  "현재 값을 채우지 않으면 같은 요청이 막힌다(withCatalogDefaults 가 필요한 이유)",
);

// DTO ↔ 폼 값 왕복 — 단가는 입력 중에는 문자열이고, null 은 빈 문자열로 내려간다
const dto = toCatalogItemDTO({
  id: "cat_1",
  ...current,
  createdAt: new Date("2026-01-02T03:04:05.000Z"),
  updatedAt: new Date("2026-02-03T04:05:06.000Z"),
});
check(dto.updatedAt, "2026-02-03T04:05:06.000Z", "날짜는 ISO 문자열로 내린다");
const formValues = toCatalogFormValues(dto);
check(formValues.unitPrice, "2400000", "단가는 폼에서 문자열로 다룬다");
check(formValues.description, "", "null 설명은 빈 문자열로 내려간다");
check(
  "error" in parseCatalogInput({ ...formValues }),
  false,
  "폼 값을 그대로 다시 넣어도 통과한다(왕복이 깨지지 않는다)",
);

// ─────────── 삭제 확인창 — 되돌릴 수 없는 조작은 결과를 미리 말한다 ───────────
const usage = catalogUsageWhere("org_1", " 연간 유지보수 ");
check(
  Array.isArray(usage.OR) && usage.OR.length,
  2,
  "쓰임은 품목 행·본문(contentJson) 두 곳에서 센다(문서는 값을 복사해 두므로 링크가 없다)",
);
check(
  catalogUsageWhere("org_1", "   "),
  { orgId: "org_1", id: { in: [] } },
  "이름이 비면 아무것도 세지 않는다(contains:\"\" 는 조직 전체 문서에 걸린다)",
);
const warning = catalogDeleteMessage("연간 유지보수", 3);
check(warning.includes("3건"), true, "몇 건이 쓰고 있는지 미리 말한다");
check(
  warning.includes("금액은 그대로 유지됩니다"),
  true,
  "이미 만든 문서의 금액이 바뀌지 않는다는 사실을 함께 말한다",
);
check(
  catalogDeleteMessage("연간 유지보수", 0).includes("아직 없다") ||
    catalogDeleteMessage("연간 유지보수", 0).includes("아직 없습니다"),
  true,
  "0건이면 0건이라고 말한다(숫자를 감추지 않는다)",
);

console.log(`settings: ${checks}건 검증 통과`);
