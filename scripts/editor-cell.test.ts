/**
 * 캔버스 칸 편집 규칙 검증 — `@/lib/editor-cell` (네트워크·DB 없이).
 * 실행: pnpm test:editor-cell
 *
 * 이 표가 왜 필요한가: 예전에는 커밋 경로가 종류마다 따로여서 **표처럼 보이는데
 * 편집만 안 되는 칸**이 생겼다(공급자 정보·거래처 정보 전체, 품목표의 추가 열 머리글과
 * 요약행 라벨). 규칙을 순수 함수로 모았으니 그 경계를 여기서 고정한다.
 *
 *  ① 캔버스에 **글자로 보이는** 값은 모두 고칠 수 있다 — 새 텍스트 속성을 스키마에
 *     추가하고 칸을 열지 않으면 ⑦ 의 누락 검사가 실패한다
 *  ② 계산 결과(금액·요약값)와 고정 머리글에는 칸이 없다
 *  ③ 수량·단가는 정수로 저장된다 (`1,500,000 원` 도 받는다)
 *  ④ 없는 칸(지운 행·열·필드)에 쓰면 문서가 그대로다
 *  ⑤ 표시값과 저장값은 단가에서만 갈린다 (`₩` 가 저장되지 않는다)
 *  ⑥ `sameCell` 은 같은 좌표만 같다고 본다
 *  ⑦ **누락 검사** — 모든 칸에 새 값을 쓰면 예전 값이 남지 않는다
 */

import assert from "node:assert/strict";
import {
  displayCell,
  editableCells,
  extraField,
  hasEditableCells,
  isWholeBlockEditable,
  readCell,
  sameCell,
  writeCell,
  type CellRef,
} from "../src/lib/editor-cell";
import type { Block, BlockPropsMap } from "../src/lib/editor-schema";

let checks = 0;
function check(actual: unknown, expected: unknown, message: string) {
  assert.deepEqual(actual, expected, message);
  checks += 1;
}
function ok(condition: boolean, message: string) {
  assert.ok(condition, message);
  checks += 1;
}

/** 테스트용 블록 — 좌표는 이 모듈과 무관하다 */
function block<T extends Block["type"]>(
  type: T,
  props: BlockPropsMap[T],
): Block {
  return {
    id: `b-${type}`,
    type,
    x: 0,
    y: 0,
    w: 200,
    h: 100,
    z: 1,
    locked: false,
    props: props as Block["props"],
  };
}

const OLD = "OLD";

function textBlock() {
  return block("text", {
    text: OLD,
    align: "left",
    fontSize: 12,
    fontFamily: "sans",
    color: "#000000",
    border: false,
    borderColor: "#000000",
  });
}

function supplierBlock() {
  return block("supplier", {
    labelWidth: 70,
    fields: [
      { id: "f1", label: OLD, value: OLD },
      { id: "f2", label: OLD, value: "" },
    ],
  });
}

function clientMetaBlock() {
  return block("clientMeta", {
    labelWidth: 80,
    fields: [{ id: "c1", label: OLD, value: OLD }],
  });
}

function gridBlock() {
  return block("table", {
    hasHeader: true,
    cells: [
      [OLD, OLD],
      [OLD, ""],
    ],
    colAligns: ["left", "right"],
  });
}

function itemBlock() {
  return block("itemTable", {
    showTotal: true,
    extraColumns: [{ id: "col1", label: OLD, align: "left" }],
    summaryRows: [{ id: "s1", label: OLD, formula: "subtotal*0.1" }],
    rows: [
      {
        id: "r1",
        name: OLD,
        description: OLD,
        quantity: 2,
        unitPrice: 1_200_000,
        extra: { col1: OLD },
      },
    ],
  });
}

// ─────────────────── ① 인스펙터에서 고치는 글자는 캔버스에서도 고친다 ───────────────────

// 이 목록이 회귀의 핵심이다. 공급자·거래처는 예전에 **한 칸도** 열려 있지 않았다.
check(
  editableCells(supplierBlock()).map((r) =>
    r.kind === "metaField" ? `${r.fieldId}.${r.part}` : r.kind,
  ),
  ["f1.label", "f1.value", "f2.label", "f2.value"],
  "공급자 정보의 라벨·값 네 칸이 모두 열린다 (예전에는 인스펙터뿐이었다)",
);
check(
  editableCells(clientMetaBlock()).length,
  2,
  "거래처·견적 정보도 같은 규칙을 쓴다 (필드 1개 → 라벨·값 2칸)",
);
ok(
  hasEditableCells(supplierBlock()) && hasEditableCells(clientMetaBlock()),
  "두 정보 블록은 칸 단위 편집 블록으로 분류된다",
);
ok(
  !isWholeBlockEditable(supplierBlock()),
  "정보 블록은 블록 전체 편집 대상이 아니다 (칸마다 다른 값이다)",
);
ok(
  isWholeBlockEditable(textBlock()) && !hasEditableCells(textBlock()),
  "텍스트 블록은 반대로 블록 전체가 한 칸이다",
);

// 품목표: 추가 열 머리글과 요약행 라벨도 예전에는 인스펙터에만 있었다
const itemKinds = editableCells(itemBlock()).map((r) => r.kind);
ok(
  itemKinds.includes("itemColumn"),
  "품목표 추가 열 머리글이 열린다 (예전 누락)",
);
ok(
  itemKinds.includes("itemSummary"),
  "품목표 요약행 라벨이 열린다 (예전 누락)",
);
check(
  editableCells(itemBlock()).filter((r) => r.kind === "item").map((r) =>
    r.kind === "item" ? r.field : "",
  ),
  ["name", "description", extraField("col1"), "quantity", "unitPrice"],
  "품목 행은 이름·설명·추가열·수량·단가 순서로 열린다 (그리는 순서와 같다)",
);

// 격자 표는 헤더 행까지 모든 칸이 열린다 (2×2 = 4)
check(editableCells(gridBlock()).length, 4, "격자 표는 모든 칸이 열린다");

// 이미지·구분선은 글자가 없다
check(
  editableCells(block("divider", {
    orientation: "horizontal",
    color: "#000",
    thickness: 1,
    dashed: false,
  })),
  [],
  "구분선에는 고칠 글자가 없다",
);

// ─────────────────── ② 계산 결과·고정 머리글에는 칸이 없다 ───────────────────

// 금액(수량×단가)과 요약행의 **값**을 가리키는 CellRef 종류가 아예 없다.
// 있으면 근거와 어긋난 숫자가 문서에 남고 기회 예상 금액까지 내려간다(기회-6).
ok(
  !editableCells(itemBlock()).some(
    (r) => r.kind === "item" && (r.field === "amount" || r.field === "total"),
  ),
  "금액 칸은 열리지 않는다 (수량×단가 결과다)",
);
// 요약행은 라벨만 열린다 — 값(수식 결과)은 열리지 않는다
check(
  editableCells(itemBlock())
    .filter((r) => r.kind === "itemSummary")
    .map((r) => (r.kind === "itemSummary" ? r.summaryId : "")),
  ["s1"],
  "요약행은 라벨 한 칸만 열린다 (값은 수식 결과)",
);
// 수식 자체는 캔버스에 글자로 보이지 않으므로 칸이 없다 (인스펙터에서만 고친다)
ok(
  readCell(itemBlock(), {
    kind: "itemSummary",
    summaryId: "s1",
  }) === OLD,
  "요약행 칸이 가리키는 것은 라벨이다 (수식이 아니다)",
);

// ─────────────────── ③ 수량·단가는 정수 ───────────────────

const priced = writeCell(itemBlock(), { kind: "item", row: 0, field: "unitPrice" }, "1,500,000 원");
check(
  (priced.props as BlockPropsMap["itemTable"]).rows[0].unitPrice,
  1_500_000,
  "통화기호·쉼표·단위를 걷어내고 정수로 저장한다",
);
check(
  (
    writeCell(itemBlock(), { kind: "item", row: 0, field: "quantity" }, "abc")
      .props as BlockPropsMap["itemTable"]
  ).rows[0].quantity,
  0,
  "숫자가 없으면 0 이다 (NaN 이 합계로 번지지 않게)",
);
check(
  (
    writeCell(itemBlock(), { kind: "item", row: 0, field: "quantity" }, "-5")
      .props as BlockPropsMap["itemTable"]
  ).rows[0].quantity,
  0,
  "음수 수량은 0 으로 본다",
);
// 이어붙기 사고 재현 방지 — 저장값이 **교체**되어야 한다 (600000001500000 사건)
ok(
  (priced.props as BlockPropsMap["itemTable"]).rows[0].unitPrice < 10_000_000,
  "단가는 덧붙지 않고 교체된다",
);

// ─────────────────── ④ 없는 칸에 쓰면 문서가 그대로다 ───────────────────

// 지운 행·열·필드를 가리키는 칸과, 블록 종류가 맞지 않는 칸.
// 둘 다 조용히 버려야 한다 — 화면이 종류를 다시 판단하지 않아도 되게(판단은 순수 함수 한곳).
const missing: { ref: CellRef; on: () => Block; why: string }[] = [
  { ref: { kind: "cell", r: 9, c: 0 }, on: gridBlock, why: "없는 행" },
  { ref: { kind: "cell", r: 0, c: 9 }, on: gridBlock, why: "없는 열" },
  { ref: { kind: "item", row: 9, field: "name" }, on: itemBlock, why: "없는 품목 행" },
  { ref: { kind: "item", row: 0, field: "extra:없는열" }, on: itemBlock, why: "없는 추가 열 값" },
  { ref: { kind: "itemColumn", colId: "없는열" }, on: itemBlock, why: "없는 추가 열" },
  { ref: { kind: "itemSummary", summaryId: "없는요약" }, on: itemBlock, why: "없는 요약행" },
  { ref: { kind: "metaField", fieldId: "없는필드", part: "value" }, on: supplierBlock, why: "없는 필드" },
  { ref: { kind: "cell", r: 0, c: 0 }, on: supplierBlock, why: "표 좌표를 정보 블록에 쓴 실수" },
  { ref: { kind: "metaField", fieldId: "f1", part: "value" }, on: gridBlock, why: "정보 필드를 표에 쓴 실수" },
  { ref: { kind: "block" }, on: gridBlock, why: "표는 블록 전체 편집 대상이 아니다" },
];
for (const { ref, on, why } of missing) {
  const before = on();
  check(readCell(before, ref), null, `없는 칸은 읽을 수 없다 — ${why}`);
  ok(
    writeCell(before, ref, "NEW") === before,
    `없는 칸에 쓰면 **같은 객체**를 돌려준다 (불필요한 리렌더·미저장 표시 방지) — ${why}`,
  );
}

// 열을 지운 뒤 남아 있던 extra 값은 고칠 수 없다 (열이 없으면 그 칸도 없다)
const orphan = itemBlock();
(orphan.props as BlockPropsMap["itemTable"]).extraColumns = [];
check(
  readCell(orphan, { kind: "item", row: 0, field: extraField("col1") }),
  null,
  "정의되지 않은 열의 값은 칸이 아니다",
);

// ─────────────────── ⑤ 표시값과 저장값 ───────────────────

check(
  readCell(itemBlock(), { kind: "item", row: 0, field: "unitPrice" }),
  "1200000",
  "저장값은 숫자 문자열이다 (편집칸에 이것이 들어간다)",
);
check(
  displayCell(itemBlock(), { kind: "item", row: 0, field: "unitPrice" }),
  "₩1,200,000",
  "표시값은 통화 형식이다",
);
check(
  displayCell(itemBlock(), { kind: "item", row: 0, field: "quantity" }),
  "2",
  "수량은 표시값과 저장값이 같다",
);
// 표시값을 그대로 저장하면 ₩ 가 값에 섞인다 — readCell 을 편집칸에 쓰는 이유
check(
  (
    writeCell(
      itemBlock(),
      { kind: "item", row: 0, field: "unitPrice" },
      displayCell(itemBlock(), { kind: "item", row: 0, field: "unitPrice" }) ?? "",
    ).props as BlockPropsMap["itemTable"]
  ).rows[0].unitPrice,
  1_200_000,
  "표시값을 되돌려 써도 같은 정수가 된다 (₩·쉼표를 걷어낸다)",
);

// ─────────────────── ⑥ sameCell ───────────────────

ok(sameCell({ kind: "cell", r: 1, c: 2 }, { kind: "cell", r: 1, c: 2 }), "같은 좌표는 같다");
ok(!sameCell({ kind: "cell", r: 1, c: 2 }, { kind: "cell", r: 2, c: 1 }), "행·열이 뒤바뀌면 다르다");
ok(
  !sameCell(
    { kind: "metaField", fieldId: "f1", part: "label" },
    { kind: "metaField", fieldId: "f1", part: "value" },
  ),
  "같은 필드의 라벨과 값은 **다른 칸**이다 (한쪽을 고칠 때 다른 쪽이 편집칸이 되면 안 된다)",
);
ok(!sameCell(null, null), "편집 중이 아니면 어떤 칸과도 같지 않다");
ok(!sameCell({ kind: "block" }, { kind: "cell", r: 0, c: 0 }), "종류가 다르면 다르다");
ok(sameCell({ kind: "block" }, { kind: "block" }), "블록 전체 편집은 좌표가 없다");

// ─────────────────── ⑦ 누락 검사 ───────────────────

/**
 * 캔버스에 **글자로 보이는** 값에는 모두 칸이 있어야 한다.
 *
 * 검사 방법: 모든 텍스트를 `OLD` 로 채운 블록의 **모든 칸**에 `NEW` 를 쓰고, props 에
 * `OLD` 가 남았는지 훑는다. 남았다면 화면에는 보이는데 고칠 수 없는 글자다.
 *
 * 스키마에 텍스트 속성을 새로 추가하면 이 검사가 먼저 실패한다 — 칸을 열든(권장)
 * 아래 `NOT_DISPLAYED` 에 이유를 적든, **결정을 하게** 만드는 것이 목적이다.
 */
const NOT_DISPLAYED: { path: RegExp; why: string }[] = [
  {
    path: /^summaryRows\.\d+\.formula$/,
    why: "수식은 캔버스에 글자로 보이지 않는다 (결과 금액만 보인다) — 인스펙터에서 고친다",
  },
];

function leftoverPaths(props: unknown, prefix = ""): string[] {
  if (typeof props === "string") return props.includes(OLD) ? [prefix] : [];
  if (Array.isArray(props)) {
    return props.flatMap((v, i) => leftoverPaths(v, prefix ? `${prefix}.${i}` : String(i)));
  }
  if (props && typeof props === "object") {
    return Object.entries(props).flatMap(([k, v]) =>
      leftoverPaths(v, prefix ? `${prefix}.${k}` : k),
    );
  }
  return [];
}

for (const make of [textBlock, supplierBlock, clientMetaBlock, gridBlock, itemBlock]) {
  const original = make();
  const filled = editableCells(original).reduce(
    (b, ref) => writeCell(b, ref, "NEW"),
    original,
  );
  const leftover = leftoverPaths(filled.props).filter(
    (p) => !NOT_DISPLAYED.some((x) => x.path.test(p)),
  );
  check(
    leftover,
    [],
    `${original.type}: 화면에 보이는 글자가 모두 고쳐진다 (남으면 편집 경로 누락)`,
  );
}

// 반대 방향 — 칸을 통해 쓴 값은 그 칸으로 다시 읽힌다 (왕복)
for (const make of [textBlock, supplierBlock, clientMetaBlock, gridBlock, itemBlock]) {
  const original = make();
  for (const ref of editableCells(original)) {
    const isNumeric =
      ref.kind === "item" && (ref.field === "quantity" || ref.field === "unitPrice");
    const written = isNumeric ? "7" : `값-${JSON.stringify(ref)}`;
    const next = writeCell(original, ref, written);
    check(
      readCell(next, ref),
      written,
      `${original.type}: 쓴 값이 같은 칸에서 그대로 읽힌다`,
    );
    ok(next !== original, `${original.type}: 값을 쓰면 새 블록이 된다 (불변 갱신)`);
  }
}

console.log(`✅ 캔버스 칸 편집 규칙 검증 통과 — ${checks}건`);
