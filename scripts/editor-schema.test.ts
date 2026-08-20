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
  contentJsonSizeError,
  MAX_CONTENT_JSON_BYTES,
  type BlockPropsMap,
  type MetaField,
} from "../src/lib/editor-schema";

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
  supplierName: "RAINMAKER",
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
  supplierName: "RAINMAKER",
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
assert.equal(
  findMetaField([{ id: "x", label: "발주처", value: "A" }], "clientName"),
  null,
  "역할도 라벨 단서도 없으면 못 찾는다 (치유가 필요한 상태)",
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

// 치유: **값 일치**로 역할을 채운다 (AI 가 라벨을 정한 경우)
const healedByValue = healMetaFieldRoles(
  [
    { id: "a", label: "수요기관", value: "오렌지헬스" },
    { id: "b", label: "담당", value: "김레인" },
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
  [{ id: "a", label: "수요기관", value: "" }],
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
  type: "QUOTE", clientName: "다올테크", supplierName: "지란지교소프트", items: [],
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

// ─────────── 본문 크기 상한 — 화면 검사만으로는 API 를 막지 못한다 ───────────
assert.equal(contentJsonSizeError("{}"), null);
const huge = "x".repeat(MAX_CONTENT_JSON_BYTES + 1);
const err = contentJsonSizeError(huge);
assert.ok(err && err.includes("너무 큽니다"), "상한을 넘으면 이유를 준다");
// 한글은 UTF-8 로 3바이트다 — 문자 수가 아니라 **바이트**로 재야 한다
assert.equal(contentJsonSizeError("가".repeat(MAX_CONTENT_JSON_BYTES / 3)), null);
assert.ok(contentJsonSizeError("가".repeat(MAX_CONTENT_JSON_BYTES / 2)) !== null);

console.log("editor-schema tests passed ✅");
