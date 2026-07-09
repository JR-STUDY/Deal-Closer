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
  onEdit: (id: string) => void;
};

function CanvasBlockImpl({
  block,
  selected,
  onSelect,
  onGeometry,
  onRemove,
  onZOrder,
  onEdit,
}: Props) {
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
    </Rnd>
  );
}

export const CanvasBlock = memo(CanvasBlockImpl);
