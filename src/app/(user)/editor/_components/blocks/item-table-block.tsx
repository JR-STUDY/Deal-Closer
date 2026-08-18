"use client";

import type { Block, BlockPropsMap } from "@/lib/editor-schema";
import { calcItemTableTotal, evalSummaryRows } from "@/lib/editor-schema";
import { formatKRW } from "@/lib/format";
import { InlineText } from "./inline-text";

/**
 * 품목 표. **칸을 더블클릭해 그 자리에서 고친다.**
 *
 * 격자 표와 달리 칸이 (행, 열) 좌표가 아니라 **필드**다 — 품목명·설명·수량·단가와
 * 사용자가 추가한 열(`extra:{colId}`). 금액과 요약행은 계산 결과라 고칠 수 없다
 * (고치게 하면 수량×단가와 어긋난 숫자가 문서에 남는다).
 *
 * 수량·단가는 화면에는 `₩1,200,000` 처럼 보이지만 편집할 때는 원래 숫자를 넣는다
 * (`editText`) — 통화기호·쉼표와 싸우게 하지 않는다.
 */
/**
 * 고칠 수 있는 칸 하나.
 *
 * **모듈 레벨에 둔다.** 컴포넌트 안에 정의하면 렌더마다 새 컴포넌트 타입이 되어 React 가
 * 칸을 통째로 다시 마운트한다 — 첫 클릭(선택)으로 DOM 이 교체되면서 브라우저가 두 번째
 * 클릭을 같은 요소로 보지 않아 **더블클릭 이벤트가 아예 생기지 않았다**.
 */
function ItemCell({
  row,
  field,
  text,
  editText,
  className,
  editingItem,
  onItemCommit,
  onCancel,
}: {
  row: number;
  field: string;
  text: string;
  editText?: string;
  className?: string;
  editingItem?: { row: number; field: string };
  onItemCommit?: (row: number, field: string, text: string) => void;
  onCancel?: () => void;
}) {
  const editing = editingItem?.row === row && editingItem?.field === field;
  return (
    <InlineText
      className={className}
      text={text}
      editText={editText}
      editing={editing}
      // 표 칸은 값을 **바꾸는** 자리다 — 덧붙이면 단가가 60000000+1500000 로 이어붙는다
      selectAll
      onCommit={(next) => onItemCommit?.(row, field, next)}
      onCancel={onCancel}
    />
  );
}

export function ItemTableBlock({
  block,
  editingItem,
  onItemCommit,
  onStartItemEdit,
  onCancel,
}: {
  block: Block;
  editingItem?: { row: number; field: string };
  onItemCommit?: (row: number, field: string, text: string) => void;
  onStartItemEdit?: (row: number, field: string) => void;
  onCancel?: () => void;
}) {
  const p = block.props as BlockPropsMap["itemTable"];
  const extraCols = p.extraColumns ?? [];
  const total = calcItemTableTotal(p.rows);
  const summaries = evalSummaryRows(p);
  const labelSpan = 3 + extraCols.length;
  const editable = onStartItemEdit !== undefined;

  /** 칸을 더블클릭하면 그 필드를 편집한다 (블록 전체 편집으로 번지지 않게 멈춘다) */
  const startEdit = (row: number, field: string) =>
    editable
      ? (e: React.MouseEvent) => {
          e.stopPropagation();
          onStartItemEdit?.(row, field);
        }
      : undefined;

  const cellClass = `border px-2 py-1 align-top${editable ? " cursor-text" : ""}`;

  return (
    <table className="w-full border-collapse text-xs">
      <thead>
        <tr className="bg-muted">
          <th className="border px-2 py-1 align-top text-left">품목 / 설명</th>
          {extraCols.map((c) => (
            <th key={c.id} className="border px-2 py-1 align-top" style={{ textAlign: c.align }}>
              {c.label}
            </th>
          ))}
          <th className="border px-2 py-1 align-top text-right">수량</th>
          <th className="border px-2 py-1 align-top text-right">단가</th>
          <th className="border px-2 py-1 align-top text-right">금액</th>
        </tr>
      </thead>
      <tbody>
        {p.rows.map((r, ri) => (
          <tr key={r.id}>
            <td className={cellClass}>
              <div onDoubleClick={startEdit(ri, "name")}>
                <ItemCell
                  row={ri}
                  field="name"
                  text={r.name}
                  className="font-medium"
                  editingItem={editingItem}
                  onItemCommit={onItemCommit}
                  onCancel={onCancel}
                />
              </div>
              {/* 설명은 비어 있어도 고칠 자리를 남긴다 — 없으면 추가할 길이 인스펙터뿐이다 */}
              <div onDoubleClick={startEdit(ri, "description")}>
                <ItemCell
                  row={ri}
                  field="description"
                  text={r.description ?? ""}
                  className="text-[11px] text-muted-foreground"
                  editingItem={editingItem}
                  onItemCommit={onItemCommit}
                  onCancel={onCancel}
                />
              </div>
            </td>
            {extraCols.map((c) => (
              <td
                key={c.id}
                className={cellClass}
                style={{ textAlign: c.align }}
                onDoubleClick={startEdit(ri, `extra:${c.id}`)}
              >
                <ItemCell
                  row={ri}
                  field={`extra:${c.id}`}
                  text={r.extra?.[c.id] ?? ""}
                  editingItem={editingItem}
                  onItemCommit={onItemCommit}
                  onCancel={onCancel}
                />
              </td>
            ))}
            <td
              className={`${cellClass} text-right tabular-nums`}
              onDoubleClick={startEdit(ri, "quantity")}
            >
              <ItemCell
                row={ri}
                field="quantity"
                text={String(r.quantity)}
                editingItem={editingItem}
                onItemCommit={onItemCommit}
                onCancel={onCancel}
              />
            </td>
            <td
              className={`${cellClass} text-right tabular-nums`}
              onDoubleClick={startEdit(ri, "unitPrice")}
            >
              <ItemCell
                row={ri}
                field="unitPrice"
                text={formatKRW(r.unitPrice)}
                editText={String(r.unitPrice)}
                editingItem={editingItem}
                onItemCommit={onItemCommit}
                onCancel={onCancel}
              />
            </td>
            {/* 금액은 수량×단가 결과다 — 고칠 수 없다 */}
            <td className="border px-2 py-1 align-top text-right tabular-nums">
              {formatKRW(r.quantity * r.unitPrice)}
            </td>
          </tr>
        ))}
      </tbody>
      {summaries.length > 0 ? (
        <tfoot>
          {summaries.map(({ row, value }, i) => (
            <tr key={row.id} className={i === summaries.length - 1 ? "font-semibold" : ""}>
              <td
                className="border px-2 py-1 align-top text-right"
                colSpan={labelSpan}
              >
                {row.label}
              </td>
              <td className="border px-2 py-1 align-top text-right tabular-nums">
                {formatKRW(value)}
              </td>
            </tr>
          ))}
        </tfoot>
      ) : p.showTotal ? (
        <tfoot>
          <tr>
            <td
              className="border px-2 py-1 align-top text-right font-semibold"
              colSpan={labelSpan}
            >
              합계
            </td>
            <td className="border px-2 py-1 align-top text-right font-semibold tabular-nums">
              {formatKRW(total)}
            </td>
          </tr>
        </tfoot>
      ) : null}
    </table>
  );
}
