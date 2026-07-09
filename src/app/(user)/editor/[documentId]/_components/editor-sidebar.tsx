"use client";

import type {
  Block,
  BlockType,
  ZOrderAction,
  CatalogOption,
} from "@/lib/editor-schema";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { BlockPalette } from "./block-palette";
import { BlockInspector } from "./block-inspector";
import type { CustomBlock, DocTemplate } from "./template-store";

type Props = {
  tab: string;
  onTabChange: (v: string) => void;
  onAdd: (type: BlockType) => void;
  catalog: CatalogOption[];
  block: Block | null;
  onChange: (patch: Partial<Block>) => void;
  onChangeProps: (propsPatch: Record<string, unknown>) => void;
  onRemove: (id: string) => void;
  onZOrder: (action: ZOrderAction) => void;
  // 사용자 지정 블록/템플릿 (#3)
  customBlocks: CustomBlock[];
  onAddCustom: (cb: CustomBlock) => void;
  onDeleteCustom: (id: string) => void;
  onSaveAsCustom: () => void;
  templates: DocTemplate[];
  onSaveTemplate: () => void;
  onLoadTemplate: (t: DocTemplate) => void;
  onDeleteTemplate: (id: string) => void;
};

/** 블록 추가(팔레트) + 블록 속성(인스펙터)를 하나의 우측 사이드바에 탭으로 통합 (#1) */
export function EditorSidebar({
  tab,
  onTabChange,
  onAdd,
  catalog,
  block,
  onChange,
  onChangeProps,
  onRemove,
  onZOrder,
  customBlocks,
  onAddCustom,
  onDeleteCustom,
  onSaveAsCustom,
  templates,
  onSaveTemplate,
  onLoadTemplate,
  onDeleteTemplate,
}: Props) {
  return (
    <aside className="flex w-72 shrink-0 flex-col border-l bg-background">
      <Tabs
        value={tab}
        onValueChange={onTabChange}
        className="flex min-h-0 flex-1 flex-col"
      >
        <div className="border-b p-2">
          <TabsList className="w-full">
            <TabsTrigger value="palette" className="flex-1">
              블록 추가
            </TabsTrigger>
            <TabsTrigger value="inspector" className="flex-1">
              블록 속성
            </TabsTrigger>
          </TabsList>
        </div>
        <div className="min-h-0 flex-1 overflow-auto p-4">
          <TabsContent value="palette" className="mt-0">
            <BlockPalette
              onAdd={onAdd}
              customBlocks={customBlocks}
              onAddCustom={onAddCustom}
              onDeleteCustom={onDeleteCustom}
              templates={templates}
              onSaveTemplate={onSaveTemplate}
              onLoadTemplate={onLoadTemplate}
              onDeleteTemplate={onDeleteTemplate}
            />
          </TabsContent>
          <TabsContent value="inspector" className="mt-0">
            <BlockInspector
              block={block}
              catalog={catalog}
              onChange={onChange}
              onChangeProps={onChangeProps}
              onRemove={onRemove}
              onZOrder={onZOrder}
              onSaveAsCustom={onSaveAsCustom}
            />
          </TabsContent>
        </div>
      </Tabs>
    </aside>
  );
}
