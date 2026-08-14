/**
 * 금액 내역 표기 검증 — `@/lib/amount-breakdown` (네트워크·DB 없이 순수 함수만).
 * 실행: pnpm test:amount-breakdown
 *
 * 기회 상세의 예상 금액 옆에 "공급가액 · 부가세" 를 비추는 판단이 여기 모여 있다.
 * 이 판정이 흔들리면 **문서가 말하지 않은 금액을 화면이 주장하게 된다.** 그래서 다음을 본다.
 *  ① 요약 행이 없으면 `subtotal` — 금액이 품목 소계라 부가세가 들어갈 자리가 없다
 *  ② 마지막 요약 행은 예상 금액과 같은 값이라 **값은 빼고 라벨만**(`totalLabel`) 남긴다
 *  ③ 라벨은 문서가 적은 그대로 옮긴다 (우리가 고쳐 쓰거나 분류하지 않는다)
 *  ④ 줄이 많으면 4줄까지 펼치고 나머지는 `hidden` 으로 접는다
 *  ⑤ 설명할 수 없으면 `unknown` — 파싱 실패 · 품목표 없음/둘 이상 · 총계 불일치
 */

import assert from "node:assert/strict";
import {
  AMOUNT_BREAKDOWN_VISIBLE_MAX,
  amountBreakdown,
} from "../src/lib/amount-breakdown";

let checks = 0;
function check(actual: unknown, expected: unknown, message: string) {
  assert.deepEqual(actual, expected, message);
  checks += 1;
}
function ok(condition: boolean, message: string) {
  assert.ok(condition, message);
  checks += 1;
}

/** `{ kind: "unknown" }` — 비교마다 새 객체를 만들어 참조 공유를 피한다 */
function unknown() {
  return { kind: "unknown" };
}

type Summary = { label: string; formula: string };
type Table = {
  rows: { quantity: number; unitPrice: number }[];
  summaries: Summary[];
};

/** 품목표 블록 하나 — `parseContentJson` 이 요구하는 최소 스키마를 갖춘다 */
function tableBlock(table: Table, index: number) {
  return {
    id: `block-${index}`,
    type: "itemTable",
    x: 40,
    y: 40 + index * 240,
    w: 714,
    h: 220,
    z: 1,
    locked: false,
    props: {
      showTotal: true,
      extraColumns: [],
      rows: table.rows.map((row, i) => ({
        id: `row-${index}-${i}`,
        name: `품목 ${i + 1}`,
        description: "",
        quantity: row.quantity,
        unitPrice: row.unitPrice,
      })),
      summaryRows: table.summaries.map((summary, i) => ({
        id: `sum-${index}-${i}`,
        ...summary,
      })),
    },
  };
}

/** 문서 본문(contentJson) 문자열 — 품목표를 원하는 개수만큼 담는다 */
function docJson(...tables: Table[]): string {
  return JSON.stringify({
    version: 1,
    canvas: { w: 794, h: 1123, pages: 1 },
    blocks: tables.map(tableBlock),
  });
}

/** 1,000만원짜리 품목 한 줄 (수량 1 × 단가 10,000,000) */
const ROWS = [{ quantity: 1, unitPrice: 10_000_000 }];

// ── ① 요약 행이 없으면 금액은 품목 소계다 ────────────────────────────────────
check(
  amountBreakdown(docJson({ rows: ROWS, summaries: [] }), 10_000_000),
  { kind: "subtotal" },
  "요약 행이 하나도 없으면 금액이 품목 소계이므로 subtotal 로 떨어진다",
);

// ── ② 요약 행 1줄 — 마지막 행이자 유일한 행이라 나열할 줄이 없고 라벨만 남는다 ──
check(
  amountBreakdown(
    docJson({ rows: ROWS, summaries: [{ label: "합계", formula: "subtotal" }] }),
    10_000_000,
  ),
  { kind: "rows", totalLabel: "합계", lines: [], hidden: [] },
  "요약 행이 1줄이면 그 행은 예상 금액 자체라 값은 빼고 라벨만 남는다",
);

// ── ③ 기본 프리셋(공급가액·부가세·합계) — 앞 두 줄이 나열되고 마지막은 라벨로 ──
const PRESET = docJson({
  rows: [{ quantity: 1, unitPrice: 92_000_000 }],
  summaries: [
    { label: "공급가액", formula: "subtotal" },
    { label: "부가세 (10%)", formula: "subtotal * 0.1" },
    { label: "합계 (VAT 포함)", formula: "subtotal * 1.1" },
  ],
});
check(
  amountBreakdown(PRESET, 101_200_000),
  {
    kind: "rows",
    totalLabel: "합계 (VAT 포함)",
    lines: [
      { id: "sum-0-0", label: "공급가액", value: 92_000_000 },
      { id: "sum-0-1", label: "부가세 (10%)", value: 9_200_000 },
    ],
    hidden: [],
  },
  "부가세 포함 프리셋은 공급가액·부가세가 나열되고 합계는 라벨로만 남는다",
);

// 라벨은 문서가 적은 그대로다 — 우리가 `부가세` 로 다듬거나 분류하지 않는다
check(
  amountBreakdown(
    docJson({
      rows: ROWS,
      summaries: [
        { label: "물품대금", formula: "subtotal" },
        { label: "세액 (면세)", formula: "0" },
        { label: "총 청구액", formula: "subtotal" },
      ],
    }),
    10_000_000,
  ),
  {
    kind: "rows",
    totalLabel: "총 청구액",
    lines: [
      { id: "sum-0-0", label: "물품대금", value: 10_000_000 },
      { id: "sum-0-1", label: "세액 (면세)", value: 0 },
    ],
    hidden: [],
  },
  "문서가 쓴 라벨을 그대로 옮긴다 (부가세라는 낱말이 없어도 손대지 않는다)",
);

// 비워 둔 라벨도 그대로 둔다 — 없는 이름을 우리가 지어내지 않는다
check(
  amountBreakdown(
    docJson({
      rows: ROWS,
      summaries: [
        { label: "", formula: "subtotal" },
        { label: "", formula: "subtotal" },
      ],
    }),
    10_000_000,
  ),
  {
    kind: "rows",
    totalLabel: "",
    lines: [{ id: "sum-0-0", label: "", value: 10_000_000 }],
    hidden: [],
  },
  "라벨이 비어 있어도 문서 그대로 빈 문자열을 넘긴다",
);

// 값은 KRW 정수로 반올림한다 (FORM_CURRENCY_KRW)
const ROUNDED = amountBreakdown(
  docJson({
    rows: [{ quantity: 3, unitPrice: 33_333 }],
    summaries: [
      { label: "공급가액", formula: "subtotal" },
      { label: "부가세", formula: "subtotal * 0.1" },
      { label: "합계", formula: "subtotal * 1.1" },
    ],
  }),
  // 99,999 * 1.1 = 109,998.9 → 반올림 109,999 (itemTableGrandTotal 과 같은 계산)
  109_999,
);
ok(ROUNDED.kind === "rows", "반올림 케이스도 요약 행으로 읽힌다");
if (ROUNDED.kind === "rows") {
  check(
    ROUNDED.lines.map((line) => line.value),
    [99_999, 10_000],
    "수식 결과는 정수로 반올림한다 (9,999.9 → 10,000)",
  );
}

// ── ④ 줄이 많으면 4줄까지 펼치고 나머지는 접는다 ─────────────────────────────
const MANY = amountBreakdown(
  docJson({
    rows: ROWS,
    summaries: [
      { label: "행1", formula: "subtotal" },
      { label: "행2", formula: "subtotal" },
      { label: "행3", formula: "subtotal" },
      { label: "행4", formula: "subtotal" },
      { label: "행5", formula: "subtotal" },
      { label: "행6", formula: "subtotal" },
      { label: "총계", formula: "subtotal" },
    ],
  }),
  10_000_000,
);
ok(MANY.kind === "rows", "요약 행이 많아도 rows 로 읽힌다");
if (MANY.kind === "rows") {
  check(
    MANY.lines.length,
    AMOUNT_BREAKDOWN_VISIBLE_MAX,
    "펼치는 줄은 상한까지만이다",
  );
  check(
    MANY.lines.map((line) => line.label),
    ["행1", "행2", "행3", "행4"],
    "앞에서부터 상한만큼 펼친다 (문서에 적힌 순서 그대로)",
  );
  check(
    MANY.hidden.map((line) => line.label),
    ["행5", "행6"],
    "상한을 넘은 줄은 hidden 으로 접어 툴팁에 담는다",
  );
  check(MANY.totalLabel, "총계", "마지막 행은 접히지 않고 라벨로 남는다");
}

// ── ⑤ 설명할 수 없으면 아무 말도 하지 않는다 ─────────────────────────────────
check(amountBreakdown(null, 0), unknown(), "contentJson 이 없으면 unknown 이다");
check(
  amountBreakdown(undefined, 0),
  unknown(),
  "contentJson 이 undefined 여도 unknown 이다",
);
check(amountBreakdown("", 0), unknown(), "빈 문자열도 unknown 이다");
check(amountBreakdown("{ 깨진 JSON", 0), unknown(), "파싱에 실패하면 unknown 이다");
check(
  amountBreakdown('{"blocks":"배열이 아님"}', 0),
  unknown(),
  "blocks 가 배열이 아니면 unknown 이다",
);
check(
  amountBreakdown(docJson(), 0),
  unknown(),
  "품목표가 없으면 금액의 출처가 본문에 없으므로 unknown 이다",
);
check(
  amountBreakdown(
    docJson(
      { rows: ROWS, summaries: [{ label: "합계", formula: "subtotal" }] },
      { rows: ROWS, summaries: [{ label: "합계", formula: "subtotal" }] },
    ),
    20_000_000,
  ),
  unknown(),
  "품목표가 둘 이상이면 금액이 합계라 어느 표의 요약 행도 설명이 되지 않는다",
);
check(
  amountBreakdown(PRESET, 92_000_000),
  unknown(),
  "본문에서 다시 계산한 총계가 넘겨받은 금액과 다르면 그 내역은 화면의 숫자를 설명하지 못한다",
);

// 파싱 실패가 `부가세 별도`(subtotal) 로 새지 않는지 못박는다 — 근거 없는 주장이 된다
ok(
  amountBreakdown("{ 깨진 JSON", 10_000_000).kind !== "subtotal",
  "본문을 읽지 못한 상태를 '부가세 별도' 로 단정하지 않는다",
);

console.log(`✅ 금액 내역 표기 검증 통과 — ${checks}건`);
