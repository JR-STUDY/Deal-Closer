/**
 * 에디터 문서의 금액 도출 검증 — `@/lib/editor-schema` (네트워크·DB 없이 순수 함수만).
 * 실행: pnpm test:editor-amount
 *
 * 문서 금액은 본문(품목표)에서 도출되고, 그 금액이 확정 문서를 통해 기회 예상 금액이 된다
 * (기회-6). 그래서 **"합계 0원"과 "금액 근거가 없다"를 구분하지 못하면** 문서를 열어
 * 저장만 눌러도 실제 금액이 0 으로 덮이고 파이프라인 숫자까지 무너진다.
 * 다음을 집중적으로 본다.
 *  ① 품목표 블록이 없으면 `null` — 저장측이 기존 금액을 보존해야 한다는 신호
 *  ② 품목표가 있고 비어 있으면 `0` — 사용자가 정말로 비운 것이므로 0 이 맞다
 *  ③ 요약행(수식)이 있으면 마지막 요약행이 합계를 대신한다
 *  ④ 품목 없이 금액만 있는 문서도 `seedTemplate` 이 근거 1행을 만들어 왕복 후 금액이 남는다
 *  ⑤ 표시용 `computeAmount` 는 근거가 없을 때 0 으로 평탄화한다
 *  ⑥ **캔버스에서 단가·수량을 고치면 요약행(부가세)과 문서 금액이 따라온다** — 값으로 확인
 *  ⑦ 숫자 입력 파싱은 캔버스·인스펙터가 같다 (`parseIntInput`) — 소수점이 값을 10배로 만들지 않는다
 *  ⑧ 문서 금액이 되는 요약행은 **표식(`isTotal`)** 이 정한다 (예전 문서는 마지막 행으로 치유)
 *  ⑨ 수식이 알아볼 수 없는 글자를 담고 있으면 `formulaError` 가 그 사실을 말한다
 */

import assert from "node:assert/strict";
import {
  computeAmount,
  createBlock,
  deriveAmount,
  evalSummaryRows,
  formulaError,
  itemTableGrandTotal,
  normalizeSummaryRows,
  parseContentJson,
  parseIntInput,
  seedTemplate,
  totalSummaryRow,
  uid,
  type Block,
  type BlockPropsMap,
  type EditorDoc,
  type SummaryRow,
} from "../src/lib/editor-schema";
import { writeCell, type CellRef } from "../src/lib/editor-cell";

let checks = 0;
function check(actual: unknown, expected: unknown, message: string) {
  assert.deepEqual(actual, expected, message);
  checks += 1;
}

/** 블록 목록으로 문서 하나를 만든다 (캔버스 크기는 판정에 관여하지 않는다) */
function docOf(blocks: Block[]): EditorDoc {
  return { version: 1, canvas: { w: 794, h: 1123, pages: 1 }, blocks };
}

/** 품목표 블록 — 행·요약행을 주입한다 */
function itemTable(
  rows: { quantity: number; unitPrice: number }[],
  summaryRows: { label: string; formula: string }[] = [],
): Block {
  const block = createBlock("itemTable");
  const props = block.props as BlockPropsMap["itemTable"];
  props.rows = rows.map((row) => ({
    id: uid(),
    name: "품목",
    description: "",
    quantity: row.quantity,
    unitPrice: row.unitPrice,
  }));
  props.summaryRows = summaryRows.map((row) => ({ id: uid(), ...row }));
  return block;
}

// ── ① 품목표가 아예 없으면 금액 근거가 없다 ──
// 계약서·NDA 는 품목표 없이 금액만 갖는 것이 정상이다. 이때 0 을 돌려주면
// 저장측이 그것을 "0원"으로 오해해 저장된 금액을 지운다.
check(
  deriveAmount(docOf([createBlock("title"), createBlock("text")])),
  null,
  "품목표 블록이 없으면 null (금액 근거 없음)",
);
check(deriveAmount(docOf([])), null, "블록이 아예 없어도 null");

// ── ② 품목표가 있는데 비어 있으면 진짜 0원 ──
check(
  deriveAmount(docOf([itemTable([])])),
  0,
  "빈 품목표는 0 — 사용자가 품목을 비운 결과이므로 0 이 맞다",
);

// ── 합계 계산 ──
check(
  deriveAmount(docOf([itemTable([{ quantity: 2, unitPrice: 1_500_000 }])])),
  3_000_000,
  "수량 × 단가",
);
check(
  deriveAmount(
    docOf([
      itemTable([{ quantity: 1, unitPrice: 1_000_000 }]),
      itemTable([{ quantity: 3, unitPrice: 2_000_000 }]),
    ]),
  ),
  7_000_000,
  "품목표가 여러 개면 모두 더한다",
);

// ── ③ 요약행(수식)이 있으면 마지막 요약행이 합계를 대신한다 ──
check(
  deriveAmount(
    docOf([
      itemTable(
        [{ quantity: 1, unitPrice: 10_000_000 }],
        [
          { label: "공급가액", formula: "subtotal" },
          { label: "부가세", formula: "subtotal * 0.1" },
          { label: "합계", formula: "subtotal * 1.1" },
        ],
      ),
    ]),
  ),
  11_000_000,
  "요약행이 있으면 마지막 요약행 값이 총액이다 (부가세 포함)",
);

// ── ④ 품목 없이 금액만 있는 문서 — seedTemplate 이 근거를 만든다 ──
const seededWithAmount = seedTemplate({
  type: "CONTRACT",
  clientName: "커머스",
  supplierName: "레인메이커",
  items: [],
  amount: 12_000_000,
});
check(
  deriveAmount(seededWithAmount),
  12_000_000,
  "품목이 없고 금액만 있으면 근거 1행을 시드해 캔버스 합계가 저장 금액과 같아진다",
);

// 직렬화 → 저장 → 파싱 왕복 후에도 금액이 남아야 한다 (실제 저장 경로와 같은 왕복)
const roundTripped = parseContentJson(JSON.stringify(seededWithAmount));
assert.ok(roundTripped, "왕복 후 파싱 결과가 있어야 한다");
check(
  deriveAmount(roundTripped),
  12_000_000,
  "직렬화 왕복 후에도 금액이 보존된다 — 저장 한 번에 0 으로 떨어지지 않는다",
);

// 금액이 없으면 근거 행을 만들지 않는다 (NDA 처럼 금액 0 인 문서)
check(
  deriveAmount(
    seedTemplate({
      type: "NDA",
      clientName: "누리테크",
      supplierName: "레인메이커",
      items: [],
      amount: 0,
    }),
  ),
  0,
  "금액이 0 이면 근거 행을 만들지 않는다 (빈 품목표 → 0)",
);

// 품목이 있으면 amount 는 무시하고 품목을 따른다 (품목이 언제나 우선하는 근거다)
check(
  deriveAmount(
    seedTemplate({
      type: "QUOTE",
      clientName: "다올테크",
      supplierName: "레인메이커",
      items: [
        { name: "라이선스", description: null, quantity: 2, unitPrice: 1_000_000 },
      ],
      amount: 99_999_999,
    }),
  ),
  2_000_000,
  "품목이 있으면 amount 를 쓰지 않는다 — 품목표가 단일 근거다",
);

// ── ⑤ 표시용 computeAmount 는 0 으로 평탄화한다 ──
check(
  computeAmount(docOf([createBlock("text")])),
  0,
  "표시용 computeAmount 는 근거가 없어도 0 을 준다 (저장에는 deriveAmount 를 쓴다)",
);

// ─────────────────────────────────────────────────────────────────────────────
// ⑥ 캔버스에서 단가·수량을 고치면 부가세·합계·문서 금액이 따라온다
//
// 사용자 증상 진술: "단가·수량을 캔버스에서 고치면 부가세가 안 따라오거나 깨진다."
// 캔버스 커밋 경로(`writeCell`)를 그대로 태워 **값으로** 확인한다 — 화면 컴포넌트가
// 아니라 이 순수 함수가 단일 기준이므로, 여기서 맞으면 캔버스·인쇄·저장이 모두 맞는다.
// ─────────────────────────────────────────────────────────────────────────────

const PRICE: CellRef = { kind: "item", row: 0, field: "unitPrice" };
const QTY: CellRef = { kind: "item", row: 0, field: "quantity" };

/** 부가세 프리셋을 얹은 품목표 (총계 표식은 마지막 `합계` 행) */
function vatTable(quantity: number, unitPrice: number): Block {
  return itemTable(
    [{ quantity, unitPrice }],
    [
      { label: "공급가액", formula: "subtotal" },
      { label: "부가세 (10%)", formula: "subtotal * 0.1" },
      { label: "합계 (VAT 포함)", formula: "subtotal * 1.1" },
    ],
  );
}

/** 요약행 라벨 → 평가값 (부가세가 따라왔는지 값으로 본다) */
function summaryValues(block: Block): Record<string, number> {
  return Object.fromEntries(
    evalSummaryRows(block.props as BlockPropsMap["itemTable"]).map(
      ({ row, value }) => [row.label, value],
    ),
  );
}

const before = vatTable(2, 1_200_000);
check(
  summaryValues(before),
  { 공급가액: 2_400_000, "부가세 (10%)": 240_000, "합계 (VAT 포함)": 2_640_000 },
  "출발점: 2 × 1,200,000 = 2,400,000 / VAT 240,000 / 합계 2,640,000",
);

// 단가를 캔버스에서 3,000,000 으로 고친다 (사용자는 쉼표를 넣어 입력한다)
const priced = writeCell(before, PRICE, "3,000,000");
check(
  (priced.props as BlockPropsMap["itemTable"]).rows[0].unitPrice,
  3_000_000,
  "쉼표가 섞인 입력도 정수로 읽는다",
);
check(
  summaryValues(priced),
  { 공급가액: 6_000_000, "부가세 (10%)": 600_000, "합계 (VAT 포함)": 6_600_000 },
  "단가를 고치면 부가세·합계가 그 자리에서 따라온다",
);
check(deriveAmount(docOf([priced])), 6_600_000, "문서 금액도 새 합계를 따른다");

// 수량을 캔버스에서 5 로 고친다
const requantified = writeCell(priced, QTY, "5");
check(
  summaryValues(requantified),
  { 공급가액: 15_000_000, "부가세 (10%)": 1_500_000, "합계 (VAT 포함)": 16_500_000 },
  "수량을 고쳐도 부가세·합계가 따라온다",
);
check(deriveAmount(docOf([requantified])), 16_500_000, "문서 금액도 따라온다");

// 화면에 보이는 통화 표기를 그대로 되돌려 넣어도 값이 밀리지 않는다 (왕복)
check(
  summaryValues(writeCell(priced, PRICE, "₩3,000,000")),
  summaryValues(priced),
  "통화 표기를 그대로 다시 넣어도 금액이 그대로다 (₩·쉼표를 걷어낸다)",
);

// 저장 왕복(직렬화 → 파싱) 후에도 같은 금액이다 — 화면 표시와 저장 결과가 어긋나지 않는다
const savedDoc = parseContentJson(JSON.stringify(docOf([requantified])));
assert.ok(savedDoc, "왕복 후 문서가 파싱된다");
check(
  deriveAmount(savedDoc),
  16_500_000,
  "캔버스에서 고친 금액이 저장 왕복 뒤에도 같다 (서버 PATCH 가 쓰는 경로와 동일)",
);

// ─────────────────────────────────────────────────────────────────────────────
// ⑦ 숫자 입력 파싱은 한 규칙이다 — 소수점이 값을 10배로 만들지 않는다
//
// 예전에는 캔버스가 숫자 아닌 글자를 **지웠고**(`1200000.5` → `12000005`, 10배!),
// 인스펙터는 `Math.trunc(Number(v))`(→ `1200000`) 였다. 어디서 고쳤는지에 따라 단가가
// 달라지면 그 위에 얹힌 부가세·합계·문서 금액이 전부 어긋난다.
// ─────────────────────────────────────────────────────────────────────────────

check(parseIntInput("1200000.5"), 1_200_000, "소수점 뒤는 버린다 (지우지 않는다)");
check(parseIntInput("2.5"), 2, "수량의 소수점도 버린다 — 25 가 되면 금액이 10배다");
check(parseIntInput("1,200,000.00"), 1_200_000, "쉼표+소수점이 섞여도 자릿수가 늘지 않는다");
check(parseIntInput("₩3,000,000 원"), 3_000_000, "통화기호·단위·공백을 걷어낸다");
check(parseIntInput(""), 0, "빈 입력은 0");
check(parseIntInput("-500"), 0, "음수는 0 (수량·단가가 음수인 견적서는 없다)");
check(parseIntInput("abc"), 0, "숫자가 없으면 0");

// 캔버스 커밋도 같은 규칙을 쓴다 (`writeCell` → `parseIntInput`)
check(
  (writeCell(before, PRICE, "1200000.5").props as BlockPropsMap["itemTable"])
    .rows[0].unitPrice,
  parseIntInput("1200000.5"),
  "캔버스 커밋과 인스펙터 입력이 같은 값을 만든다 (파싱 규칙이 한 곳이다)",
);
check(
  summaryValues(writeCell(before, QTY, "2.5")),
  { 공급가액: 2_400_000, "부가세 (10%)": 240_000, "합계 (VAT 포함)": 2_640_000 },
  "수량에 2.5 를 넣어도 25 로 튀지 않는다 (예전에는 부가세가 10배가 됐다)",
);

// ─────────────────────────────────────────────────────────────────────────────
// ⑧ 문서 금액이 되는 요약행은 **표식**이 정한다
//
// 예전에는 무조건 마지막 요약행이었다 — 사용자가 `공급가액` → `부가세` 순서로만 넣으면
// 문서 금액이 **부가세 금액**이 되고, 확정 문서를 통해 기회 예상 금액까지 내려갔다.
// ─────────────────────────────────────────────────────────────────────────────

const handMade = itemTable(
  [{ quantity: 1, unitPrice: 10_000_000 }],
  [
    { label: "공급가액", formula: "subtotal" },
    { label: "부가세", formula: "subtotal * 0.1" },
  ],
);
const handProps = handMade.props as BlockPropsMap["itemTable"];

// 표식이 없으면 예전 규약(마지막 행)을 그대로 따른다 — 이미 저장된 금액이 달라지지 않는다
check(
  itemTableGrandTotal(handProps),
  1_000_000,
  "표식이 없으면 마지막 행 — 예전 문서의 금액을 그대로 재현한다(치유 전)",
);

// 사용자가 `공급가액` 을 문서 금액으로 지정하면(인스펙터의 [문서 금액]) 그 행이 총계다
const marked: SummaryRow[] = normalizeSummaryRows(
  handProps.summaryRows.map((row) => ({ ...row, isTotal: row.label === "공급가액" })),
);
check(marked.filter((row) => row.isTotal).length, 1, "총계 표식은 정확히 1개다");
check(totalSummaryRow(marked)?.label, "공급가액", "표식이 붙은 행이 총계다");
check(
  itemTableGrandTotal({ ...handProps, summaryRows: marked }),
  10_000_000,
  "표식을 옮기면 문서 금액이 그 행 값이 된다 (부가세가 문서 금액이 되지 않는다)",
);

// 표식 뒤에 행을 더해도 금액이 옮겨가지 않는다 — 이것이 표식을 도입한 이유다
const appended = normalizeSummaryRows([
  ...marked,
  { id: uid(), label: "부가세 안내", formula: "subtotal * 0.1" },
]);
check(
  itemTableGrandTotal({ ...handProps, summaryRows: appended }),
  10_000_000,
  "요약행을 더해도 문서 금액이 새 행으로 옮겨가지 않는다",
);
check(
  totalSummaryRow(appended)?.label,
  "공급가액",
  "표식이 그대로 남는다 (마지막 행 규약이라면 여기서 금액이 뒤바뀐다)",
);

// 기존 contentJson 호환 — 표식이 없는 문서는 파싱할 때 **마지막 행**에 붙는다
const legacyJson = JSON.stringify(docOf([handMade]));
assert.ok(!legacyJson.includes("isTotal"), "예전 문서에는 표식이 없다");
const healed = parseContentJson(legacyJson);
assert.ok(healed, "예전 문서도 파싱된다");
const healedProps = healed.blocks[0].props as BlockPropsMap["itemTable"];
check(
  healedProps.summaryRows.map((row) => Boolean(row.isTotal)),
  [false, true],
  "표식이 없으면 마지막 행에 붙인다 (치유) — 저장된 금액이 달라지지 않는다",
);
check(
  deriveAmount(healed),
  1_000_000,
  "치유 뒤에도 문서 금액은 예전과 같다 (이 변경으로 금액이 소리 없이 달라지지 않는다)",
);

// 요약행이 없으면 품목 소계가 그대로 금액이다 (표식이 관여하지 않는다)
check(totalSummaryRow([]), null, "요약행이 없으면 총계 행도 없다");
check(totalSummaryRow(undefined), null, "요약행 자체가 없는 예전 문서도 안전하다");

// ─────────────────────────────────────────────────────────────────────────────
// ⑨ 수식이 알아볼 수 없는 글자를 담고 있으면 그 사실을 말한다
//
// 평가기는 못 읽는 토큰을 **조용히 버린다** — `subtotal * 10%` 는 소계의 10배가 되어
// 부가세 자리에 1억이 찍힌다(실측 1,000만원 견적서). 평가 규칙은 바꾸지 않는다
// (이미 저장된 금액이 달라지면 안 된다) — 대신 인스펙터가 이 판정을 옆에 적는다.
// ─────────────────────────────────────────────────────────────────────────────

check(formulaError("subtotal"), null, "변수만 있는 수식은 정상이다");
check(formulaError("subtotal * 1.1"), null, "소수 계수도 정상이다");
check(formulaError("(subtotal + 0) * 0.1"), null, "괄호가 맞으면 정상이다");
assert.ok(formulaError("subtotal * 10%"), "`%` 는 무시되므로 알린다 (소계의 10배가 된다)");
checks += 1;
assert.ok(formulaError("subtotal*.1"), "`.1` 의 점이 무시되므로 알린다 (× 1 이 된다)");
checks += 1;
assert.ok(formulaError("subtotal + 부가세"), "한글 변수는 무시되므로 알린다");
checks += 1;
assert.ok(formulaError("vat * 0.1"), "쓸 수 없는 변수는 0 이 되므로 알린다");
checks += 1;
assert.ok(formulaError("(subtotal * 1.1"), "괄호가 맞지 않으면 알린다");
checks += 1;
assert.ok(formulaError("   "), "빈 수식도 알린다 (금액이 0 이 된다)");
checks += 1;

console.log(`✅ 에디터 금액 도출 검증 통과 — ${checks}건`);
