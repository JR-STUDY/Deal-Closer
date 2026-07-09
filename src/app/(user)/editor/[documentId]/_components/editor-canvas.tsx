"use client";

import { useRef } from "react";
import type { DragEvent } from "react";
import type { EditorDoc, BlockType, ZOrderAction } from "@/lib/editor-schema";
import { BLOCK_TYPES, pageCount } from "@/lib/editor-schema";
import { CanvasBlock, type Geometry } from "./canvas-block";

type Props = {
  doc: EditorDoc;
  selectedId: string | null;
  onSelect: (id: string | null) => void;
  onGeometry: (id: string, geo: Geometry) => void;
  onAddBlock: (type: BlockType, pos: { x: number; y: number }) => void;
  onRemove: (id: string) => void;
  onZOrder: (id: string, action: ZOrderAction) => void;
};

export function EditorCanvas({
  doc,
  selectedId,
  onSelect,
  onGeometry,
  onAddBlock,
  onRemove,
  onZOrder,
}: Props) {
  const ref = useRef<HTMLDivElement>(null);
  const pages = pageCount(doc);
  const pageH = doc.canvas.h;

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
    <div className="flex flex-1 justify-center overflow-auto bg-muted/40 p-8">
      <div
        ref={ref}
        role="group"
        aria-label="문서 캔버스"
        onDragOver={(e) => e.preventDefault()}
        onDrop={handleDrop}
        onMouseDown={(e) => {
          // 블록 바깥(빈 캔버스)을 누르면 선택 해제
          if (!(e.target as HTMLElement).closest("[data-block-id]")) {
            onSelect(null);
          }
        }}
        className="relative shrink-0 bg-white shadow-sm ring-1 ring-border"
        style={{ width: doc.canvas.w, height: pageH * pages }}
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
        {doc.blocks.map((b) => (
          <CanvasBlock
            key={b.id}
            block={b}
            selected={b.id === selectedId}
            onSelect={onSelect}
            onGeometry={onGeometry}
            onRemove={onRemove}
            onZOrder={onZOrder}
          />
        ))}
      </div>
    </div>
  );
}
