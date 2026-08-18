/**
 * 표 셀 병합 검증 — `@/lib/editor-schema` 의 병합 순수 함수 (네트워크·DB 없이).
 * 실행: pnpm test:table-merge
 *
 * 병합은 좌표로 저장되는데 격자는 사용자가 행·열을 지우며 계속 변한다.
 * 걸러내지 못한 범위를 그대로 렌더하면 **colspan 합이 열 수를 넘어 표가 깨진다**.
 * 화면과 인쇄가 `tableLayout` 하나를 공유하므로 이 판정이 곧 두 렌더러의 판정이다.
 *  ① 격자 밖·1×1·음수 범위는 버린다
 *  ② 겹친 병합은 먼저 선언된 것이 이긴다 (사용자가 만든 순서를 존중)
 *  ③ tableLayout 이 시작 셀에 span 을, 덮인 셀에 skip 을 준다
 *  ④ 렌더되는 셀의 colSpan 합이 언제나 열 수와 같다 (표가 깨지지 않는 불변식)
 *  ⑤ 행·열 삭제 시 병합 좌표가 따라 옮겨진다
 *  ⑥ merges 가 없는 기존 문서는 병합 없이 그대로 그려진다
 */

import assert from "node:assert/strict";
import {
  MIN_COL_PERCENT,
  normalizeColWidths,
  normalizeMerges,
  resizeTableColumn,
  shiftMergesOnColDelete,
  shiftMergesOnRowDelete,
  tableLayout,
  type BlockPropsMap,
  type TableMerge,
} from "../src/lib/editor-schema";

let checks = 0;
function check(actual: unknown, expected: unknown, message: string) {
  assert.deepEqual(actual, expected, message);
  checks += 1;
}
function ok(condition: boolean, message: string) {
  assert.ok(condition, message);
  checks += 1;
}

/** rows×cols 격자 표 (셀 값은 "r,c") */
function grid(rows: number, cols: number, merges?: TableMerge[]) {
  return {
    hasHeader: false,
    cells: Array.from({ length: rows }, (_, r) =>
      Array.from({ length: cols }, (_, c) => `${r},${c}`),
    ),
    colAligns: Array.from({ length: cols }, () => "left" as const),
    ...(merges ? { merges } : {}),
  } satisfies BlockPropsMap["table"];
}

// ── ① 못 쓰는 범위는 버린다 ──
check(normalizeMerges([{ r: 0, c: 0, rs: 1, cs: 1 }], 3, 3), [], "1×1 은 병합이 아니다");
check(normalizeMerges([{ r: 0, c: 2, rs: 1, cs: 2 }], 3, 3), [], "열 밖으로 삐져나가면 버린다");
check(normalizeMerges([{ r: 2, c: 0, rs: 2, cs: 2 }], 3, 3), [], "행 밖으로 삐져나가면 버린다");
check(normalizeMerges([{ r: -1, c: 0, rs: 2, cs: 2 }], 3, 3), [], "음수 좌표는 버린다");
check(normalizeMerges([{ r: 0, c: 0, rs: 0, cs: 2 }], 3, 3), [], "크기 0 은 버린다");
check(normalizeMerges(undefined, 3, 3), [], "merges 가 없으면 빈 배열");
check(normalizeMerges([{ r: 0, c: 0, rs: 2, cs: 2 }], 0, 0), [], "빈 표에는 병합이 없다");

check(
  normalizeMerges([{ r: 0, c: 0, rs: 2, cs: 2 }], 3, 3),
  [{ r: 0, c: 0, rs: 2, cs: 2 }],
  "격자 안의 2×2 는 남는다",
);

// ── ② 겹치면 먼저 선언된 것이 이긴다 ──
check(
  normalizeMerges(
    [
      { r: 0, c: 0, rs: 2, cs: 2 },
      { r: 1, c: 1, rs: 2, cs: 2 }, // (1,1) 이 이미 덮였다
    ],
    3,
    3,
  ),
  [{ r: 0, c: 0, rs: 2, cs: 2 }],
  "겹친 병합은 뒤에 온 쪽을 버린다",
);
check(
  normalizeMerges(
    [
      { r: 0, c: 0, rs: 1, cs: 2 },
      { r: 1, c: 0, rs: 1, cs: 2 }, // 다른 행 — 겹치지 않는다
    ],
    3,
    3,
  ),
  [
    { r: 0, c: 0, rs: 1, cs: 2 },
    { r: 1, c: 0, rs: 1, cs: 2 },
  ],
  "겹치지 않는 병합은 여러 개 남는다",
);

// ── ③ tableLayout 의 span·skip ──
const merged = tableLayout(grid(3, 3, [{ r: 0, c: 0, rs: 2, cs: 2 }]));
check(merged.layout[0][0], { skip: false, rowSpan: 2, colSpan: 2 }, "시작 셀에 span");
check(merged.layout[0][1], { skip: true, rowSpan: 1, colSpan: 1 }, "오른쪽 덮인 셀은 skip");
check(merged.layout[1][0], { skip: true, rowSpan: 1, colSpan: 1 }, "아래 덮인 셀은 skip");
check(merged.layout[1][1], { skip: true, rowSpan: 1, colSpan: 1 }, "대각선 덮인 셀도 skip");
check(merged.layout[0][2], { skip: false, rowSpan: 1, colSpan: 1 }, "범위 밖 셀은 그대로");
check(merged.layout[2][0], { skip: false, rowSpan: 1, colSpan: 1 }, "범위 아래 셀은 그대로");

// ── ④ 불변식: 각 행에서 실제로 그려지는 칸 수의 합이 열 수와 같다 ──
function occupiedPerRow(props: BlockPropsMap["table"]): number[] {
  const { cells, layout } = tableLayout(props);
  const cols = cells.reduce((m, row) => Math.max(m, row.length), 0);
  const counts = new Array(cells.length).fill(0);
  cells.forEach((row, r) =>
    row.forEach((_, c) => {
      const cell = layout[r][c];
      if (cell.skip) return;
      // 이 셀이 차지하는 모든 행에 colSpan 만큼 더한다
      for (let i = r; i < r + cell.rowSpan; i++) counts[i] += cell.colSpan;
    }),
  );
  return counts.map((n) => n - cols);
}

for (const [label, props] of [
  ["병합 없음", grid(3, 3)],
  ["2×2 병합", grid(3, 3, [{ r: 0, c: 0, rs: 2, cs: 2 }])],
  ["가로 3칸", grid(3, 3, [{ r: 1, c: 0, rs: 1, cs: 3 }])],
  ["세로 3칸", grid(3, 3, [{ r: 0, c: 2, rs: 3, cs: 1 }])],
  ["병합 2개", grid(4, 4, [
    { r: 0, c: 0, rs: 2, cs: 2 },
    { r: 2, c: 2, rs: 2, cs: 2 },
  ])],
  ["겹친 병합(하나는 버려짐)", grid(3, 3, [
    { r: 0, c: 0, rs: 2, cs: 2 },
    { r: 1, c: 1, rs: 2, cs: 2 },
  ])],
] as const) {
  check(
    occupiedPerRow(props),
    props.cells.map(() => 0),
    `${label}: 모든 행의 칸 수 합이 열 수와 같다 (표가 깨지지 않는다)`,
  );
}

// ── ⑤ 행·열 삭제 시 병합 보정 ──
const wide: TableMerge = { r: 1, c: 1, rs: 2, cs: 2 };
check(
  shiftMergesOnRowDelete([wide], 0),
  [{ r: 0, c: 1, rs: 2, cs: 2 }],
  "위쪽 행을 지우면 병합이 위로 당겨진다",
);
check(
  shiftMergesOnRowDelete([wide], 1),
  [{ r: 1, c: 1, rs: 1, cs: 2 }],
  "범위에 걸친 행을 지우면 한 행 줄어든다",
);
check(
  shiftMergesOnRowDelete([wide], 3),
  [wide],
  "범위 아래 행을 지우면 병합은 그대로",
);
check(
  shiftMergesOnRowDelete([{ r: 0, c: 0, rs: 2, cs: 1 }], 0),
  [],
  "2×1 병합에서 한 행을 지우면 1×1 이 되므로 병합이 사라진다",
);
check(
  shiftMergesOnColDelete([wide], 0),
  [{ r: 1, c: 0, rs: 2, cs: 2 }],
  "왼쪽 열을 지우면 병합이 왼쪽으로 당겨진다",
);
check(
  shiftMergesOnColDelete([wide], 2),
  [{ r: 1, c: 1, rs: 2, cs: 1 }],
  "범위에 걸친 열을 지우면 한 열 줄어든다",
);
check(shiftMergesOnColDelete(undefined, 0), [], "병합이 없으면 빈 배열");

// 삭제 보정 결과가 다시 normalizeMerges 를 통과한다 (격자 밖을 가리키지 않는다)
const afterDelete = shiftMergesOnRowDelete([wide], 0);
check(
  normalizeMerges(afterDelete, 3, 4),
  afterDelete,
  "보정된 병합은 줄어든 격자에서도 유효하다",
);

// ── ⑥ 기존 문서(merges 없음) ──
const plain = tableLayout(grid(2, 2));
check(plain.merges, [], "merges 가 없는 문서는 병합 없음");
ok(
  plain.layout.every((row) => row.every((c) => !c.skip && c.rowSpan === 1 && c.colSpan === 1)),
  "merges 가 없으면 모든 셀이 1×1 로 그대로 그려진다 (하위 호환)",
);


// ─────────────────── ⑦ 열 폭 (colWidths) ───────────────────
// 폭은 %로 저장한다 — px 로 두면 블록 폭을 줄일 때 합이 넘쳐 마지막 열이 잘린다.

check(
  normalizeColWidths(undefined, 4),
  [25, 25, 25, 25],
  "저장된 폭이 없으면 균등 분배",
);
check(normalizeColWidths([50, 50], 3), [100 / 3, 100 / 3, 100 / 3],
  "열 개수와 길이가 다르면(행·열 추가/삭제) 균등으로 되돌린다");
check(normalizeColWidths([], 0), [], "열이 없으면 빈 배열");
{
  const sum = normalizeColWidths([10, 10, 10], 3).reduce((a, b) => a + b, 0);
  ok(Math.abs(sum - 100) < 1e-9, "합이 100 으로 맞춰진다 (30 → 100)");
}
check(
  normalizeColWidths([60, -5, 0], 3).map((w) => Math.round(w)),
  [47, 26, 26],
  "음수·0 은 균등값으로 치유하고 다시 100 으로 정규화한다",
);

// 경계를 끌면 그 열이 커지고 **바로 오른쪽 열만** 작아진다 (합 100 유지)
check(
  resizeTableColumn([25, 25, 25, 25], 1, 10),
  [25, 35, 15, 25],
  "경계 이동 — 왼쪽 열이 커지고 오른쪽 열이 그만큼 작아진다",
);
{
  const before = [25, 25, 25, 25];
  const after = resizeTableColumn(before, 1, 10);
  ok(
    Math.abs(after.reduce((a, b) => a + b, 0) - 100) < 1e-9,
    "이동 후에도 합이 100 이라 표 폭이 변하지 않는다",
  );
}
check(
  resizeTableColumn([25, 25, 25, 25], 1, 100),
  [25, 46, MIN_COL_PERCENT, 25],
  "오른쪽 열은 최소 폭까지만 줄어든다 (글자가 한 자도 안 들어가면 다시 잡을 수 없다)",
);
check(
  resizeTableColumn([25, 25, 25, 25], 1, -100),
  [25, MIN_COL_PERCENT, 46, 25],
  "왼쪽으로 끌 때도 최소 폭을 지킨다",
);
check(
  resizeTableColumn([50, 50], 1, 10),
  [50, 50],
  "마지막 열 오른쪽에는 경계가 없다 — 그대로 돌려준다",
);
check(resizeTableColumn([50, 50], -1, 10), [50, 50], "범위 밖 경계도 그대로");

console.log(`✅ 표 셀 병합·열 폭 검증 통과 — ${checks}건`);
