import assert from "node:assert/strict";
import {
  parseContentJson,
  seedTemplate,
  computeAmount,
  calcItemTableTotal,
  createBlock,
  extractClientName,
  type BlockPropsMap,
} from "../src/lib/editor-schema";

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
  supplierName: "SpecFlow AI",
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
assert.equal(supplierFields.find((f) => f.label === "상호")?.value, "SpecFlow AI");

// L4: 문서 타입에 따라 제목 블록 텍스트가 달라진다
const contract = seedTemplate({
  type: "CONTRACT",
  clientName: null,
  supplierName: "SpecFlow AI",
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

console.log("editor-schema tests passed ✅");
