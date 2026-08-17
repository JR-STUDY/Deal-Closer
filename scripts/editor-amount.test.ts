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
 */

import assert from "node:assert/strict";
import {
  computeAmount,
  createBlock,
  deriveAmount,
  parseContentJson,
  seedTemplate,
  uid,
  type Block,
  type BlockPropsMap,
  type EditorDoc,
} from "../src/lib/editor-schema";

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

console.log(`✅ 에디터 금액 도출 검증 통과 — ${checks}건`);
