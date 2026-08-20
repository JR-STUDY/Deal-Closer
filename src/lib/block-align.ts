import type { Block } from "./editor-schema";

/**
 * 여러 블록의 정렬·분할·이동 **규칙** 순수 함수 (다중선택).
 *
 * 블록은 `(x, y, w, h)` 절대 좌표이므로 "여러 개를 맞춘다"는 것은 좌표를 다시 계산하는
 * 일이다. 그 계산을 컴포넌트가 하지 않는다 — 정렬 패널·그룹 드래그·방향키 이동이 같은
 * 함수를 써야 세 경로의 결과가 어긋나지 않는다(프로젝트의 순수 함수 단일 기준 관례).
 *
 * 기준은 **선택 영역의 바운딩 박스**다. "마지막에 고른 블록" 을 기준으로 삼는 방식도
 * 있지만, 무엇이 기준인지 화면으로 알 수 없어 결과를 예측할 수 없다.
 *
 * 이 모듈은 좌표만 다룬다 — 페이지 개념이 없다. 여러 페이지에 걸친 선택을 세로 정렬하면
 * 2페이지 블록이 1페이지로 올라올 수 있는데, 그것이 사용자가 고른 그대로의 결과이고
 * 되돌리기 한 번으로 복구되므로 막지 않는다(`scripts/block-align.test.ts` 가 고정한다).
 */

export type AlignMode =
  | "left"
  | "centerX"
  | "right"
  | "top"
  | "middleY"
  | "bottom";

export type DistributeAxis = "x" | "y";

export type Rect = { x: number; y: number; w: number; h: number };

/** 정렬은 2개 이상, 분할은 3개 이상일 때만 의미가 있다 */
export const MIN_ALIGN = 2;
export const MIN_DISTRIBUTE = 3;

/** id 목록에 해당하는 블록을 문서 순서대로 (없는 id 는 조용히 버린다) */
function pick(blocks: Block[], ids: readonly string[]): Block[] {
  const set = new Set(ids);
  return blocks.filter((b) => set.has(b.id));
}

/** 좌표만 바뀐 블록을 새로 만든다 — 값이 같으면 **원래 객체를 그대로** 돌려준다 (memo 유지) */
function withPosition(block: Block, x: number, y: number): Block {
  const nx = Math.round(x);
  const ny = Math.round(y);
  return nx === block.x && ny === block.y ? block : { ...block, x: nx, y: ny };
}

/** 선택 영역을 감싸는 사각형. 선택이 없으면 null */
export function selectionBounds(
  blocks: Block[],
  ids: readonly string[],
): Rect | null {
  const targets = pick(blocks, ids);
  if (targets.length === 0) return null;
  let left = Infinity;
  let top = Infinity;
  let right = -Infinity;
  let bottom = -Infinity;
  for (const b of targets) {
    left = Math.min(left, b.x);
    top = Math.min(top, b.y);
    right = Math.max(right, b.x + b.w);
    bottom = Math.max(bottom, b.y + b.h);
  }
  return { x: left, y: top, w: right - left, h: bottom - top };
}

/** 선택 블록을 바운딩 박스 기준으로 맞춘다 */
export function alignBlocks(
  blocks: Block[],
  ids: readonly string[],
  mode: AlignMode,
): Block[] {
  const targets = pick(blocks, ids);
  if (targets.length < MIN_ALIGN) return blocks;
  const bounds = selectionBounds(blocks, ids);
  if (!bounds) return blocks;

  const set = new Set(targets.map((b) => b.id));
  return blocks.map((b) => {
    if (!set.has(b.id)) return b;
    switch (mode) {
      case "left":
        return withPosition(b, bounds.x, b.y);
      case "centerX":
        return withPosition(b, bounds.x + (bounds.w - b.w) / 2, b.y);
      case "right":
        return withPosition(b, bounds.x + bounds.w - b.w, b.y);
      case "top":
        return withPosition(b, b.x, bounds.y);
      case "middleY":
        return withPosition(b, b.x, bounds.y + (bounds.h - b.h) / 2);
      case "bottom":
        return withPosition(b, b.x, bounds.y + bounds.h - b.h);
    }
  });
}

/**
 * 선택 블록 사이 간격을 균등하게 만든다.
 * **양 끝은 움직이지 않는다** — 끝까지 움직이면 선택 영역 자체가 바뀌어 "분할" 이 아니라
 * 다른 조작이 된다. 블록이 서로 겹쳐 여유 공간이 음수면 간격도 음수가 되는데, 그것이
 * 겹친 상태를 균등하게 나눈 결과다(별도로 막지 않는다).
 */
export function distributeBlocks(
  blocks: Block[],
  ids: readonly string[],
  axis: DistributeAxis,
): Block[] {
  const targets = pick(blocks, ids);
  if (targets.length < MIN_DISTRIBUTE) return blocks;

  const size = (b: Block) => (axis === "x" ? b.w : b.h);
  const start = (b: Block) => (axis === "x" ? b.x : b.y);

  // 좌표 순으로 세운다. 같은 좌표면 id 로 갈라 결과가 실행마다 달라지지 않게 한다
  const ordered = [...targets].sort(
    (a, b) => start(a) - start(b) || (a.id < b.id ? -1 : 1),
  );
  const first = ordered[0];
  const last = ordered[ordered.length - 1];
  const span = start(last) + size(last) - start(first);
  const occupied = ordered.reduce((sum, b) => sum + size(b), 0);
  const gap = (span - occupied) / (ordered.length - 1);

  // 첫 블록 끝에서부터 간격 + 블록 크기를 차례로 쌓는다 (마지막은 계산상 제자리)
  const moved = new Map<string, number>();
  let cursor = start(first) + size(first);
  for (let i = 1; i < ordered.length - 1; i++) {
    cursor += gap;
    moved.set(ordered[i].id, cursor);
    cursor += size(ordered[i]);
  }

  return blocks.map((b) => {
    const next = moved.get(b.id);
    if (next === undefined) return b;
    return axis === "x" ? withPosition(b, next, b.y) : withPosition(b, b.x, next);
  });
}

/**
 * 선택 블록을 함께 옮긴다.
 *
 * **묶음째 가둔다** — 블록마다 따로 클램프하면 벽에 닿은 것만 멈추고 나머지는 계속 가서
 * 배치가 찌그러진다. 한 블록이 캔버스 경계에 닿으면 그룹 전체가 그 자리에서 멈춘다.
 * 그룹 드래그 확정과 방향키 이동이 이 함수를 공유한다.
 */
export function translateBlocks(
  blocks: Block[],
  ids: readonly string[],
  dx: number,
  dy: number,
  canvas: { w: number; h: number },
): Block[] {
  const bounds = selectionBounds(blocks, ids);
  if (!bounds) return blocks;

  const limit = (delta: number, from: number, extent: number, max: number) => {
    // 선택 영역이 캔버스보다 크면 갈 수 있는 곳이 0 뿐이다 (음수 상한을 만들지 않는다)
    const room = Math.max(0, max - extent);
    return Math.max(-from, Math.min(delta, room - from));
  };
  const mx = Math.round(limit(dx, bounds.x, bounds.w, canvas.w));
  const my = Math.round(limit(dy, bounds.y, bounds.h, canvas.h));
  if (mx === 0 && my === 0) return blocks;

  const set = new Set(ids);
  return blocks.map((b) =>
    set.has(b.id) ? withPosition(b, b.x + mx, b.y + my) : b,
  );
}

/**
 * 사각형에 **닿는** 블록 id (문서 순서).
 *
 * 완전히 포함된 것만 고르는 방식도 있지만, 큰 블록을 고르려면 화면 밖까지 끌어야 해서
 * 실제로는 쓰기 어렵다 — 그림 도구들이 교차 판정을 쓰는 이유다.
 */
export function blocksInRect(blocks: Block[], rect: Rect): string[] {
  // 어느 방향으로 끌어도 같게 판정하도록 정규화한다
  const left = Math.min(rect.x, rect.x + rect.w);
  const right = Math.max(rect.x, rect.x + rect.w);
  const top = Math.min(rect.y, rect.y + rect.h);
  const bottom = Math.max(rect.y, rect.y + rect.h);
  return blocks
    .filter(
      (b) =>
        b.x < right && b.x + b.w > left && b.y < bottom && b.y + b.h > top,
    )
    .map((b) => b.id);
}
