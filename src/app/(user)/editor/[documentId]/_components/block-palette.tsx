"use client";

import type { DragEvent } from "react";
import { BLOCK_TYPES, BLOCK_LABELS, type BlockType } from "@/lib/editor-schema";
import { Button } from "@/components/ui/button";

export function BlockPalette({ onAdd }: { onAdd: (type: BlockType) => void }) {
  function handleDragStart(e: DragEvent<HTMLButtonElement>, type: BlockType) {
    e.dataTransfer.setData("application/x-block-type", type);
    e.dataTransfer.effectAllowed = "copy";
  }

  return (
    <div className="space-y-2">
      <div className="flex flex-col gap-1.5">
        {BLOCK_TYPES.map((type) => (
          <Button
            key={type}
            variant="outline"
            size="sm"
            draggable
            onDragStart={(e) => handleDragStart(e, type)}
            onClick={() => onAdd(type)}
            className="justify-start"
          >
            {BLOCK_LABELS[type]}
          </Button>
        ))}
      </div>
      <p className="px-1 text-[11px] leading-relaxed text-muted-foreground">
        캔버스로 끌어다 놓거나 클릭하면 추가됩니다.
      </p>
    </div>
  );
}
