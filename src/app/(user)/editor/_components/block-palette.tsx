"use client";

import type { DragEvent } from "react";
import { BLOCK_TYPES, BLOCK_LABELS, type BlockType } from "@/lib/editor-schema";
import { Button } from "@/components/ui/button";
import { X, Pencil } from "lucide-react";
import type { CustomBlock, DocTemplate } from "./template-store";

function handleDragStart(e: DragEvent<HTMLButtonElement>, type: BlockType) {
  e.dataTransfer.setData("application/x-block-type", type);
  e.dataTransfer.effectAllowed = "copy";
}

type Props = {
  onAdd: (type: BlockType) => void;
  onEditBase: (type: BlockType) => void;
  customBlocks: CustomBlock[];
  onAddCustom: (cb: CustomBlock) => void;
  onDeleteCustom: (id: string) => void;
  templates: DocTemplate[];
  onSaveTemplate: () => void;
  onLoadTemplate: (t: DocTemplate) => void;
  onDeleteTemplate: (id: string) => void;
};

export function BlockPalette({
  onAdd,
  onEditBase,
  customBlocks,
  onAddCustom,
  onDeleteCustom,
  templates,
  onSaveTemplate,
  onLoadTemplate,
  onDeleteTemplate,
}: Props) {
  return (
    <div className="space-y-4">
      <div className="space-y-1.5">
        <p className="px-1 text-xs font-medium text-muted-foreground">기본 블록</p>
        <div className="flex flex-col gap-1.5">
          {BLOCK_TYPES.map((type) => (
            <div key={type} className="flex items-center gap-1">
              <Button
                variant="outline"
                size="sm"
                draggable
                onDragStart={(e) => handleDragStart(e, type)}
                onClick={() => onAdd(type)}
                className="flex-1 justify-start"
              >
                {BLOCK_LABELS[type]}
              </Button>
              <Button
                variant="ghost"
                size="icon"
                aria-label={`${BLOCK_LABELS[type]} 기본값 수정`}
                title="기본값 수정"
                onClick={() => onEditBase(type)}
              >
                <Pencil className="size-4" />
              </Button>
            </div>
          ))}
        </div>
        <p className="px-1 text-[11px] leading-relaxed text-muted-foreground">
          캔버스로 끌어다 놓거나 클릭하면 추가됩니다.
        </p>
      </div>

      {/* 내 블록 (#3) */}
      <div className="space-y-1.5">
        <p className="px-1 text-xs font-medium text-muted-foreground">내 블록</p>
        {customBlocks.length === 0 ? (
          <p className="px-1 text-[11px] text-muted-foreground">
            블록을 선택한 뒤 속성 탭에서 “내 블록으로 저장”하면 여기에 추가됩니다.
          </p>
        ) : (
          <div className="flex flex-col gap-1.5">
            {customBlocks.map((cb) => (
              <div key={cb.id} className="flex items-center gap-1">
                <Button
                  variant="outline"
                  size="sm"
                  className="flex-1 justify-start truncate"
                  onClick={() => onAddCustom(cb)}
                  title={`${cb.name} (${BLOCK_LABELS[cb.type]})`}
                >
                  {cb.name}
                </Button>
                <Button
                  variant="ghost"
                  size="icon"
                  aria-label="내 블록 삭제"
                  onClick={() => onDeleteCustom(cb.id)}
                >
                  <X className="size-4" />
                </Button>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* 문서 템플릿 (#3) */}
      <div className="space-y-1.5">
        <p className="px-1 text-xs font-medium text-muted-foreground">
          문서 템플릿
        </p>
        <Button
          variant="secondary"
          size="sm"
          className="w-full"
          onClick={onSaveTemplate}
        >
          현재 배치를 템플릿으로 저장
        </Button>
        {templates.map((t) => (
          <div key={t.id} className="flex items-center gap-1">
            <Button
              variant="outline"
              size="sm"
              className="flex-1 justify-start truncate"
              onClick={() => onLoadTemplate(t)}
              title={t.name}
            >
              {t.name}
            </Button>
            <Button
              variant="ghost"
              size="icon"
              aria-label="템플릿 삭제"
              onClick={() => onDeleteTemplate(t.id)}
            >
              <X className="size-4" />
            </Button>
          </div>
        ))}
      </div>
    </div>
  );
}
