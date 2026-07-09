"use client";

import { useRef, useState } from "react";
import type { DragEvent } from "react";
import type { EditorDoc, BlockType, ZOrderAction, Block } from "@/lib/editor-schema";
import { BLOCK_TYPES, pageCount } from "@/lib/editor-schema";
import { CanvasBlock, type Geometry } from "./canvas-block";
import { useAutoHideScroll } from "./use-auto-hide-scroll";

type Props = {
  doc: EditorDoc;
  selectedId: string | null;
  onSelect: (id: string | null) => void;
  onGeometry: (id: string, geo: Geometry) => void;
  onAddBlock: (type: BlockType, pos: { x: number; y: number }) => void;
  onRemove: (id: string) => void;
  onZOrder: (id: string, action: ZOrderAction) => void;
  onEdit: (id: string) => void;
  onViewTop: (y: number) => void;
};

const SNAP_GAP = 6; // 정렬 가이드/스냅 허용 오차(px)

export function EditorCanvas({
  doc,
  selectedId,
  onSelect,
  onGeometry,
  onAddBlock,
  onRemove,
  onZOrder,
  onEdit,
  onViewTop,
}: Props) {
  const ref = useRef<HTMLDivElement>(null);
  const autoHide = useAutoHideScroll();

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

  // 특정 블록을 제외한 정렬 기준선(다른 블록의 좌/중앙/우·상/중앙/하 + 캔버스·페이지 경계)
  function targets(excludeId: string) {
    const xs = [0, doc.canvas.w / 2, doc.canvas.w];
    const ys: number[] = [];
    for (let i = 0; i <= pages; i++) ys.push(i * pageH);
    for (const b of doc.blocks) {
      if (b.id === excludeId) continue;
      xs.push(b.x, b.x + b.w / 2, b.x + b.w);
      ys.push(b.y, b.y + b.h / 2, b.y + b.h);
    }
    return { xs, ys };
  }

  function handleDragMove(block: Block, x: number, y: number) {
    const { xs, ys } = targets(block.id);
    const xEdges = [x, x + block.w / 2, x + block.w];
    const yEdges = [y, y + block.h / 2, y + block.h];
    const gx = xs.filter((t) => xEdges.some((e) => Math.abs(e - t) <= SNAP_GAP));
    const gy = ys.filter((t) => yEdges.some((e) => Math.abs(e - t) <= SNAP_GAP));
    setGuides({ x: [...new Set(gx)], y: [...new Set(gy)] });
  }

  function handleDragEnd(block: Block, x: number, y: number) {
    const { xs, ys } = targets(block.id);
    const snap = (pos: number, offsets: number[], ts: number[]) => {
      let best = SNAP_GAP + 1;
      for (const off of offsets)
        for (const t of ts) {
          const d = t - (pos + off);
          if (Math.abs(d) < Math.abs(best)) best = d;
        }
      return Math.abs(best) <= SNAP_GAP ? pos + best : pos;
    };
    const nx = Math.max(0, Math.round(snap(x, [0, block.w / 2, block.w], xs)));
    const ny = Math.max(0, Math.round(snap(y, [0, block.h / 2, block.h], ys)));
    onGeometry(block.id, { x: nx, y: ny, w: block.w, h: block.h });
    setGuides({ x: [], y: [] });
  }

  function handleDrop(e: DragEvent<HTMLDivElement>) {
    e.preventDefault();
    const type = e.dataTransfer.getData("application/x-block-type") as BlockType;
    if (!BLOCK_TYPES.includes(type)) return;
    const rect = ref.current?.getBoundingClientRect();
    const x = rect ? Math.max(0, e.clientX - rect.left) : 40;
    const y = rect ? Math.max(0, e.clientY - rect.top) : 40;
    onAddBlock(type, { x, y });
  }

  return (
    <div
      className="overlay-scroll flex min-h-0 flex-1 justify-center overflow-auto bg-muted/40 p-8"
      onScroll={handleScroll}
    >
      <div
        ref={ref}
        role="group"
        aria-label="문서 캔버스"
        onDragOver={(e) => e.preventDefault()}
        onDrop={handleDrop}
        onMouseDown={(e) => {
          if (!(e.target as HTMLElement).closest("[data-block-id]")) {
            onSelect(null);
          }
        }}
        className="relative shrink-0 bg-white shadow-sm ring-1 ring-border"
        style={{ width: doc.canvas.w, height: totalH }}
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

        {doc.blocks.map((b) => (
          <CanvasBlock
            key={b.id}
            block={b}
            selected={b.id === selectedId}
            onSelect={onSelect}
            onGeometry={onGeometry}
            onRemove={onRemove}
            onZOrder={onZOrder}
            onEdit={onEdit}
            onDragMove={handleDragMove}
            onDragEnd={handleDragEnd}
          />
        ))}
      </div>
    </div>
  );
}
