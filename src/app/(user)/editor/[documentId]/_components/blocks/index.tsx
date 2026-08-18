import type { Block } from "@/lib/editor-schema";
import { TitleBlock } from "./title-block";
import { TextBlock } from "./text-block";
import { SupplierBlock } from "./supplier-block";
import { ClientMetaBlock } from "./client-meta-block";
import { ItemTableBlock } from "./item-table-block";
import { TableBlock } from "./table-block";
import { ImageBlock } from "./image-block";
import { DividerBlock } from "./divider-block";

/**
 * 캔버스에서 직접 고칠 수 있는 대상.
 *
 * 예전에는 "블록 하나"가 단위였지만 표가 들어오면서 **셀 좌표까지** 필요해졌다.
 * `cell` 이 없으면 블록 전체(제목·텍스트), 있으면 그 표의 그 칸을 고치는 중이다.
 */
export type EditTarget = {
  blockId: string;
  /** 격자 표의 칸 (행·열) */
  cell?: { r: number; c: number };
  /** 품목표의 칸 — 좌표가 아니라 **필드**다 (수량·단가는 숫자, 추가열은 `extra:{colId}`) */
  item?: { row: number; field: string };
};

/** 블록 **전체**를 더블클릭으로 고칠 수 있는 종류 (표는 칸 단위라 여기 없다) */
export const INLINE_EDITABLE_TYPES: readonly Block["type"][] = ["title", "text"];

export function isInlineEditable(block: Block): boolean {
  return INLINE_EDITABLE_TYPES.includes(block.type);
}

/** 칸 단위로 고치는 블록 (표·품목표) */
export function hasEditableCells(block: Block): boolean {
  return block.type === "table" || block.type === "itemTable";
}

/** 블록 타입별 렌더러 — 컴포넌트로 두어 React 가 경계를 추적하도록 한다 */
export function RenderBlock({
  block,
  editing = false,
  editingCell,
  editingItem,
  onCommit,
  onCellCommit,
  onStartCellEdit,
  onItemCommit,
  onStartItemEdit,
  onCancel,
  showColumnHandles,
  onResizeColumn,
}: {
  block: Block;
  /** 블록 전체를 인라인 편집 중인지 (text·title) */
  editing?: boolean;
  /** 표에서 편집 중인 칸 */
  editingCell?: { r: number; c: number };
  /** 품목표에서 편집 중인 칸 */
  editingItem?: { row: number; field: string };
  onCommit?: (text: string) => void;
  onCellCommit?: (r: number, c: number, text: string) => void;
  onStartCellEdit?: (r: number, c: number) => void;
  onItemCommit?: (row: number, field: string, text: string) => void;
  onStartItemEdit?: (row: number, field: string) => void;
  onCancel?: () => void;
  /** 표 열 경계 손잡이 (고른 블록에서만) */
  showColumnHandles?: boolean;
  onResizeColumn?: (
    index: number,
    deltaPercent: number,
    baseline: number[] | null,
  ) => void;
}) {
  switch (block.type) {
    case "title":
      return (
        <TitleBlock
          block={block}
          editing={editing}
          onCommit={onCommit}
          onCancel={onCancel}
        />
      );
    case "text":
      return (
        <TextBlock
          block={block}
          editing={editing}
          onCommit={onCommit}
          onCancel={onCancel}
        />
      );
    case "supplier":
      return <SupplierBlock block={block} />;
    case "clientMeta":
      return <ClientMetaBlock block={block} />;
    case "itemTable":
      return (
        <ItemTableBlock
          block={block}
          editingItem={editingItem}
          onItemCommit={onItemCommit}
          onStartItemEdit={onStartItemEdit}
          onCancel={onCancel}
        />
      );
    case "table":
      return (
        <TableBlock
          block={block}
          editingCell={editingCell}
          onCellCommit={onCellCommit}
          onStartCellEdit={onStartCellEdit}
          onCancel={onCancel}
          showColumnHandles={showColumnHandles}
          onResizeColumn={onResizeColumn}
        />
      );
    case "image":
      return <ImageBlock block={block} />;
    case "divider":
      return <DividerBlock block={block} />;
    default:
      return null;
  }
}
