"use client";

import type { Block, BlockPropsMap } from "@/lib/editor-schema";
import {
  calcItemTableTotal,
  evalSummaryRows,
  totalSummaryRow,
} from "@/lib/editor-schema";
import { extraField, sameCell, type CellRef } from "@/lib/editor-cell";
import { formatKRW } from "@/lib/format";
import { InlineText } from "./inline-text";

/**
 * 품목 표. **칸을 더블클릭해 그 자리에서 고친다.**
 *
 * 격자 표와 달리 칸이 (행, 열) 좌표가 아니라 **필드**다 — 품목명·설명·수량·단가와
 * 사용자가 추가한 열(`extra:{colId}`). 여기에 **추가 열의 머리글**과 **요약행 라벨**도
 * 포함된다(둘 다 예전에는 인스펙터에서만 고칠 수 있었다).
 *
 * 고칠 수 없는 칸은 두 종류뿐이고 이유가 분명하다.
 *  - **금액·요약행 값** — 계산 결과다. 손으로 고치면 수량×단가와 어긋난 숫자가 남고,
 *    그 숫자가 확정 문서를 통해 기회 예상 금액까지 내려간다(기회-6).
 *  - **고정 머리글** (`품목 / 설명`·`수량`·`단가`·`금액`·`합계`) — `props` 에 없는 문구다.
 *    고치게 하려면 스키마에 넣는 것이 먼저다.
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
  cellRef,
  text,
  editText,
  className,
  editingRef,
  onCommitCell,
  onCancel,
}: {
  cellRef: CellRef;
  text: string;
  editText?: string;
  className?: string;
  editingRef?: CellRef | null;
  onCommitCell?: (ref: CellRef, text: string) => void;
  onCancel?: () => void;
}) {
  return (
    <InlineText
      className={className}
      text={text}
      editText={editText}
      editing={sameCell(editingRef, cellRef)}
      // 표 칸은 값을 **바꾸는** 자리다 — 덧붙이면 단가가 60000000+1500000 로 이어붙는다
      selectAll
      onCommit={(next) => onCommitCell?.(cellRef, next)}
      onCancel={onCancel}
    />
  );
}

export function ItemTableBlock({
  block,
  editingRef,
  onCommitCell,
  onStartEdit,
  onCancel,
}: {
  block: Block;
  editingRef?: CellRef | null;
  onCommitCell?: (ref: CellRef, text: string) => void;
  onStartEdit?: (ref: CellRef) => void;
  onCancel?: () => void;
}) {
  const p = block.props as BlockPropsMap["itemTable"];
  const extraCols = p.extraColumns ?? [];
  const total = calcItemTableTotal(p.rows);
  const summaries = evalSummaryRows(p);
  /*
   * 강조는 **총계 행**에 준다 — 예전에는 `마지막 행`을 굵게 그렸다. 총계 표식이 앞줄에
   * 붙은 문서(예: 합계 → 부가세 순서로 적은 문서)에서는 굵은 줄과 문서 금액이 서로
   * 다른 행을 가리켜, 화면만 보고는 어느 숫자가 저장되는지 알 수 없었다.
   */
  const totalRowId = totalSummaryRow(p.summaryRows)?.id ?? null;
  const labelSpan = 3 + extraCols.length;
  const editable = onStartEdit !== undefined;

  /** 칸을 더블클릭하면 그 필드를 편집한다 (블록 전체 편집으로 번지지 않게 멈춘다) */
  const startEdit = (ref: CellRef) =>
    editable
      ? (e: React.MouseEvent) => {
          e.stopPropagation();
          onStartEdit?.(ref);
        }
      : undefined;

  const cellClass = `border px-2 py-1 align-top${editable ? " cursor-text" : ""}`;
  const cell = (cellRef: CellRef, text: string, extra?: { editText?: string; className?: string }) => (
    <ItemCell
      cellRef={cellRef}
      text={text}
      editText={extra?.editText}
      className={extra?.className}
      editingRef={editingRef}
      onCommitCell={onCommitCell}
      onCancel={onCancel}
    />
  );

  return (
    <table className="w-full border-collapse text-xs">
      <thead>
        <tr className="bg-muted">
          {/* 고정 머리글 — props 에 없는 문구라 고칠 수 없다 */}
          <th className="border px-2 py-1 align-top text-left">품목 / 설명</th>
          {extraCols.map((c) => {
            const ref: CellRef = { kind: "itemColumn", colId: c.id };
            return (
              <th
                key={c.id}
                className={`border px-2 py-1 align-top${editable ? " cursor-text" : ""}`}
                style={{ textAlign: c.align }}
                onDoubleClick={startEdit(ref)}
              >
                {cell(ref, c.label)}
              </th>
            );
          })}
          <th className="border px-2 py-1 align-top text-right">수량</th>
          <th className="border px-2 py-1 align-top text-right">단가</th>
          <th className="border px-2 py-1 align-top text-right">금액</th>
        </tr>
      </thead>
      <tbody>
        {p.rows.map((r, ri) => {
          const nameRef: CellRef = { kind: "item", row: ri, field: "name" };
          const descRef: CellRef = { kind: "item", row: ri, field: "description" };
          const qtyRef: CellRef = { kind: "item", row: ri, field: "quantity" };
          const priceRef: CellRef = { kind: "item", row: ri, field: "unitPrice" };
          return (
            <tr key={r.id}>
              {/*
               * 설명이 비어 있으면 글자 높이가 0 이라 안쪽에는 닿을 수가 없다.
               * 그래서 **칸 자체**가 설명 편집을 받고, 품목명은 자기 줄에서 멈춘다 —
               * 이름 줄을 누르면 이름, 그 밖(빈 설명 자리·여백)을 누르면 설명이다.
               */}
              <td className={cellClass} onDoubleClick={startEdit(descRef)}>
                <div onDoubleClick={startEdit(nameRef)}>
                  {cell(nameRef, r.name, { className: "font-medium" })}
                </div>
                {cell(descRef, r.description ?? "", {
                  className: "text-[11px] text-muted-foreground",
                })}
              </td>
              {extraCols.map((c) => {
                const ref: CellRef = { kind: "item", row: ri, field: extraField(c.id) };
                return (
                  <td
                    key={c.id}
                    className={cellClass}
                    style={{ textAlign: c.align }}
                    onDoubleClick={startEdit(ref)}
                  >
                    {cell(ref, r.extra?.[c.id] ?? "")}
                  </td>
                );
              })}
              <td
                className={`${cellClass} text-right tabular-nums`}
                onDoubleClick={startEdit(qtyRef)}
              >
                {cell(qtyRef, String(r.quantity))}
              </td>
              <td
                className={`${cellClass} text-right tabular-nums`}
                onDoubleClick={startEdit(priceRef)}
              >
                {cell(priceRef, formatKRW(r.unitPrice), {
                  editText: String(r.unitPrice),
                })}
              </td>
              {/* 금액은 수량×단가 결과다 — 고칠 수 없다 */}
              <td className="border px-2 py-1 align-top text-right tabular-nums">
                {formatKRW(r.quantity * r.unitPrice)}
              </td>
            </tr>
          );
        })}
      </tbody>
      {summaries.length > 0 ? (
        <tfoot>
          {summaries.map(({ row, value }) => {
            const ref: CellRef = { kind: "itemSummary", summaryId: row.id };
            return (
              <tr key={row.id} className={row.id === totalRowId ? "font-semibold" : ""}>
                {/* 라벨은 사용자 문구다 (부가세·공급가액 등) — 고칠 수 있다 */}
                <td
                  className={`border px-2 py-1 align-top text-right${
                    editable ? " cursor-text" : ""
                  }`}
                  colSpan={labelSpan}
                  onDoubleClick={startEdit(ref)}
                >
                  {cell(ref, row.label)}
                </td>
                {/* 값은 수식 결과다 — 고칠 수 없다 (수식은 인스펙터에서 고친다) */}
                <td className="border px-2 py-1 align-top text-right tabular-nums">
                  {formatKRW(value)}
                </td>
              </tr>
            );
          })}
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
