import type { Block } from "@/lib/editor-schema";
import { TitleBlock } from "./title-block";
import { TextBlock } from "./text-block";
import { SupplierBlock } from "./supplier-block";
import { ClientMetaBlock } from "./client-meta-block";
import { ItemTableBlock } from "./item-table-block";
import { TableBlock } from "./table-block";
import { ImageBlock } from "./image-block";
import { DividerBlock } from "./divider-block";

/** 캔버스에서 직접 편집할 수 있는 블록 종류 (진단 5) */
export const INLINE_EDITABLE_TYPES: readonly Block["type"][] = ["title", "text"];

export function isInlineEditable(block: Block): boolean {
  return INLINE_EDITABLE_TYPES.includes(block.type);
}

/** 블록 타입별 렌더러 — 컴포넌트로 두어 React 가 경계를 추적하도록 한다 */
export function RenderBlock({
  block,
  editing = false,
  onCommit,
  onCancel,
}: {
  block: Block;
  /** 캔버스 인라인 편집 중인지 (text·title 만 지원) */
  editing?: boolean;
  onCommit?: (text: string) => void;
  onCancel?: () => void;
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
      return <ItemTableBlock block={block} />;
    case "table":
      return <TableBlock block={block} />;
    case "image":
      return <ImageBlock block={block} />;
    case "divider":
      return <DividerBlock block={block} />;
    default:
      return null;
  }
}
