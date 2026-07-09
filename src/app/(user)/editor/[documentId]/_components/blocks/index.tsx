import type { Block } from "@/lib/editor-schema";
import { TitleBlock } from "./title-block";
import { TextBlock } from "./text-block";
import { SupplierBlock } from "./supplier-block";
import { ClientMetaBlock } from "./client-meta-block";
import { ItemTableBlock } from "./item-table-block";
import { TableBlock } from "./table-block";
import { ImageBlock } from "./image-block";
import { DividerBlock } from "./divider-block";

export function renderBlock(block: Block) {
  switch (block.type) {
    case "title":
      return <TitleBlock block={block} />;
    case "text":
      return <TextBlock block={block} />;
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
  }
}
