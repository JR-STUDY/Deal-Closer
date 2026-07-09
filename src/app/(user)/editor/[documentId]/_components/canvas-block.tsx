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
import { renderBlock } from "./blocks";

export type Geometry = { x: number; y: number; w: number; h: number };

type Props = {
  block: Block;
  selected: boolean;
  onSelect: (id: string) => void;
  onGeometry: (id: string, geo: Geometry) => void;
  onRemove: (id: string) => void;
  onZOrder: (id: string, action: ZOrderAction) => void;
};

function CanvasBlockImpl({
  block,
  selected,
  onSelect,
  onGeometry,
  onRemove,
  onZOrder,
}: Props) {
  // 키보드 접근성 (정책 ACC_): Delete=삭제, 방향키=이동(Shift 시 10px)
  function handleKeyDown(e: React.KeyboardEvent) {
    if (e.key === "Delete") {
      e.preventDefault();
      onRemove(block.id);
      return;
    }
    const step = e.shiftKey ? 10 : 1;
    const move: Record<string, [number, number]> = {
      ArrowLeft: [-step, 0],
      ArrowRight: [step, 0],
      ArrowUp: [0, -step],
      ArrowDown: [0, step],
    };
    const delta = move[e.key];
    if (delta) {
      e.preventDefault();
      onGeometry(block.id, {
        x: Math.max(0, block.x + delta[0]),
        y: Math.max(0, block.y + delta[1]),
        w: block.w,
        h: block.h,
      });
    }
  }

  return (
    <Rnd
      size={{ width: block.w, height: block.h }}
      position={{ x: block.x, y: block.y }}
      bounds="parent"
      dragHandleClassName="block-drag-handle"
      onMouseDown={() => onSelect(block.id)}
      onDragStop={(_e, d) =>
        onGeometry(block.id, { x: d.x, y: d.y, w: block.w, h: block.h })
      }
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
      <ContextMenu>
        <ContextMenuTrigger asChild>
          <div
            data-block-id={block.id}
            role="button"
            tabIndex={0}
            aria-label={`${BLOCK_LABELS[block.type]} 블록`}
            onKeyDown={handleKeyDown}
            onFocus={() => onSelect(block.id)}
            className="block-drag-handle h-full w-full cursor-move overflow-hidden bg-background outline-none"
          >
            {renderBlock(block)}
          </div>
        </ContextMenuTrigger>
        <ContextMenuContent>
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
    </Rnd>
  );
}

export const CanvasBlock = memo(CanvasBlockImpl);
