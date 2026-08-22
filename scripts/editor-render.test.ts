/**
 * 캔버스·미리보기·PDF 렌더 정합 검증 (네트워크·DB 없이 순수 함수 + HTML 문자열만).
 * 실행: pnpm test:editor-render
 *
 * 화면에서 맞춘 문서가 PDF 에서 달라 보이면 이 에디터는 신뢰를 잃는다.
 * 세 렌더러가 **같은 판정**을 공유하는지 다음을 본다.
 *  ① blocksOnPage — 쪽 나눔. 경계에 걸친 블록은 양쪽 페이지에 모두 나온다
 *  ② reorderZ — 겹침 순서를 항상 1..n 으로 유지한다 (음수 z 는 흰 배경 뒤로 숨는다)
 *  ③ parseContentJson 이 이미 저장된 음수·0 z 를 치유한다
 *  ④ 인쇄 HTML 이 표 높이를 100% 로 늘리지 않는다 (행이 억지로 벌어지던 문제)
 *  ⑤ 인쇄 HTML 과 화면이 같은 글꼴 스택을 쓴다
 *  ⑥ 인쇄 HTML 의 합계/요약행 우선순위가 `itemTableGrandTotal` 과 일치한다
 *  ⑦ 페이지 컨테이너가 stacking context 다 (isolation)
 *  ⑧ 회사 정보(공급자·로고·인감) 반영이 **화면과 인쇄에서 같은 함수**를 지난다
 */

import assert from "node:assert/strict";
import {
  blocksOnPage,
  createBlock,
  itemTableGrandTotal,
  parseContentJson,
  reorderZ,
  seedTemplate,
  uid,
  withCompanyDefaults,
  FONT_FAMILIES,
  type Block,
  type BlockPropsMap,
  type EditorDoc,
} from "../src/lib/editor-schema";
import { buildDocumentHtml, toPdfBranding } from "../src/lib/pdf-html";

let checks = 0;
function check(actual: unknown, expected: unknown, message: string) {
  assert.deepEqual(actual, expected, message);
  checks += 1;
}
function ok(condition: boolean, message: string) {
  assert.ok(condition, message);
  checks += 1;
}

const PAGE_H = 1123;

function blockAt(id: string, y: number, h: number, z = 1): Block {
  return {
    id,
    type: "text",
    x: 0,
    y,
    w: 100,
    h,
    z,
    locked: false,
    props: {
      text: id,
      align: "left",
      fontSize: 13,
      fontFamily: "sans",
      color: "#111827",
      border: false,
      borderColor: "#e5e7eb",
    },
  };
}

function docOf(blocks: Block[], pages = 2): EditorDoc {
  return { version: 1, canvas: { w: 794, h: PAGE_H, pages }, blocks };
}

// ── ① 쪽 나눔 ──
const spanning = blockAt("걸침", PAGE_H - 20, 60); // 1쪽 끝에서 2쪽으로 넘어간다
const onlyFirst = blockAt("1쪽만", 100, 50);
const onlySecond = blockAt("2쪽만", PAGE_H + 200, 50);
const paged = docOf([onlyFirst, spanning, onlySecond]);

check(
  blocksOnPage(paged, 0).map((b) => b.id),
  ["1쪽만", "걸침"],
  "1쪽에는 1쪽 블록과 경계에 걸친 블록이 나온다",
);
check(
  blocksOnPage(paged, 1).map((b) => b.id),
  ["걸침", "2쪽만"],
  "경계에 걸친 블록은 2쪽에도 나온다 (잘려 이어진다)",
);

// 경계에 정확히 맞닿은 블록은 다음 쪽에 나오지 않는다 (빈 상자가 겹쳐 생기지 않게)
check(
  blocksOnPage(docOf([blockAt("딱맞음", 0, PAGE_H)]), 1).map((b) => b.id),
  [],
  "1쪽을 정확히 채운 블록은 2쪽에 나오지 않는다",
);

// z 오름차순으로 준다 — 뒤에 있는 것이 먼저 그려져야 위에 있는 것이 덮는다
check(
  blocksOnPage(
    docOf([blockAt("위", 0, 50, 3), blockAt("아래", 0, 50, 1)], 1),
    0,
  ).map((b) => b.id),
  ["아래", "위"],
  "z 오름차순으로 준다 (먼저 그린 것이 아래)",
);

// ── ② reorderZ 는 항상 1..n ──
const three = [
  blockAt("a", 0, 10, 1),
  blockAt("b", 0, 10, 2),
  blockAt("c", 0, 10, 3),
];
const zsOf = (blocks: Block[]) =>
  Object.fromEntries(blocks.map((b) => [b.id, b.z]));

check(
  zsOf(reorderZ(three, "a", "front")),
  { a: 3, b: 1, c: 2 },
  "맨 앞으로 — 나머지가 한 칸 내려오고 값은 1..3 을 지킨다",
);
check(
  zsOf(reorderZ(three, "c", "back")),
  { a: 2, b: 3, c: 1 },
  "맨 뒤로 — 0 이나 음수를 만들지 않는다",
);
check(
  zsOf(reorderZ(three, "a", "forward")),
  { a: 2, b: 1, c: 3 },
  "앞으로 한 칸",
);
check(
  zsOf(reorderZ(three, "b", "backward")),
  { a: 2, b: 1, c: 3 },
  "뒤로 한 칸",
);

// 맨 끝에서 더 밀어도 그대로 (값이 무한정 커지거나 작아지지 않는다)
check(zsOf(reorderZ(three, "c", "forward")), { a: 1, b: 2, c: 3 }, "맨 앞에서 더 앞으로 = 그대로");
check(zsOf(reorderZ(three, "a", "backward")), { a: 1, b: 2, c: 3 }, "맨 뒤에서 더 뒤로 = 그대로");

// **음수 z 가 섞여 있어도** 정규화가 살려낸다 (예전 데이터 치유)
check(
  zsOf(
    reorderZ(
      [blockAt("a", 0, 10, -3), blockAt("b", 0, 10, 0), blockAt("c", 0, 10, 5)],
      "a",
      "front",
    ),
  ),
  { a: 3, b: 1, c: 2 },
  "음수·0 이 섞인 문서도 1..n 으로 정규화한다",
);

ok(
  reorderZ(three, "없는id", "front") === three,
  "없는 블록이면 원본을 그대로 돌려준다",
);

// ── ③ parseContentJson 이 음수 z 를 치유한다 ──
const healed = parseContentJson(
  JSON.stringify(docOf([blockAt("숨은블록", 0, 10, -2)], 1)),
);
assert.ok(healed, "파싱 결과가 있어야 한다");
check(
  healed.blocks[0].z,
  1,
  "저장된 음수 z 는 1 로 올린다 — 그대로 두면 흰 배경 뒤로 숨어 블록이 사라진다",
);

// ── ④~⑦ 인쇄 HTML ──
const itemTable = createBlock("itemTable", { x: 40, y: 320 });
const itemProps = itemTable.props as BlockPropsMap["itemTable"];
itemProps.rows = [
  { id: uid(), name: "라이선스", description: "", quantity: 2, unitPrice: 5_000_000 },
];
itemProps.summaryRows = [
  { id: uid(), label: "공급가액", formula: "subtotal" },
  { id: uid(), label: "합계", formula: "subtotal * 1.1" },
];

const html = buildDocumentHtml({
  doc: docOf([itemTable, blockAt("본문", 0, 40)], 1),
  title: "정합 검증 문서",
});

ok(
  !/\.blk-table\{[^}]*height:100%/.test(html),
  "인쇄 표에 height:100% 가 없다 — 있으면 행이 블록 높이에 맞춰 억지로 벌어진다",
);
ok(
  !/table-layout/.test(html),
  "인쇄 표에 table-layout 을 지정하지 않는다 — 화면(auto)과 열 폭이 어긋난다",
);
ok(
  html.includes(FONT_FAMILIES.sans),
  "인쇄 HTML 이 화면과 같은 글꼴 스택을 쓴다 (줄바꿈 지점이 같아야 한다)",
);
ok(
  /\.page\{[^}]*isolation:isolate/.test(html),
  "페이지가 stacking context 다 — 음수 z 가 남아 있어도 흰 배경 뒤로 숨지 않는다",
);

// 요약행이 있으면 마지막 요약행이 총액이고, 인쇄 HTML 에도 그 금액이 찍힌다
const grandTotal = itemTableGrandTotal(itemProps);
check(grandTotal, 11_000_000, "요약행 우선순위 — 마지막 요약행(VAT 포함)이 총액");
ok(
  html.includes("11,000,000"),
  "인쇄 HTML 에도 요약행 총액이 찍힌다 (합계 대신 요약행이 우선)",
);
ok(
  !html.includes(">합계</td><td class=\"num\">₩10,000,000"),
  "요약행이 있으면 기본 '합계' 행을 따로 찍지 않는다",
);

// ── ⑧ 회사 정보 반영 — 화면과 인쇄가 같은 값을 그린다 ──
/*
 * 예전에는 이 폴백이 **인쇄 렌더러에만** 있었다(`renderFieldTable` 의 fallbacks,
 * `renderImage` 의 branding.logoUrl). 그러면 캔버스는 빈 칸, PDF 는 채워진 칸이 되어
 * 사용자가 화면에서 확인할 수 없는 내용이 고객에게 발송된다. 지금은 문서 한 단계 위의
 * `withCompanyDefaults` 하나가 규칙이고, `buildDocumentHtml` 도 그 함수를 지난다.
 */
const brandingRecord = {
  companyName: "(주)지란지교소프트",
  ceoName: "박승애",
  bizRegNo: "111-11-11111",
  address: "대전광역시 유성구 테크노중앙로 74",
  phone: "042-000-0000",
  logoUrl: "data:image/png;base64,LOGO",
  stampUrl: "data:image/png;base64,STAMP",
  primaryColor: "#4F46E5",
};
const branding = toPdfBranding(brandingRecord, "폴백조직");
check(branding.companyName, "(주)지란지교소프트", "상호 폴백은 실제 값이 있으면 쓰이지 않는다");
check(
  toPdfBranding(null, "폴백조직").companyName,
  "폴백조직",
  "회사 정보가 없으면 호출측이 준 이름을 쓴다 (문서를 못 만들게 하지 않는다)",
);

// 캔버스가 그릴 문서(에디터 페이지가 하는 것과 같은 처리)
const canvasDoc = withCompanyDefaults(
  seedTemplate({ type: "QUOTE", clientName: "다올테크", company: branding, items: [] }),
  branding,
);
const brandedHtml = buildDocumentHtml({
  doc: canvasDoc,
  title: "회사 정보 문서",
  branding,
});
for (const value of [
  brandingRecord.ceoName,
  brandingRecord.bizRegNo,
  brandingRecord.address,
  brandingRecord.phone,
]) {
  ok(
    brandedHtml.includes(value),
    `인쇄 HTML 에 공급자 정보가 찍힌다 — ${value} (예전에는 6칸 중 5칸이 비어 있었다)`,
  );
}
ok(
  brandedHtml.includes(brandingRecord.stampUrl),
  "인감이 인쇄 HTML 에 찍힌다 — 찍히지 않으면 인감을 등록할 이유가 없다",
);

/*
 * **핵심 정합 검사**: 이미 회사 정보가 반영된 문서를 인쇄해도 결과가 같아야 한다.
 * 인쇄 쪽에만 폴백이 있으면 두 HTML 이 달라진다.
 */
/** 본문(<body>)만 비교한다 — 제목 메타데이터·주색은 브랜딩에서 정당하게 갈린다 */
const bodyOf = (html: string) => html.slice(html.indexOf("<body>"));
check(
  bodyOf(buildDocumentHtml({ doc: canvasDoc, title: "회사 정보 문서", branding })),
  bodyOf(
    buildDocumentHtml({ doc: canvasDoc, title: "회사 정보 문서", branding: null }),
  ),
  "회사 정보가 이미 반영된 문서는 브랜딩을 넘기든 말든 같은 본문을 그린다 (화면 = 인쇄)",
);

// 역할 없는 빈 이미지 블록에는 로고를 넣지 않는다 —
// 예전에는 빈 이미지면 무엇이든 로고가 찍혀서, 자리만 잡아 둔 칸에 로고가 인쇄됐다
const emptyImage = createBlock("image", { x: 0, y: 0 });
ok(
  !buildDocumentHtml({
    doc: docOf([emptyImage], 1),
    title: "빈 이미지",
    branding,
  }).includes(brandingRecord.logoUrl),
  "역할 없는 빈 이미지 블록에 로고를 채우지 않는다",
);

console.log(`✅ 렌더 정합 검증 통과 — ${checks}건`);
