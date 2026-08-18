"use client";

import type { Block, BlockPropsMap } from "@/lib/editor-schema";
import type { CellRef } from "@/lib/editor-cell";
import { sameCell } from "@/lib/editor-cell";
import { InlineText } from "./inline-text";

/**
 * 라벨/값 2열 표 — `공급자 정보` 와 `거래처·견적 정보` 공용.
 *
 * 두 블록은 글자 크기·여백만 다르고 구조가 같아서 렌더러를 **하나로** 둔다
 * (인쇄 쪽 `pdf-html.ts` 의 `renderFieldTable` 도 같은 방식이다 — 둘로 나누면
 * 한쪽만 손봤을 때 화면과 인쇄가 조용히 갈라진다).
 *
 * **칸을 더블클릭해 그 자리에서 고친다.** 예전에는 이 두 블록만 편집 경로가 없어서,
 * 격자 표와 똑같이 보이는데 더블클릭해도 아무 일이 없었다 — 고치려면 블록을 고르고
 * 우측 인스펙터의 입력칸을 찾아야 했다. 표준 양식의 **틀**(어떤 항목이 어디 놓이는지)은
 * 그대로 두더라도, 그 안에 채우는 값은 보이는 자리에서 고쳐야 한다.
 *
 * 더블클릭 핸들러는 안쪽 글자가 아니라 **칸(`th`/`td`)** 에 둔다 — 값이 빈 필드는
 * 글자 높이가 0 이라 안쪽에 달면 닿을 수가 없다(담당자 미입력 같은 흔한 경우다).
 */
export function LabeledFieldsBlock({
  block,
  variant,
  editingRef,
  onStartEdit,
  onCommitCell,
  onCancel,
}: {
  block: Block;
  /** 글자 크기·여백만 다르다 (구조·정렬은 같다) */
  variant: "supplier" | "clientMeta";
  editingRef?: CellRef | null;
  onStartEdit?: (ref: CellRef) => void;
  onCommitCell?: (ref: CellRef, text: string) => void;
  onCancel?: () => void;
}) {
  const p = block.props as BlockPropsMap["clientMeta"];
  const fields = Array.isArray(p.fields) ? p.fields : [];
  const editable = onStartEdit !== undefined;
  // 공급자는 더 촘촘하다 (인쇄 CSS 의 .blk-supplier 와 같은 값)
  const textSize = variant === "supplier" ? "text-[11px]" : "text-xs";
  const pad = variant === "supplier" ? "px-1 py-0.5" : "px-2 py-1";

  /** 라벨·값 어느 쪽이든 같은 규칙으로 편집에 들어간다 */
  const cellProps = (ref: CellRef) => ({
    onDoubleClick: editable
      ? (e: React.MouseEvent) => {
          // 블록 전체 편집으로 번지지 않게 여기서 멈춘다
          e.stopPropagation();
          onStartEdit?.(ref);
        }
      : undefined,
  });

  const renderText = (ref: CellRef, text: string) => (
    <InlineText
      text={text}
      editing={sameCell(editingRef, ref)}
      // 값을 **바꾸는** 자리라 진입 시 전체 선택한다 (표 칸과 같은 규칙)
      selectAll
      onCommit={(next) => onCommitCell?.(ref, next)}
      onCancel={onCancel}
    />
  );

  return (
    <table className={`w-full border-collapse ${textSize}`}>
      <tbody>
        {fields.map((f) => {
          const labelRef: CellRef = {
            kind: "metaField",
            fieldId: f.id,
            part: "label",
          };
          const valueRef: CellRef = {
            kind: "metaField",
            fieldId: f.id,
            part: "value",
          };
          return (
            <tr key={f.id}>
              <th
                className={`border bg-muted ${pad} align-top text-left font-medium text-muted-foreground${
                  editable ? " cursor-text" : ""
                }`}
                style={{ width: p.labelWidth }}
                {...cellProps(labelRef)}
              >
                {renderText(labelRef, f.label)}
              </th>
              <td
                className={`border ${pad} align-top${editable ? " cursor-text" : ""}`}
                {...cellProps(valueRef)}
              >
                {renderText(valueRef, f.value)}
              </td>
            </tr>
          );
        })}
      </tbody>
    </table>
  );
}
