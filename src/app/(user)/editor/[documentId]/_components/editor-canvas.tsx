"use client";

import { useRef } from "react";
import type { DragEvent } from "react";
import type { EditorDoc, BlockType, ZOrderAction } from "@/lib/editor-schema";
import { BLOCK_TYPES } from "@/lib/editor-schema";
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
        style={{ width: doc.canvas.w, height: doc.canvas.h }}
      >
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
