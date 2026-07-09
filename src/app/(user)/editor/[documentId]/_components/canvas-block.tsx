"use client";

import { memo } from "react";
import { Rnd } from "react-rnd";
import type { Block, ZOrderAction } from "@/lib/editor-schema";
import { BLOCK_LABELS } from "@/lib/editor-schema";
import {
  ContextMenu,
  ContextMenuTrigger,
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuSeparator,
} from "@/components/ui/context-menu";
import { Pencil, Trash2 } from "lucide-react";
import { renderBlock } from "./blocks";

export type Geometry = { x: number; y: number; w: number; h: number };

type Props = {
  block: Block;
  selected: boolean;
  onSelect: (id: string) => void;
  onGeometry: (id: string, geo: Geometry) => void;
  onRemove: (id: string) => void;
  onZOrder: (id: string, action: ZOrderAction) => void;
  onEdit: (id: string) => void;
  onDragMove: (block: Block, x: number, y: number) => void;
  onDragEnd: (block: Block, x: number, y: number) => void;
};

function CanvasBlockImpl({
  block,
  selected,
  onSelect,
  onGeometry,
  onRemove,
  onZOrder,
  onEdit,
  onDragMove,
  onDragEnd,
}: Props) {
  return (
    <Rnd
      size={{ width: block.w, height: block.h }}
      position={{ x: block.x, y: block.y }}
      bounds="parent"
      dragHandleClassName="block-drag-handle"
      onMouseDown={() => onSelect(block.id)}
      onDrag={(_e, d) => onDragMove(block, d.x, d.y)}
      onDragStop={(_e, d) => onDragEnd(block, d.x, d.y)}
      onResizeStop={(_e, _dir, ref, _delta, pos) =>
        onGeometry(block.id, {
          x: pos.x,
          y: pos.y,
          w: ref.offsetWidth,
          h: ref.offsetHeight,
        })
      }
      style={{ zIndex: block.z }}
      className={
        selected
          ? "outline outline-2 outline-primary"
          : "outline outline-1 outline-transparent hover:outline-border"
      }
    >
      <div className="group relative h-full w-full">
        {/* 블록 액션 아이콘 (선택/hover 시 노출) — 드래그와 겹치지 않게 mousedown 전파 차단 */}
        <div
          className={`absolute -top-3 right-0 z-20 flex gap-1 ${
            selected ? "flex" : "hidden group-hover:flex"
          }`}
          onMouseDown={(e) => e.stopPropagation()}
        >
          <button
            type="button"
            aria-label="블록 수정"
            title="수정"
            onClick={() => onEdit(block.id)}
            className="flex size-6 items-center justify-center rounded bg-primary text-primary-foreground shadow hover:opacity-90"
          >
            <Pencil className="size-3.5" />
          </button>
          <button
            type="button"
            aria-label="블록 삭제"
            title="삭제"
            onClick={() => onRemove(block.id)}
            className="flex size-6 items-center justify-center rounded bg-destructive text-white shadow hover:opacity-90"
          >
            <Trash2 className="size-3.5" />
          </button>
        </div>
        <ContextMenu>
          <ContextMenuTrigger asChild>
            <div
              data-block-id={block.id}
              role="button"
              tabIndex={0}
              aria-label={`${BLOCK_LABELS[block.type]} 블록`}
              onFocus={() => onSelect(block.id)}
              className="block-drag-handle h-full w-full cursor-move overflow-hidden bg-background outline-none"
            >
              {renderBlock(block)}
            </div>
          </ContextMenuTrigger>
        <ContextMenuContent>
          <ContextMenuItem onSelect={() => onEdit(block.id)}>
            수정
          </ContextMenuItem>
          <ContextMenuSeparator />
          <ContextMenuItem onSelect={() => onZOrder(block.id, "front")}>
            맨 앞으로
          </ContextMenuItem>
          <ContextMenuItem onSelect={() => onZOrder(block.id, "forward")}>
            앞으로
          </ContextMenuItem>
          <ContextMenuItem onSelect={() => onZOrder(block.id, "backward")}>
            뒤로
          </ContextMenuItem>
          <ContextMenuItem onSelect={() => onZOrder(block.id, "back")}>
            맨 뒤로
          </ContextMenuItem>
          <ContextMenuSeparator />
          <ContextMenuItem
            className="text-destructive"
            onSelect={() => onRemove(block.id)}
          >
            삭제
          </ContextMenuItem>
        </ContextMenuContent>
      </ContextMenu>
      </div>
    </Rnd>
  );
}

export const CanvasBlock = memo(CanvasBlockImpl);
