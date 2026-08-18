/**
 * 다중선택 정렬·이동 검증 — `@/lib/block-align` + `reorderZMany` (네트워크·DB 없이).
 * 실행: pnpm test:block-align
 *
 * 정렬 패널·그룹 드래그·방향키가 같은 순수 함수를 쓰므로 이 판정이 곧 세 경로의 판정이다.
 *  ① 정렬 기준은 **선택 영역 바운딩 박스**이고, 2개 미만이면 아무 일도 없다
 *  ② 분할은 양 끝을 고정하고 사이 간격을 균등하게 만든다 (3개 미만이면 변화 없음)
 *  ③ 그룹 이동은 **묶음째** 가둔다 — 한 블록이 벽에 닿으면 전체가 멈춘다
 *  ④ 마퀴는 **닿기만 해도** 선택한다 (어느 방향으로 끌어도 같다)
 *  ⑤ reorderZMany 는 선택 **내부의 상대 순서를 보존**하고 z 를 1..n 으로 유지한다
 *  ⑥ 여러 페이지에 걸친 선택도 문서 좌표로 정렬된다 (막지 않는다 — 되돌리기가 있다)
 */

import assert from "node:assert/strict";
import {
  alignBlocks,
  blocksInRect,
  distributeBlocks,
  selectionBounds,
  translateBlocks,
} from "../src/lib/block-align";
import { reorderZMany, type Block } from "../src/lib/editor-schema";

let checks = 0;
function check(actual: unknown, expected: unknown, message: string) {
  assert.deepEqual(actual, expected, message);
  checks += 1;
}
function ok(condition: boolean, message: string) {
  assert.ok(condition, message);
  checks += 1;
}

/** 좌표만 중요한 테스트용 블록 */
function b(
  id: string,
  x: number,
  y: number,
  w = 100,
  h = 50,
  z = 1,
): Block {
  return {
    id,
    type: "text",
    x,
    y,
    w,
    h,
    z,
    locked: false,
    props: { text: id, align: "left", fontSize: 12, fontFamily: "sans", color: "#000", border: false, borderColor: "#000" },
  } as Block;
}

const pos = (blocks: Block[], id: string) => {
  const found = blocks.find((k) => k.id === id);
  return found ? { x: found.x, y: found.y } : null;
};

const A4 = { w: 794, h: 1123 };

// ─────────────────── ① 정렬은 바운딩 박스 기준 ───────────────────

// A(10,10,100x50) B(200,100,60x80) C(120,300,140x20)
//  → bbox x 10..260 (w 250), y 10..320 (h 310)
const three = [b("A", 10, 10), b("B", 200, 100, 60, 80), b("C", 120, 300, 140, 20)];
const ids3 = ["A", "B", "C"];

check(
  selectionBounds(three, ids3),
  { x: 10, y: 10, w: 250, h: 310 },
  "바운딩 박스는 선택 전체를 감싼다",
);
check(selectionBounds(three, []), null, "선택이 없으면 바운딩 박스도 없다");

const left = alignBlocks(three, ids3, "left");
check(
  ids3.map((id) => pos(left, id)?.x),
  [10, 10, 10],
  "왼쪽 정렬 — x 가 모두 bbox 왼쪽",
);
check(
  ids3.map((id) => pos(left, id)?.y),
  [10, 100, 300],
  "왼쪽 정렬은 y 를 건드리지 않는다",
);

const right = alignBlocks(three, ids3, "right");
check(
  ids3.map((id) => pos(right, id)?.x),
  [160, 200, 120],
  "오른쪽 정렬 — 오른쪽 변(260)이 맞고 폭이 다르면 x 도 다르다",
);

const centerX = alignBlocks(three, ids3, "centerX");
// bbox 중앙 x = 135 → 각 블록 중앙이 135
check(
  ids3.map((id) => (pos(centerX, id)?.x ?? 0) + (id === "A" ? 50 : id === "B" ? 30 : 70)),
  [135, 135, 135],
  "가운데 정렬 — 각 블록의 중앙이 bbox 중앙과 같다",
);

const top = alignBlocks(three, ids3, "top");
check(
  ids3.map((id) => pos(top, id)?.y),
  [10, 10, 10],
  "위 정렬 — y 가 모두 bbox 위",
);
const bottom = alignBlocks(three, ids3, "bottom");
check(
  ids3.map((id) => (pos(bottom, id)?.y ?? 0) + (id === "A" ? 50 : id === "B" ? 80 : 20)),
  [320, 320, 320],
  "아래 정렬 — 아래 변(320)이 맞는다",
);
const middleY = alignBlocks(three, ids3, "middleY");
check(
  ids3.map((id) => (pos(middleY, id)?.y ?? 0) + (id === "A" ? 25 : id === "B" ? 40 : 10)),
  [165, 165, 165],
  "중앙 정렬 — 각 블록의 중앙이 bbox 중앙(165)과 같다",
);

ok(
  alignBlocks(three, ["A"], "left") === three,
  "1개 선택은 정렬할 대상이 없다 — 입력을 그대로 돌려준다",
);
ok(alignBlocks(three, [], "left") === three, "선택 0개도 그대로");
ok(
  alignBlocks(three, ["A", "없는id"], "left") === three,
  "없는 id 는 버려지므로 실질 1개 → 변화 없음",
);

// 이미 맞은 블록은 **같은 객체**로 돌려줘야 memo 가 유지된다
const already = [b("A", 40, 10), b("B", 40, 200)];
const alignedTwice = alignBlocks(already, ["A", "B"], "left");
ok(
  alignedTwice[0] === already[0] && alignedTwice[1] === already[1],
  "좌표가 안 바뀌면 원래 블록 객체를 그대로 준다",
);

// ─────────────────── ② 분할 — 양 끝 고정 · 간격 균등 ───────────────────

// x: 0(w50) · 100(w50) · 300(w50) → span 0..350, 점유 150, 여유 200, 간격 100
const spread = [b("L", 0, 0, 50), b("M", 100, 0, 50), b("R", 300, 0, 50)];
const distX = distributeBlocks(spread, ["L", "M", "R"], "x");
check(
  ["L", "M", "R"].map((id) => pos(distX, id)?.x),
  [0, 150, 300],
  "가로 균등 — 가운데가 150 으로 옮겨지고 간격이 100 씩 같다",
);
ok(
  pos(distX, "L")?.x === 0 && pos(distX, "R")?.x === 300,
  "양 끝 블록은 움직이지 않는다",
);
ok(
  distributeBlocks(spread, ["L", "M"], "x") === spread,
  "2개는 분할할 사이가 없다 — 그대로",
);

const spreadY = [b("T", 0, 0, 50, 20), b("C", 0, 30, 50, 20), b("B2", 0, 200, 50, 20)];
const distY = distributeBlocks(spreadY, ["T", "C", "B2"], "y");
check(
  ["T", "C", "B2"].map((id) => pos(distY, id)?.y),
  [0, 100, 200],
  "세로 균등 — y 간격이 같아진다",
);

// 좌표가 같은 블록이 섞여도 결과가 흔들리지 않아야 한다 (id 로 갈라 정렬)
const tie = [b("b1", 0, 0, 10), b("a1", 0, 0, 10), b("z1", 100, 0, 10)];
check(
  distributeBlocks(tie, ["b1", "a1", "z1"], "x").map((k) => k.x),
  distributeBlocks(tie, ["z1", "b1", "a1"], "x").map((k) => k.x),
  "같은 좌표가 있어도 id 순으로 갈라 결과가 결정적이다",
);

// ─────────────────── ③ 그룹 이동은 묶음째 가둔다 ───────────────────

const pair = [b("P1", 100, 100), b("P2", 300, 400)];
const movedPair = translateBlocks(pair, ["P1", "P2"], 20, -30, A4);
check(
  ["P1", "P2"].map((id) => pos(movedPair, id)),
  [
    { x: 120, y: 70 },
    { x: 320, y: 370 },
  ],
  "선택 전체가 같은 델타로 움직인다",
);

// 왼쪽 벽: bbox.x = 100 이므로 -100 까지만 갈 수 있다
const hitLeft = translateBlocks(pair, ["P1", "P2"], -500, 0, A4);
check(
  ["P1", "P2"].map((id) => pos(hitLeft, id)),
  [
    { x: 0, y: 100 },
    { x: 200, y: 400 },
  ],
  "왼쪽 벽에 닿으면 **전체가 멈추고** 상대 배치(간격 200)가 유지된다",
);
ok(
  (pos(hitLeft, "P2")?.x ?? 0) - (pos(hitLeft, "P1")?.x ?? 0) === 200,
  "묶음째 클램프 — 블록마다 따로 가두면 이 간격이 무너진다",
);

// 오른쪽 벽: bbox 는 100..400 (w 300) → 최대 x 는 794-300 = 494 → dx 최대 394
const hitRight = translateBlocks(pair, ["P1", "P2"], 1000, 0, A4);
check(
  ["P1", "P2"].map((id) => pos(hitRight, id)?.x),
  [494, 694],
  "오른쪽 벽도 바운딩 박스 기준으로 멈춘다 (P2 오른쪽 변이 794)",
);

const wide = [b("W", 0, 0, 900, 50)];
check(
  translateBlocks(wide, ["W"], 100, 0, A4).map((k) => k.x),
  [0],
  "선택이 캔버스보다 넓으면 갈 수 있는 곳은 0 뿐이다 (음수 상한을 만들지 않는다)",
);
ok(
  translateBlocks(pair, ["P1", "P2"], 0, 0, A4) === pair,
  "이동량이 0 이면 입력을 그대로 — 불필요한 히스토리를 만들지 않는다",
);

// ─────────────────── ④ 마퀴는 닿기만 해도 선택 ───────────────────

const grid = [b("g1", 0, 0, 100, 100), b("g2", 200, 0, 100, 100), b("g3", 0, 200, 100, 100)];
check(
  blocksInRect(grid, { x: 50, y: 50, w: 200, h: 20 }),
  ["g1", "g2"],
  "걸치기만 해도 선택된다 (완전히 감싸지 않아도)",
);
check(
  blocksInRect(grid, { x: 400, y: 400, w: 50, h: 50 }),
  [],
  "완전히 밖이면 아무것도 선택되지 않는다",
);
check(
  blocksInRect(grid, { x: 250, y: 70, w: -200, h: -20 }),
  ["g1", "g2"],
  "오른쪽 아래 → 왼쪽 위로 끌어도 같게 판정한다",
);
check(
  blocksInRect(grid, { x: 0, y: 0, w: 300, h: 300 }),
  ["g1", "g2", "g3"],
  "결과는 문서 순서로 준다",
);
check(
  blocksInRect(grid, { x: 100, y: 0, w: 50, h: 100 }),
  [],
  "변이 맞닿기만 한 것은 선택하지 않는다 (닿는 면적이 없다)",
);

// ─────────────────── ⑤ 겹침 순서 — 상대 순서 보존 ───────────────────

const zs = [b("z1", 0, 0, 10, 10, 1), b("z2", 0, 0, 10, 10, 2), b("z3", 0, 0, 10, 10, 3), b("z4", 0, 0, 10, 10, 4)];
const zOf = (blocks: Block[]) => blocks.map((k) => `${k.id}:${k.z}`);

check(
  zOf(reorderZMany(zs, ["z1", "z2"], "front")),
  ["z1:3", "z2:4", "z3:1", "z4:2"],
  "맨 앞으로 — 고른 둘이 위로 가고 둘 사이 순서는 그대로",
);
check(
  zOf(reorderZMany(zs, ["z3", "z4"], "back")),
  ["z1:3", "z2:4", "z3:1", "z4:2"],
  "맨 뒤로 — 고른 둘이 아래로 가고 순서 보존",
);
check(
  zOf(reorderZMany(zs, ["z2", "z3"], "forward")),
  ["z1:1", "z2:3", "z3:4", "z4:2"],
  "앞으로 — 묶음 위의 비선택 블록(z4) 하나를 넘고 내부 순서는 유지",
);
check(
  zOf(reorderZMany(zs, ["z2", "z3"], "backward")),
  ["z1:3", "z2:1", "z3:2", "z4:4"],
  "뒤로 — 묶음이 z1 아래로 내려가고 내부 순서(z2 < z3)는 유지",
);

ok(
  reorderZMany(zs, ["z3", "z4"], "front") === zs,
  "이미 맨 앞이면 입력을 그대로 (히스토리를 만들지 않는다)",
);
ok(
  reorderZMany(zs, ["z1", "z2", "z3", "z4"], "front") === zs,
  "전부 선택하면 상대 순서가 바뀔 수 없다",
);
ok(reorderZMany(zs, [], "front") === zs, "선택 0개는 그대로");

/*
 * 하나씩 반복 호출하면 안 되는 이유를 고정한다.
 * z1·z2·z3 에서 z2·z3(=이미 맨 위 두 개)을 "앞으로" 보내면 **갈 곳이 없다**.
 * 묶음째 보면 제자리인데, 하나씩 부르면 z3 는 제자리 → 그다음 z2 가 z3 를 넘어가
 * **선택 내부 순서가 뒤집힌다**. 실제로 잘못될 수 있는 조합이라 테스트로 못박는다.
 */
{
  const trio = [
    b("t1", 0, 0, 10, 10, 1),
    b("t2", 0, 0, 10, 10, 2),
    b("t3", 0, 0, 10, 10, 3),
  ];
  const z = (blocks: Block[], id: string) => blocks.find((k) => k.id === id)?.z ?? 0;

  ok(
    reorderZMany(trio, ["t2", "t3"], "forward") === trio,
    "묶음째 — 이미 맨 앞인 두 블록은 앞으로 갈 곳이 없어 그대로다",
  );

  const oneByOne = reorderZMany(
    reorderZMany(trio, ["t3"], "forward"),
    ["t2"],
    "forward",
  );
  ok(
    z(oneByOne, "t2") > z(oneByOne, "t3"),
    "하나씩 부르면 t2 가 t3 위로 올라가 순서가 뒤집힌다 (묶음째 처리해야 하는 근거)",
  );
}

// ─────────────────── ⑥ 페이지를 걸친 선택 ───────────────────

// 1페이지(y 0..1123) 블록과 2페이지(y 1123..) 블록을 위 정렬하면 2페이지 것이 올라온다.
// 사용자가 그렇게 고른 결과이고 ⌘Z 로 되돌아가므로 막지 않는다 — 이 동작을 고정한다.
const crossPage = [b("p1", 40, 200), b("p2", 40, 1300)];
const crossTop = alignBlocks(crossPage, ["p1", "p2"], "top");
check(
  ["p1", "p2"].map((id) => pos(crossTop, id)?.y),
  [200, 200],
  "페이지를 걸친 선택도 문서 좌표로 정렬된다 (2페이지 블록이 1페이지로 올라온다)",
);

console.log(`✅ 다중선택 정렬·이동 검증 통과 — ${checks}건`);
