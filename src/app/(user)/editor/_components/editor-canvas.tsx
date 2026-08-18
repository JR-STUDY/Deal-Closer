"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { DragEvent } from "react";
import type { EditorDoc, BlockType, ZOrderAction, Block } from "@/lib/editor-schema";
import { BLOCK_TYPES, pageCount } from "@/lib/editor-schema";
import { useMarquee } from "./use-marquee";
import { CanvasBlock, type Geometry } from "./canvas-block";
import type { EditTarget } from "./blocks";
import { useAutoHideScroll } from "./use-auto-hide-scroll";

type Props = {
  doc: EditorDoc;
  /** 본문이 잠긴 문서 — 드래그·리사이즈·드롭·블록 액션을 모두 막는다 (진단 3) */
  locked: boolean;
  /** 선택된 블록들 (다중선택) */
  selectedIds: string[];
  /** 블록 클릭 — `additive` 면 선택에 더하거나 뺀다. null 은 선택 해제 */
  onSelect: (id: string | null, additive: boolean) => void;
  /** 마퀴로 여러 개를 한 번에 고른다 — `additive` 면 기존 선택에 더한다 */
  onSelectMany: (ids: string[], additive: boolean) => void;
  onGeometry: (id: string, geo: Geometry) => void;
  /** 선택 전체를 같은 만큼 옮긴다 (그룹 드래그 확정) — 한 번의 편집 = 되돌리기 1건 */
  onTranslateSelected: (dx: number, dy: number) => void;
  onAddBlock: (type: BlockType, pos: { x: number; y: number }) => void;
  onRemove: (id: string) => void;
  onZOrder: (id: string, action: ZOrderAction) => void;
  onEdit: (id: string) => void;
  onViewTop: (y: number) => void;
  /** 블록 높이를 내용에 맞춘다 — 넘치면 늘리고 남으면 줄인다 (진단 4) */
  onFit: (id: string) => void;
  /** 블록별 잘림 상태 보고 — 툴바가 개수를 세고 저장 시 안내한다 */
  onClippedChange: (id: string, clipped: boolean) => void;
  /** 캔버스 인라인 편집 — 블록 전체 또는 표의 한 칸 (진단 5) */
  editTarget: EditTarget | null;
  onEditingChange: (target: EditTarget | null) => void;
  onInlineCommit: (id: string, text: string) => void;
  onCellCommit: (id: string, r: number, c: number, text: string) => void;
  onItemCommit: (id: string, row: number, field: string, text: string) => void;
  onResizeColumn: (
    id: string,
    index: number,
    deltaPercent: number,
    baseline: number[] | null,
  ) => void;
  onResizeRow: (
    id: string,
    index: number,
    deltaPx: number,
    measured: number,
  ) => void;
  /** 확대 배율. "fit" 이면 보이는 폭에 맞춘다 (진단 5) */
  zoom: number | "fit";
  /** 블록 복제·복사 (진단 5) */
  onDuplicate: (id: string) => void;
  onCopy: (id: string) => void;
};

const SNAP_GAP = 6; // 정렬 가이드/스냅 허용 오차(px)

export function EditorCanvas({
  doc,
  locked,
  selectedIds,
  onSelect,
  onSelectMany,
  onGeometry,
  onTranslateSelected,
  onAddBlock,
  onRemove,
  onZOrder,
  onEdit,
  onViewTop,
  onFit,
  onClippedChange,
  editTarget,
  onEditingChange,
  onInlineCommit,
  onCellCommit,
  onItemCommit,
  onResizeColumn,
  onResizeRow,
  zoom,
  onDuplicate,
  onCopy,
}: Props) {
  const ref = useRef<HTMLDivElement>(null);
  const viewportRef = useRef<HTMLDivElement>(null);
  const autoHide = useAutoHideScroll();

  /*
   * "폭 맞춤" 배율. 794px 캔버스는 1280 폭 화면에서 가로 스크롤이 걸린다
   * (뷰포트 736 < 캔버스 794) — 노트북에서 문서 한 장이 화면에 안 들어갔다.
   * 컨테이너 폭이 바뀔 때마다 다시 잰다.
   */
  const [fitScale, setFitScale] = useState(1);
  useEffect(() => {
    const node = viewportRef.current;
    if (!node) return;
    const measure = () => {
      // p-8(32px) 좌우 여백을 뺀 실제로 쓸 수 있는 폭
      const usable = node.clientWidth - 64;
      setFitScale(Math.min(1, Math.max(0.2, usable / doc.canvas.w)));
    };
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(node);
    return () => observer.disconnect();
  }, [doc.canvas.w]);

  const scale = zoom === "fit" ? fitScale : zoom;

  // 블록마다 배열을 훑지 않도록 한 번만 Set 으로 만든다
  const selection = useMemo(() => new Set(selectedIds), [selectedIds]);

  // 빈 캔버스에서 끌어 여러 개 고르기 — 판정·좌표 환산은 use-marquee 가 한다
  const clearSelection = useCallback(() => onSelect(null, false), [onSelect]);
  const { marquee, beginMarquee } = useMarquee({
    canvasRef: ref,
    scale,
    blocks: doc.blocks,
    onClear: clearSelection,
    onSelectMany,
  });

  function handleScroll(e: React.UIEvent<HTMLDivElement>) {
    autoHide(e);
    // p-8(32px) 만큼 캔버스가 안쪽에 있으므로 보정해 현재 뷰 상단 + 여백 위치를 보고
    onViewTop(Math.max(0, e.currentTarget.scrollTop - 32 + 40));
  }
  const pages = pageCount(doc);
  const pageH = doc.canvas.h;
  const totalH = pageH * pages;
  const [guides, setGuides] = useState<{ x: number[]; y: number[] }>({
    x: [],
    y: [],
  });

  /*
   * 여러 블록을 함께 끌 때의 이동량. 문서 상태는 건드리지 않고 **미리보기만** 한다 —
   * mousemove 마다 문서를 고치면 되돌리기 스택이 수백 건 쌓여 ⌘Z 가 쓸모없어진다.
   * 확정은 놓을 때 한 번뿐이다.
   */
  const [groupDrag, setGroupDrag] = useState<{
    /** 끌리는 블록 — 이 블록은 react-rnd 가 직접 움직이므로 미리보기에서 뺀다 */
    id: string;
    dx: number;
    dy: number;
  } | null>(null);

  /** 이 블록을 끌면 선택 전체가 함께 움직이는가 */
  const isGroupDrag = (id: string) => selection.size > 1 && selection.has(id);

  /*
   * 그룹을 끄는 동안 **다른 선택 블록도 함께 보이게** 좌표를 옮겨 그린다.
   * 끌리는 블록 자체는 react-rnd 가 이미 움직이고 있으므로 건드리지 않는다
   * (여기서 또 옮기면 이동량이 두 번 더해진다).
   * `CanvasBlock` 은 memo 라 좌표가 바뀐 선택 블록만 다시 그려진다.
   */
  const renderBlocks = useMemo(() => {
    if (!groupDrag) return doc.blocks;
    return doc.blocks.map((b) =>
      selection.has(b.id) && b.id !== groupDrag.id
        ? { ...b, x: b.x + groupDrag.dx, y: b.y + groupDrag.dy }
        : b,
    );
  }, [doc.blocks, groupDrag, selection]);

  /**
   * 정렬 기준선(다른 블록의 좌/중앙/우·상/중앙/하 + 캔버스·페이지 경계).
   * 함께 움직이는 블록은 **기준에서 뺀다** — 같이 따라오므로 영원히 붙지 않는다.
   */
  function targets(exclude: (block: Block) => boolean) {
    const xs = [0, doc.canvas.w / 2, doc.canvas.w];
    const ys: number[] = [];
    for (let i = 0; i <= pages; i++) ys.push(i * pageH);
    for (const b of doc.blocks) {
      if (exclude(b)) continue;
      xs.push(b.x, b.x + b.w / 2, b.x + b.w);
      ys.push(b.y, b.y + b.h / 2, b.y + b.h);
    }
    return { xs, ys };
  }

  /** 끌고 있는 블록(그룹이면 그 그룹 전체)을 기준선에서 제외하는 판별식 */
  function movingWith(id: string) {
    return isGroupDrag(id)
      ? (b: Block) => selection.has(b.id)
      : (b: Block) => b.id === id;
  }

  function handleDragMove(block: Block, x: number, y: number) {
    if (isGroupDrag(block.id)) {
      setGroupDrag({ id: block.id, dx: x - block.x, dy: y - block.y });
    }
    const { xs, ys } = targets(movingWith(block.id));
    const xEdges = [x, x + block.w / 2, x + block.w];
    const yEdges = [y, y + block.h / 2, y + block.h];
    const gx = xs.filter((t) => xEdges.some((e) => Math.abs(e - t) <= SNAP_GAP));
    const gy = ys.filter((t) => yEdges.some((e) => Math.abs(e - t) <= SNAP_GAP));
    setGuides({ x: [...new Set(gx)], y: [...new Set(gy)] });
  }

  function handleDragEnd(block: Block, x: number, y: number) {
    /*
     * 움직이지 않은 드래그는 **클릭**이다 — 여기서 스냅을 적용하면 선택만 했는데
     * 블록이 최대 SNAP_GAP(6px) 밀린다. 아래의 "위치 변화가 없으면 갱신하지 않는다"
     * 검사는 스냅 **이후** 값을 보기 때문에 이 경우를 잡지 못했다(스냅이 값을 바꿨으므로).
     * 되돌리기 스택도 클릭마다 쌓여 ⌘Z 가 아무 일도 안 하는 것처럼 보였다.
     */
    if (x === block.x && y === block.y) {
      setGuides({ x: [], y: [] });
      setGroupDrag(null);
      return;
    }
    const { xs, ys } = targets(movingWith(block.id));
    const snap = (pos: number, offsets: number[], ts: number[]) => {
      let best = SNAP_GAP + 1;
      for (const off of offsets)
        for (const t of ts) {
          const d = t - (pos + off);
          if (Math.abs(d) < Math.abs(best)) best = d;
        }
      return Math.abs(best) <= SNAP_GAP ? pos + best : pos;
    };
    // 캔버스 안으로 가둔다 — Rnd 의 bounds 대신 여기서 처리한다(배율과 충돌하지 않게)
    const clamp = (v: number, max: number) =>
      Math.max(0, Math.min(Math.round(v), Math.max(0, Math.round(max))));
    const nx = clamp(snap(x, [0, block.w / 2, block.w], xs), doc.canvas.w - block.w);
    const ny = clamp(snap(y, [0, block.h / 2, block.h], ys), totalH - block.h);
    setGuides({ x: [], y: [] });
    setGroupDrag(null);
    // 위치 변화가 없으면(단순 클릭) 갱신하지 않아 불필요한 dirty 를 막는다
    if (nx === block.x && ny === block.y) return;
    /*
     * 그룹이면 **끌린 블록의 스냅 결과로 정해진 이동량**을 선택 전체에 한 번에 적용한다.
     * 스냅을 각 블록에 따로 걸면 서로 다른 기준선에 붙어 상대 배치가 무너진다.
     * 캔버스 경계도 `translateBlocks` 가 묶음째 가둔다(개별 클램프는 배치를 찌그러뜨린다).
     */
    if (isGroupDrag(block.id)) {
      onTranslateSelected(nx - block.x, ny - block.y);
      return;
    }
    onGeometry(block.id, { x: nx, y: ny, w: block.w, h: block.h });
  }

  /** 리사이즈 중 정렬 가이드 — 드래그와 같은 기준선을 쓴다 (지금까지는 드래그에만 있었다) */
  function handleResizeMove(block: Block, geo: Geometry) {
    const { xs, ys } = targets((b) => b.id === block.id);
    const xEdges = [geo.x, geo.x + geo.w / 2, geo.x + geo.w];
    const yEdges = [geo.y, geo.y + geo.h / 2, geo.y + geo.h];
    const gx = xs.filter((t) => xEdges.some((e) => Math.abs(e - t) <= SNAP_GAP));
    const gy = ys.filter((t) => yEdges.some((e) => Math.abs(e - t) <= SNAP_GAP));
    setGuides({ x: [...new Set(gx)], y: [...new Set(gy)] });
  }

  /**
   * 리사이즈를 놓을 때 **끌던 모서리만** 기준선에 붙인다.
   * 위치까지 스냅하면 반대쪽 모서리가 따라 움직여 크기가 엉뚱하게 바뀐다.
   */
  function handleResizeEnd(block: Block, geo: Geometry) {
    setGuides({ x: [], y: [] });
    const { xs, ys } = targets((b) => b.id === block.id);
    const nearest = (value: number, ts: number[]) => {
      let best = value;
      let bestDistance = SNAP_GAP + 1;
      for (const t of ts) {
        const d = Math.abs(t - value);
        if (d < bestDistance) {
          bestDistance = d;
          best = t;
        }
      }
      return bestDistance <= SNAP_GAP ? best : value;
    };
    // 좌·상단이 그대로면 우·하단을 끈 것이다 → 그 모서리를 붙인다 (반대도 같은 원리)
    const movedLeft = Math.round(geo.x) !== block.x;
    const movedTop = Math.round(geo.y) !== block.y;

    let { x, y, w, h } = geo;
    if (movedLeft) {
      const right = x + w;
      x = nearest(x, xs);
      w = right - x;
    } else {
      w = nearest(x + w, xs) - x;
    }
    if (movedTop) {
      const bottom = y + h;
      y = nearest(y, ys);
      h = bottom - y;
    } else {
      h = nearest(y + h, ys) - y;
    }

    onGeometry(block.id, {
      x: Math.max(0, Math.round(x)),
      y: Math.max(0, Math.round(y)),
      w: Math.max(8, Math.round(w)),
      h: Math.max(8, Math.round(h)),
    });
  }

  function handleDrop(e: DragEvent<HTMLDivElement>) {
    e.preventDefault();
    if (locked) return;
    const type = e.dataTransfer.getData("application/x-block-type") as BlockType;
    if (!BLOCK_TYPES.includes(type)) return;
    const rect = ref.current?.getBoundingClientRect();
    // getBoundingClientRect 는 배율이 적용된 크기를 주므로 문서 좌표로 되돌린다
    const x = rect ? Math.max(0, (e.clientX - rect.left) / scale) : 40;
    const y = rect ? Math.max(0, (e.clientY - rect.top) / scale) : 40;
    onAddBlock(type, { x: Math.round(x), y: Math.round(y) });
  }

  return (
    <div
      ref={viewportRef}
      className="overlay-scroll flex min-h-0 flex-1 justify-center overflow-auto bg-muted/40 p-8"
      onScroll={handleScroll}
    >
      {/* 바깥 상자는 배율이 적용된 크기를 차지하고(스크롤 길이가 맞아야 한다),
          안쪽은 문서 좌표 그대로 그린 뒤 transform 으로 줄인다.
          Rnd 에도 같은 scale 을 넘겨야 드래그 좌표가 어긋나지 않는다. */}
      <div
        className="shrink-0"
        style={{ width: doc.canvas.w * scale, height: totalH * scale }}
      >
      <div
        ref={ref}
        style={{
          width: doc.canvas.w,
          height: totalH,
          transform: `scale(${scale})`,
          transformOrigin: "top left",
        }}
        // 블록을 고르는 목록 — 각 블록이 role="option" 이다 (canvas-block 주석 참고)
        role="listbox"
        // 여러 블록을 함께 고를 수 있다는 사실을 보조기기에도 알린다 (ACC_*)
        aria-multiselectable
        aria-label="문서 캔버스"
        onDragOver={(e) => e.preventDefault()}
        onDrop={handleDrop}
        onMouseDown={(e) => {
          // 블록 위가 아니면 마퀴를 시작한다 (선택 해제는 놓을 때 판단한다)
          if (!(e.target as HTMLElement).closest("[data-block-id]")) {
            onEditingChange(null);
            beginMarquee(e);
          }
        }}
        // isolate: 음수 z 블록이 흰 배경 뒤로 숨지 않게 stacking context 를 만든다
        className="relative isolate bg-white shadow-sm ring-1 ring-border"
      >
        {/* 페이지 구분선 + 페이지 번호 (#8) */}
        {Array.from({ length: pages }).map((_, i) => (
          <div
            key={i}
            className="pointer-events-none absolute inset-x-0"
            style={{ top: i * pageH, height: pageH }}
          >
            <span className="absolute right-1 top-1 rounded bg-muted px-1.5 py-0.5 text-[10px] text-muted-foreground">
              {i + 1} / {pages}
            </span>
            {i > 0 ? (
              <div className="absolute inset-x-0 top-0 border-t-2 border-dashed border-muted-foreground/40" />
            ) : null}
          </div>
        ))}

        {/* 정렬 가이드라인 (드래그 중) */}
        {guides.x.map((gx, i) => (
          <div
            key={`gx-${i}`}
            className="pointer-events-none absolute top-0 z-50 w-px bg-sky-500"
            style={{ left: gx, height: totalH }}
          />
        ))}
        {guides.y.map((gy, i) => (
          <div
            key={`gy-${i}`}
            className="pointer-events-none absolute left-0 z-50 h-px bg-sky-500"
            style={{ top: gy, width: doc.canvas.w }}
          />
        ))}

        {/* 마퀴 사각형 — 어느 방향으로 끌어도 그려지도록 좌표를 정규화한다 */}
        {marquee ? (
          <div
            className="pointer-events-none absolute z-50 border border-dashed border-sky-500 bg-sky-500/10"
            style={{
              left: Math.min(marquee.x, marquee.x + marquee.w),
              top: Math.min(marquee.y, marquee.y + marquee.h),
              width: Math.abs(marquee.w),
              height: Math.abs(marquee.h),
            }}
          />
        ) : null}

        {renderBlocks.map((b) => (
          <CanvasBlock
            key={b.id}
            block={b}
            locked={locked}
            selected={selection.has(b.id)}
            onSelect={onSelect}
            onRemove={onRemove}
            onZOrder={onZOrder}
            onEdit={onEdit}
            onDragMove={handleDragMove}
            onDragEnd={handleDragEnd}
            onResizeMove={handleResizeMove}
            onResizeEnd={handleResizeEnd}
            canvas={{ w: doc.canvas.w, h: totalH }}
            onFit={onFit}
            onClippedChange={onClippedChange}
            editTarget={editTarget}
            onEditingChange={onEditingChange}
            onInlineCommit={onInlineCommit}
            onCellCommit={onCellCommit}
            onItemCommit={onItemCommit}
            onResizeColumn={onResizeColumn}
            onResizeRow={onResizeRow}
            scale={scale}
            onDuplicate={onDuplicate}
            onCopy={onCopy}
          />
        ))}
      </div>
      </div>
    </div>
  );
}
