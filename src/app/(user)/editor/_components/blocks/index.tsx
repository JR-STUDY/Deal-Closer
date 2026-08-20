import type { Block } from "@/lib/editor-schema";
import type { CellRef } from "@/lib/editor-cell";
import { TitleBlock } from "./title-block";
import { TextBlock } from "./text-block";
import { LabeledFieldsBlock } from "./labeled-fields-block";
import { ItemTableBlock } from "./item-table-block";
import { TableBlock } from "./table-block";
import { ImageBlock } from "./image-block";
import { DividerBlock } from "./divider-block";

/**
 * 캔버스에서 편집 중인 자리 — 어느 블록의 어느 칸인지.
 *
 * 칸 좌표(`CellRef`)와 그 칸을 읽고 쓰는 규칙은 `@/lib/editor-cell` 순수 함수가
 * 단일 기준이다. 예전에는 커밋 경로가 종류마다 따로여서(블록 전체·격자 표·품목표)
 * 칸을 늘릴 때마다 배선을 하나 더 해야 했고, 그래서 **표처럼 보이는데 편집만 안 되는
 * 칸**이 남았다(공급자 정보·거래처 정보 전체 등).
 */
export type EditTarget = { blockId: string; ref: CellRef };

/** 블록 **전체**를 더블클릭으로 고치는 종류 · 칸 단위로 고치는 종류 */
export { isWholeBlockEditable, hasEditableCells } from "@/lib/editor-cell";

/** 블록 타입별 렌더러 — 컴포넌트로 두어 React 가 경계를 추적하도록 한다 */
export function RenderBlock({
  block,
  editingRef,
  onStartEdit,
  onCommitCell,
  onCancel,
  showColumnHandles,
  onResizeColumn,
  onResizeRow,
}: {
  block: Block;
  /** 이 블록에서 편집 중인 칸 (다른 블록이면 부모가 null 을 준다) */
  editingRef?: CellRef | null;
  /** 더블클릭으로 그 칸 편집을 시작한다. 없으면(잠금 등) 편집 경로가 닫힌다 */
  onStartEdit?: (ref: CellRef) => void;
  onCommitCell?: (ref: CellRef, text: string) => void;
  onCancel?: () => void;
  /** 표 열·행 경계 손잡이 (고른 블록에서만) */
  showColumnHandles?: boolean;
  onResizeColumn?: (
    index: number,
    deltaPercent: number,
    baseline: number[] | null,
  ) => void;
  onResizeRow?: (index: number, deltaPx: number, measured: number) => void;
}) {
  /** 제목·텍스트는 블록 전체가 한 칸이다 (`kind: "block"`) */
  const wholeBlock = {
    editing: editingRef?.kind === "block",
    onCommit: (text: string) => onCommitCell?.({ kind: "block" }, text),
    onCancel,
  };
  /** 칸 단위 블록이 공통으로 받는 것 */
  const cellular = { editingRef, onStartEdit, onCommitCell, onCancel };

  switch (block.type) {
    case "title":
      return <TitleBlock block={block} {...wholeBlock} />;
    case "text":
      return <TextBlock block={block} {...wholeBlock} />;
    case "supplier":
      return <LabeledFieldsBlock block={block} variant="supplier" {...cellular} />;
    case "clientMeta":
      return <LabeledFieldsBlock block={block} variant="clientMeta" {...cellular} />;
    case "itemTable":
      return <ItemTableBlock block={block} {...cellular} />;
    case "table":
      return (
        <TableBlock
          block={block}
          {...cellular}
          showColumnHandles={showColumnHandles}
          onResizeColumn={onResizeColumn}
          onResizeRow={onResizeRow}
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
