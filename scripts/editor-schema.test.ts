import assert from "node:assert/strict";
import {
  parseContentJson,
  seedTemplate,
  computeAmount,
  calcItemTableTotal,
  createBlock,
  extractClientName,
  evalFormula,
  itemTableGrandTotal,
  findMetaField,
  healMetaFieldRoles,
  metaRolesFor,
  withCompanyDefaults,
  contentJsonSizeError,
  MAX_CONTENT_JSON_BYTES,
  SUPPLIER_META_ROLES,
  type BlockPropsMap,
  type MetaField,
} from "../src/lib/editor-schema";
import type { CompanyProfile } from "../src/lib/branding";

// #9 안전 수식 평가기
assert.equal(evalFormula("subtotal * 1.1", { subtotal: 10000 }), 11000);
assert.equal(evalFormula("subtotal * 0.1", { subtotal: 10000 }), 1000);
assert.equal(evalFormula("(subtotal + 100) * 2", { subtotal: 50 }), 300);
assert.equal(evalFormula("subtotal / 0", { subtotal: 10 }), 0); // 0 나눗셈 안전
assert.equal(evalFormula("unknown + 5", {}), 5); // 미지정 변수 = 0
assert.equal(evalFormula("", { subtotal: 99 }), 0);

// itemTableGrandTotal: 요약 행 있으면 마지막 행 값(VAT 포함)
assert.equal(
  itemTableGrandTotal({
    rows: [
      { id: "r", name: "x", description: "", quantity: 2, unitPrice: 5000 },
    ],
    showTotal: true,
    extraColumns: [],
    summaryRows: [
      { id: "s1", label: "공급가액", formula: "subtotal" },
      { id: "s2", label: "합계", formula: "subtotal * 1.1" },
    ],
  }),
  11000, // 10000 * 1.1
);

// parseContentJson: 잘못된 입력은 null
assert.equal(parseContentJson(null), null);
assert.equal(parseContentJson("not json"), null);
assert.equal(parseContentJson("{}"), null);

// C2: 유효하지 않은 블록(props 누락, 잘못된 type)은 필터링, 유효 블록만 유지
const mixed = parseContentJson(
  JSON.stringify({
    blocks: [
      { id: "bad", type: "title" }, // props 누락 → 제외
      { id: "bad2", type: "nope", x: 0, y: 0, w: 1, h: 1, props: {} }, // 잘못된 type → 제외
      {
        id: "ok",
        type: "text",
        x: 0,
        y: 0,
        w: 10,
        h: 10,
        props: { text: "hi", align: "left", fontSize: 12 },
      },
    ],
  }),
);
assert.ok(mixed);
assert.equal(mixed.blocks.length, 1);
assert.equal(mixed.blocks[0].id, "ok");

// C2: itemTable 에 rows 가 없어도 computeAmount 가 크래시하지 않음(0)
const noRows = parseContentJson(
  JSON.stringify({
    blocks: [
      { id: "t", type: "itemTable", x: 0, y: 0, w: 1, h: 1, props: {} },
    ],
  }),
);
assert.ok(noRows);
assert.equal(computeAmount(noRows), 0);

// seedTemplate: 기존 아이템이 itemTable 로 들어가고 합계가 맞는다
const doc = seedTemplate({
  type: "QUOTE",
  clientName: "(주)테스트",
  company: { companyName: "RAINMAKER" },
  items: [
    { name: "구축", description: "일괄", quantity: 1, unitPrice: 15_000_000 },
    { name: "서버", description: "5대", quantity: 5, unitPrice: 500_000 },
  ],
});
assert.equal(doc.blocks.length, 6); // logo, title, supplier, clientMeta, itemTable, notice
assert.equal(doc.blocks.filter((b) => b.type === "itemTable").length, 1);
assert.equal(computeAmount(doc), 17_500_000);

// 공급자 정보가 필드 배열이고 상호에 공급자명이 시드된다
const supplier = doc.blocks.find((b) => b.type === "supplier");
assert.ok(supplier);
const supplierFields = (supplier.props as BlockPropsMap["supplier"]).fields;
assert.equal(supplierFields.find((f) => f.label === "상호")?.value, "RAINMAKER");

// L4: 문서 타입에 따라 제목 블록 텍스트가 달라진다
const contract = seedTemplate({
  type: "CONTRACT",
  clientName: null,
  company: { companyName: "RAINMAKER" },
  items: [],
});
const contractTitle = contract.blocks.find((b) => b.type === "title");
assert.equal((contractTitle?.props as BlockPropsMap["title"]).text, "계약서");

// C1: 거래처명 추출(거래처 메타 '고객사명' 값)
assert.equal(extractClientName(doc), "(주)테스트");

// round-trip: 직렬화→파싱 후 합계 동일
const round = parseContentJson(JSON.stringify(doc));
assert.ok(round);
assert.equal(computeAmount(round), 17_500_000);

// C3: 합계는 수량×단가 그대로(이중 반올림 없음), 행 표시와 일치
assert.equal(
  calcItemTableTotal([
    { id: "a", name: "x", description: "", quantity: 3, unitPrice: 1000 },
  ]),
  3000,
);
assert.equal(calcItemTableTotal([]), 0);

// createBlock: 기본값
const b = createBlock("title");
assert.equal(b.type, "title");
assert.equal(b.locked, false);


// ─────────── 정보 필드의 **역할** — 라벨을 고쳐도 조회가 끊기지 않아야 한다 ───────────
//
// 예전에는 라벨 문자열이 곧 키였다(`label.includes("고객사")`). 사용자가 캔버스에서
// 라벨을 `거래처명` 으로 바꾸면 extractClientName 이 null 이 되고, PATCH 는
// clientName 을 건드리지 않아 **문서 목록에 옛 거래처명이 영구히 남았다**.

const roleFields = (): MetaField[] => [
  { id: "f1", label: "고객사명", value: "오렌지헬스", role: "clientName" },
  { id: "f2", label: "수신자", value: "김레인" },
];

// 역할이 있으면 라벨과 무관하다
assert.equal(findMetaField(roleFields(), "clientName")?.id, "f1");
const renamed = roleFields().map((f) =>
  f.id === "f1" ? { ...f, label: "발주처" } : f,
);
assert.equal(
  findMetaField(renamed, "clientName")?.id,
  "f1",
  "라벨을 바꿔도 역할로 찾는다",
);

// 역할이 없는 예전 문서는 라벨 조각으로 찾는다 (폴백)
assert.equal(
  findMetaField([{ id: "x", label: "고객사명", value: "A" }], "clientName")?.id,
  "x",
);
// 라벨 조각은 여러 개다 — `발주처`·`수요기관` 처럼 모델이 흔히 쓰는 낱말도 폴백에 넣었다
assert.equal(
  findMetaField([{ id: "x", label: "발주처", value: "A" }], "clientName")?.id,
  "x",
  "관례를 벗어난 라벨도 폴백 조각으로 찾는다 (AI 가 라벨을 정하는 경로)",
);
// 그래도 **아무 단서 없는** 라벨은 못 찾는다 — 폴백은 짐작이지 보장이 아니다
assert.equal(
  findMetaField([{ id: "x", label: "갑", value: "A" }], "clientName"),
  null,
  "짐작할 단서가 없으면 못 찾는다 (역할이 필요한 이유)",
);

// 치유: 라벨 단서로 역할을 채운다
const healedByLabel = healMetaFieldRoles([
  { id: "x", label: "고객사명", value: "A" },
]);
assert.equal(healedByLabel[0].role, "clientName");

// 이미 역할이 있으면 다른 필드에 같은 역할을 또 만들지 않는다 (블록당 하나)
const noDup = healMetaFieldRoles([
  { id: "a", label: "수신처", value: "A", role: "clientName" },
  { id: "b", label: "고객사명", value: "B" },
]);
assert.equal(noDup[1].role, undefined, "역할은 블록당 하나여야 조회가 흔들리지 않는다");

/*
 * 치유: **값 일치**로 역할을 채운다 (AI 가 라벨을 정한 경우).
 * 라벨은 조각 목록에 **없는** 낱말이어야 이 경로를 검증한다 — `수요기관` 처럼 조각에
 * 든 라벨을 쓰면 1차(라벨) 패스에서 이미 정해져 값 일치 경로를 지나지 않는다.
 */
const healedByValue = healMetaFieldRoles(
  [
    { id: "a", label: "갑", value: "오렌지헬스" },
    { id: "b", label: "을", value: "김레인" },
  ],
  { clientName: "오렌지헬스" },
);
assert.equal(
  healedByValue[0].role,
  "clientName",
  "라벨이 관례를 벗어나도 값으로 찾는다 (AI 생성 문서)",
);
assert.equal(healedByValue[1].role, undefined);

// 빈 값은 단서가 되지 않는다 (빈 필드가 역할을 가로채면 조회가 빈 값을 준다)
const emptyHint = healMetaFieldRoles(
  [{ id: "a", label: "갑", value: "" }],
  { clientName: "" },
);
assert.equal(emptyHint[0].role, undefined);

// 바뀔 것이 없으면 **같은 배열**을 돌려준다 (불필요한 리렌더·미저장 표시 방지)
const already = roleFields();
assert.equal(healMetaFieldRoles(already), already);

// extractClientName: 라벨을 바꿔도 살아남는다 (원래 버그의 회귀 테스트)
const docWith = (fields: MetaField[]) => ({
  version: 1 as const,
  canvas: { w: 794, h: 1123, pages: 1 },
  blocks: [
    {
      id: "m", type: "clientMeta" as const, x: 0, y: 0, w: 300, h: 100, z: 1,
      locked: false, props: { labelWidth: 96, fields },
    },
  ],
});
assert.equal(extractClientName(docWith(roleFields())), "오렌지헬스");
assert.equal(
  extractClientName(docWith(renamed)),
  "오렌지헬스",
  "라벨을 `발주처` 로 바꿔도 거래처명이 유지된다",
);

// parseContentJson 이 예전 문서를 치유한다 (마이그레이션 없이, 다음 저장에 남는다)
const legacy = JSON.stringify(docWith([{ id: "x", label: "고객사명", value: "다올테크" }]));
const parsedLegacy = parseContentJson(legacy);
const legacyFields = (parsedLegacy!.blocks[0].props as BlockPropsMap["clientMeta"]).fields;
assert.equal(legacyFields[0].role, "clientName", "읽을 때 역할을 채운다");

// seedTemplate 이 만든 문서는 처음부터 역할을 갖는다
const seeded = seedTemplate({
  type: "QUOTE", clientName: "다올테크", company: { companyName: "지란지교소프트" }, items: [],
});
const seededClient = seeded.blocks.find((b) => b.type === "clientMeta")!;
const seededSupplier = seeded.blocks.find((b) => b.type === "supplier")!;
assert.equal(
  findMetaField((seededClient.props as BlockPropsMap["clientMeta"]).fields, "clientName")?.value,
  "다올테크",
);
assert.equal(
  findMetaField((seededSupplier.props as BlockPropsMap["supplier"]).fields, "supplierName")?.value,
  "지란지교소프트",
  "공급자명도 역할로 시드된다 (예전에는 label === \"상호\" 비교였다)",
);

// ─────── 라벨 추정은 **가장 구체적인 조각**이 이긴다 (AI 가 라벨을 정하는 경로) ───────
/*
 * 라벨을 쓰는 주체가 둘이다 — 사용자(캔버스에서 고친다)와 **모델**(AI 생성 경로에서
 * 라벨을 정한다). 조각이 역할마다 하나뿐이면 `사업자번호`·`대표` 처럼 관례를 살짝
 * 벗어난 라벨에서 곧바로 끊기고, 그 칸은 영영 비어 있다.
 */
const guessed = (labels: string[]) =>
  healMetaFieldRoles(
    labels.map((label, i) => ({ id: String(i), label, value: "" })),
    undefined,
    SUPPLIER_META_ROLES,
  ).map((f) => f.role);

assert.deepEqual(
  guessed(["공급자 상호", "사업자번호", "대표", "소재지", "연락처", "E-mail"]),
  [
    "supplierName",
    "supplierBizRegNo",
    "supplierCeoName",
    "supplierAddress",
    "supplierPhone",
    "supplierEmail",
  ],
  "AI 가 정한 라벨도 역할을 찾는다 (공백·대소문자·하이픈 무시)",
);
assert.deepEqual(
  guessed(["대표자", "대표번호"]),
  ["supplierCeoName", "supplierPhone"],
  "`대표번호` 는 `대표`(대표자)보다 긴 조각이 이긴다 — 대표자 자리에 전화번호가 들어가면 안 된다",
);
// 조회도 같은 판정을 쓴다 — 라벨 폴백이 다른 역할의 칸을 집어가면 안 된다
assert.equal(
  findMetaField([{ id: "p", label: "대표번호", value: "042-000-0000" }], "supplierCeoName"),
  null,
  "대표자 조회가 `대표번호` 칸을 집어가지 않는다",
);
assert.equal(
  findMetaField([{ id: "p", label: "대표번호", value: "042-000-0000" }], "supplierPhone")?.value,
  "042-000-0000",
);
// 한 역할은 블록당 하나 — 라벨이 비슷한 칸이 둘이면 앞의 것만 차지한다
assert.deepEqual(
  guessed(["주소", "사업장주소"]),
  ["supplierAddress", undefined],
  "역할은 블록당 하나다 (조회 결과가 흔들리지 않아야 한다)",
);

// ═══════════ 회사 정보(공급자·로고·인감) 반영 — 설정 7 ═══════════
/*
 * 왜 이 묶음이 있나: 예전에는 `seedTemplate` 이 공급자 블록의 `상호` **한 칸**만 채웠다.
 * 그래서 실제 문서에서 **공급자 6칸 중 5칸이 비어 있었다** (대표자·등록번호·주소·전화·이메일).
 * 로고와 인감도 견적서에 찍히지 않으면 아무 쓸모가 없다.
 */

const COMPANY: CompanyProfile = {
  companyName: "(주)지란지교소프트",
  ceoName: "박승애",
  bizRegNo: "111-11-11111",
  address: "대전광역시 유성구 테크노중앙로 74, 201호",
  phone: "042-000-0000",
  logoUrl: "https://example.com/ci.png",
  stampUrl: "data:image/svg+xml;base64,AAAA",
};

const seededFull = seedTemplate({
  type: "QUOTE",
  clientName: "다올테크",
  company: COMPANY,
  items: [],
});
const fullSupplier = (
  seededFull.blocks.find((b) => b.type === "supplier")!
    .props as BlockPropsMap["supplier"]
).fields;

// 값은 **역할**로 찾는다 — 라벨을 고쳐도 조회가 끊기지 않아야 한다
const valueOf = (role: Parameters<typeof findMetaField>[1]) =>
  findMetaField(fullSupplier, role)?.value;
assert.equal(valueOf("supplierName"), COMPANY.companyName);
assert.equal(valueOf("supplierCeoName"), COMPANY.ceoName, "대표자가 채워진다 (예전 누락)");
assert.equal(valueOf("supplierBizRegNo"), COMPANY.bizRegNo, "사업자등록번호가 채워진다");
assert.equal(valueOf("supplierAddress"), COMPANY.address, "주소가 채워진다");
assert.equal(valueOf("supplierPhone"), COMPANY.phone, "전화가 채워진다");
assert.equal(
  valueOf("supplierEmail"),
  "",
  "이메일은 비워 둔다 — Branding 에 컬럼이 없다 (대표 연락처를 억지로 넣지 않는다)",
);
// 여섯 칸 전부 역할을 갖는다 — 하나라도 빠지면 그 칸은 영영 채워지지 않는다
assert.deepEqual(
  fullSupplier.map((f) => f.role),
  [...SUPPLIER_META_ROLES],
  "공급자 여섯 칸이 모두 역할을 갖는다",
);
// 주소가 길어도 처음부터 담기는 높이로 놓는다 (열자마자 잘림 경고가 뜨면 안 된다)
assert.ok(
  seededFull.blocks.find((b) => b.type === "supplier")!.h > 6 * 22,
  "주소 줄바꿈을 감안해 공급자 블록 높이를 잡는다",
);

// 로고·인감은 **역할이 붙은 이미지 블록**에 담긴다
const images = seededFull.blocks
  .filter((b) => b.type === "image")
  .map((b) => b.props as BlockPropsMap["image"]);
assert.deepEqual(
  images.map((p) => p.role),
  ["logo", "stamp"],
  "로고 + 인감 두 블록이 놓인다",
);
assert.equal(images[1].dataUrl, COMPANY.stampUrl, "인감 이미지가 블록에 담긴다");

// 인감은 **맨 앞**이다 — 공급자 상호 위에 겹쳐 찍히므로 뒤에 있으면 보이지 않는다.
// z 는 reorderZ 가 1..n 으로 정규화한다 (음수 z 는 블록을 통째로 사라지게 했다)
const stampBlock = seededFull.blocks.find(
  (b) => b.type === "image" && (b.props as BlockPropsMap["image"]).role === "stamp",
)!;
assert.equal(
  stampBlock.z,
  Math.max(...seededFull.blocks.map((b) => b.z)),
  "인감이 가장 앞이다",
);
assert.ok(
  seededFull.blocks.every((b) => b.z >= 1),
  "겹침 순서에 0·음수가 없다",
);

// **인감이 없는 조직에는 블록을 만들지 않는다** — 빈 이미지 블록은 회색 자리표시자가
// 되고, 그 문서를 그대로 발송하면 견적서에 빈 사각형이 남는다
const noStamp = seedTemplate({
  type: "QUOTE",
  clientName: null,
  company: { companyName: "인감없는회사" },
  items: [],
});
assert.equal(
  noStamp.blocks.filter((b) => b.type === "image").length,
  1,
  "인감이 없으면 로고 블록 하나뿐이다",
);
assert.deepEqual(
  new Set(noStamp.blocks.map((b) => b.z)),
  new Set([1]),
  "인감이 없으면 겹침 순서를 건드리지 않는다 (예전 문서와 같은 모습)",
);
// 회사 정보가 비어 있으면 그 칸은 **빈 칸**으로 남는다 (라벨은 남겨 둔다)
const noStampFields = (
  noStamp.blocks.find((b) => b.type === "supplier")!
    .props as BlockPropsMap["supplier"]
).fields;
assert.equal(
  findMetaField(noStampFields, "supplierAddress")?.value,
  "",
  "주소를 등록하지 않은 조직은 빈 칸 — 지어내지 않는다",
);
assert.equal(
  findMetaField(noStampFields, "supplierAddress")?.label,
  "주소",
  "라벨은 남긴다 — 캔버스에서 바로 적어 넣을 수 있어야 한다",
);

// withCompanyDefaults: **사용자가 적은 값은 절대 덮지 않는다**
const edited = JSON.parse(JSON.stringify(seededFull)) as typeof seededFull;
const editedSupplier = edited.blocks.find((b) => b.type === "supplier")!;
(editedSupplier.props as BlockPropsMap["supplier"]).fields = (
  editedSupplier.props as BlockPropsMap["supplier"]
).fields.map((f) =>
  f.role === "supplierAddress" ? { ...f, value: "직접 적은 주소" } : f,
);
const reapplied = withCompanyDefaults(edited, COMPANY);
assert.equal(
  findMetaField(
    (reapplied.blocks.find((b) => b.type === "supplier")!
      .props as BlockPropsMap["supplier"]).fields,
    "supplierAddress",
  )?.value,
  "직접 적은 주소",
  "이미 적은 값은 회사 정보로 덮이지 않는다",
);
// 바뀔 것이 없으면 같은 객체 (불필요한 리렌더·미저장 표시 방지)
assert.equal(withCompanyDefaults(seededFull, COMPANY), seededFull);
assert.equal(withCompanyDefaults(seededFull, null), seededFull);

// **블록을 만들지 않는다** — 인감을 나중에 등록해도 예전 문서에 블록이 생겨나지 않는다
assert.equal(
  withCompanyDefaults(noStamp, COMPANY).blocks.filter((b) => b.type === "image").length,
  1,
  "회사 정보 반영은 값만 채운다 (블록 생성은 시드의 일이다)",
);

// 역할 없는 빈 이미지 블록은 **채우지 않는다** — 예전에는 빈 이미지면 무엇이든 로고가
// 찍혀서, 자리만 잡아 둔 칸에 로고가 인쇄됐다
const plainImage = {
  version: 1 as const,
  canvas: { w: 794, h: 1123, pages: 1 },
  blocks: [
    {
      id: "img", type: "image" as const, x: 0, y: 0, w: 100, h: 100, z: 1, locked: false,
      props: { dataUrl: "", alt: "", fit: "contain" as const, opacity: 100, border: false, borderColor: "#eee" },
    },
  ],
};
assert.equal(
  withCompanyDefaults(plainImage, COMPANY),
  plainImage,
  "역할 없는 빈 이미지 블록에는 로고를 넣지 않는다",
);

// 예전 문서 치유 — 공급자 라벨로 역할을 채우고, 이미지 역할은 `alt` 로 채운다
const legacySupplier = parseContentJson(
  JSON.stringify({
    blocks: [
      {
        id: "s", type: "supplier", x: 0, y: 0, w: 300, h: 140, z: 1, locked: false,
        props: {
          labelWidth: 72,
          fields: [
            { id: "1", label: "상호", value: "옛회사" },
            { id: "2", label: "대표자", value: "" },
            { id: "3", label: "사업자등록번호", value: "" },
            { id: "4", label: "주소", value: "" },
            { id: "5", label: "전화번호", value: "" },
          ],
        },
      },
      {
        id: "l", type: "image", x: 0, y: 0, w: 100, h: 30, z: 1, locked: false,
        props: { dataUrl: "", alt: "회사 로고", fit: "contain", opacity: 100, border: false, borderColor: "#eee" },
      },
    ],
  }),
)!;
assert.deepEqual(
  (legacySupplier.blocks[0].props as BlockPropsMap["supplier"]).fields.map((f) => f.role),
  [
    "supplierName",
    "supplierCeoName",
    "supplierBizRegNo",
    "supplierAddress",
    "supplierPhone",
  ],
  "예전 공급자 블록의 역할을 라벨로 채운다 (`사업자등록번호`·`전화번호` 도 잡는다)",
);
assert.equal(
  (legacySupplier.blocks[1].props as BlockPropsMap["image"]).role,
  "logo",
  "예전 로고 블록의 역할을 `alt` 로 채운다 — 그러지 않으면 로고 폴백이 끊긴다",
);
// 치유된 예전 문서는 회사 정보를 받아 빈 칸이 메워진다 (이미 적힌 상호는 그대로)
const healedFilled = withCompanyDefaults(legacySupplier, COMPANY);
const healedFields = (healedFilled.blocks[0].props as BlockPropsMap["supplier"]).fields;
assert.equal(findMetaField(healedFields, "supplierName")?.value, "옛회사");
assert.equal(findMetaField(healedFields, "supplierCeoName")?.value, "박승애");
assert.equal(
  (healedFilled.blocks[1].props as BlockPropsMap["image"]).dataUrl,
  COMPANY.logoUrl,
  "빈 로고 블록에 회사 로고가 채워진다",
);

// 역할 후보는 **블록별로** 좁힌다 — 거래처 블록의 `주소` 칸이 공급자 주소 역할을 차지하면
// 회사 주소가 거래처 자리에 채워진다
assert.deepEqual([...metaRolesFor("clientMeta")], ["clientName"]);
assert.deepEqual([...metaRolesFor("image")], []);
const clientWithAddress = parseContentJson(
  JSON.stringify(docWith([
    { id: "a", label: "고객사명", value: "다올테크" },
    { id: "b", label: "주소", value: "" },
  ])),
)!;
assert.equal(
  (clientWithAddress.blocks[0].props as BlockPropsMap["clientMeta"]).fields[1].role,
  undefined,
  "거래처 블록의 `주소` 는 공급자 주소 역할을 가져가지 않는다",
);

// ─────────── 본문 크기 상한 — 화면 검사만으로는 API 를 막지 못한다 ───────────
assert.equal(contentJsonSizeError("{}"), null);
const huge = "x".repeat(MAX_CONTENT_JSON_BYTES + 1);
const err = contentJsonSizeError(huge);
assert.ok(err && err.includes("너무 큽니다"), "상한을 넘으면 이유를 준다");
// 한글은 UTF-8 로 3바이트다 — 문자 수가 아니라 **바이트**로 재야 한다
assert.equal(contentJsonSizeError("가".repeat(MAX_CONTENT_JSON_BYTES / 3)), null);
assert.ok(contentJsonSizeError("가".repeat(MAX_CONTENT_JSON_BYTES / 2)) !== null);

console.log("editor-schema tests passed ✅");
