"use client";

import { useCallback, useLayoutEffect, useRef, useState } from "react";
import type { Block, BlockPropsMap, Align } from "@/lib/editor-schema";
import { normalizeColWidths, normalizeRowHeights, tableLayout } from "@/lib/editor-schema";
import { InlineText } from "./inline-text";

/**
 * 격자 표. **칸을 더블클릭해 그 자리에서 고친다.**
 *
 * 예전에는 계약서 조건표의 오타 하나를 고치려면 우측 인스펙터에서 행·열을 세어 가며
 * 해당 입력칸을 찾아야 했다. 표는 보이는 자리에서 고치는 것이 훨씬 빠르다.
 *
 * 조작 규칙은 텍스트 블록과 같다(`InlineText`) — blur·⌘Enter 저장, Esc 되돌리기.
 * 편집 중에는 캔버스 드래그·단축키를 양보한다(부모가 `editingId` 로 판단한다).
 */
export function TableBlock({
  block,
  editingCell,
  onCellCommit,
  onStartCellEdit,
  onCancel,
  showColumnHandles = false,
  onResizeColumn,
  onResizeRow,
}: {
  block: Block;
  editingCell?: { r: number; c: number };
  onCellCommit?: (r: number, c: number, text: string) => void;
  onStartCellEdit?: (r: number, c: number) => void;
  onCancel?: () => void;
  /** 열 경계 손잡이 노출 (블록을 골랐을 때만 — 늘 보이면 표가 지저분하다) */
  showColumnHandles?: boolean;
  /**
   * 열 경계 `index` 를 끌어 옮긴다 (전체 폭 대비 %).
   * `baseline` 은 저장된 폭이 아직 없을 때 쓸 **현재 렌더된 열 비율**이다 —
   * 없으면 첫 드래그에 균등 분배로 튄다.
   */
  onResizeColumn?: (
    index: number,
    deltaPercent: number,
    baseline: number[] | null,
  ) => void;
  /**
   * 행 `index` 의 높이를 끌어 바꾼다 (px).
   * `measured` 는 지금 그려진 높이 — 저장된 값이 없던 행이 여기서 이어 간다.
   */
  onResizeRow?: (index: number, deltaPx: number, measured: number) => void;
}) {
  const p = block.props as BlockPropsMap["table"];
  const alignOf = (ci: number): Align => p.colAligns?.[ci] ?? "left";
  // 병합 계산은 tableLayout 하나가 한다 — 인쇄 렌더러도 같은 함수를 쓴다
  const { cells, layout } = tableLayout(p);
  const editable = onStartCellEdit !== undefined;
  const colCount = cells[0]?.length ?? 0;
  const widths = normalizeColWidths(p.colWidths, colCount);
  const heights = normalizeRowHeights(p.rowHeights, cells.length);
  const wrapRef = useRef<HTMLDivElement>(null);
  const tableRef = useRef<HTMLTableElement>(null);

  /**
   * 지금 화면에 그려진 열 비율(%). 저장된 폭이 없을 때의 시작점이다.
   *
   * 병합이 없는 행에서만 잰다 — colspan 이 걸린 행의 칸 폭은 여러 열의 합이라
   * 열별 폭을 알 수 없다. 그런 행이 없으면 null 을 주고 균등 분배로 시작한다.
   */
  function measuredPercents(): number[] | null {
    const table = tableRef.current;
    if (!table || colCount === 0) return null;
    const plainRow = layout.findIndex(
      (row) =>
        row.length === colCount &&
        row.every((cell) => !cell.skip && cell.rowSpan === 1 && cell.colSpan === 1),
    );
    if (plainRow < 0) return null;
    const tr = table.rows[plainRow];
    if (!tr || tr.cells.length !== colCount) return null;
    const px = [...tr.cells].map((cell) => cell.offsetWidth);
    const total = px.reduce((a, b) => a + b, 0);
    if (total <= 0) return null;
    return px.map((w) => (w / total) * 100);
  }

  /**
   * 경계를 끌어 열 폭을 바꾼다.
   * 이동량은 **표 폭 대비 %** 로 환산한다 — 캔버스에 `transform: scale()` 이 걸려 있어도
   * 같은 비율이 나오도록 화면 px 를 표의 화면 폭으로 나눈다(둘 다 배율이 곱해져 상쇄된다).
   */
  function beginColumnDrag(index: number, e: React.MouseEvent) {
    // Rnd 가 블록 드래그를 시작하지 않게 막는다
    e.stopPropagation();
    e.preventDefault();
    const width = wrapRef.current?.getBoundingClientRect().width ?? 0;
    if (width <= 0) return;
    const startX = e.clientX;
    // 저장된 폭이 없으면 지금 보이는 비율에서 이어 간다 (드래그 시작에 표가 튀지 않게)
    const baseline = p.colWidths && p.colWidths.length > 0 ? null : measuredPercents();
    let last = 0;
    const onMove = (ev: MouseEvent) => {
      const percent = ((ev.clientX - startX) / width) * 100;
      // 직전 호출과의 차이만 넘긴다 — 누적은 문서 상태가 들고 있다
      onResizeColumn?.(index, percent - last, baseline);
      last = percent;
    };
    const onUp = () => {
      window.removeEventListener("mousemove", onMove);
      window.removeEventListener("mouseup", onUp);
    };
    window.addEventListener("mousemove", onMove);
    window.addEventListener("mouseup", onUp);
  }

  /**
   * 행 경계(각 행의 아래쪽) 위치와 지금 그려진 높이 — 손잡이를 놓을 자리다.
   * 행 높이는 내용에 따라 제각각이라 **실제로 재야** 한다.
   */
  const [rowGeo, setRowGeo] = useState<{ bottom: number; height: number }[]>([]);
  const measureRows = useCallback(() => {
    const table = tableRef.current;
    const wrap = wrapRef.current;
    if (!table || !wrap) return;
    const base = wrap.getBoundingClientRect().top;
    const next = [...table.rows].map((tr) => {
      const r = tr.getBoundingClientRect();
      return { bottom: Math.round(r.bottom - base), height: Math.round(r.height) };
    });
    setRowGeo((current) =>
      current.length === next.length &&
      current.every((c, i) => c.bottom === next[i].bottom && c.height === next[i].height)
        ? current
        : next,
    );
  }, []);
  // 내용·폭이 바뀌면 행 높이도 바뀐다 — 블록이 갱신될 때마다 다시 잰다
  useLayoutEffect(() => {
    measureRows();
  }, [block, measureRows]);

  function beginRowDrag(index: number, e: React.MouseEvent) {
    e.stopPropagation();
    e.preventDefault();
    const measured = rowGeo[index]?.height ?? 0;
    const startY = e.clientY;
    let last = 0;
    const onMove = (ev: MouseEvent) => {
      const delta = ev.clientY - startY;
      onResizeRow?.(index, delta - last, measured);
      last = delta;
    };
    const onUp = () => {
      window.removeEventListener("mousemove", onMove);
      window.removeEventListener("mouseup", onUp);
    };
    window.addEventListener("mousemove", onMove);
    window.addEventListener("mouseup", onUp);
  }

  /** 경계의 왼쪽부터 누적 위치(%) — 마지막 열 오른쪽 끝에는 손잡이를 두지 않는다 */
  const boundaries: number[] = [];
  let acc = 0;
  for (let i = 0; i < widths.length - 1; i++) {
    acc += widths[i];
    boundaries.push(acc);
  }

  return (
    <div ref={wrapRef} className="relative w-full">
    <table ref={tableRef} className="w-full border-collapse text-xs">
      {/*
       * 열 폭은 저장된 값이 있으면 그대로 쓴다 (`colWidths`).
       * 없으면 예전처럼 브라우저 자동 배분 — 기존 문서가 그대로 보인다.
       */}
      {p.colWidths && p.colWidths.length > 0 ? (
        <colgroup>
          {cells[0]?.map((_, ci) => (
            <col key={ci} style={{ width: p.colWidths?.[ci] ? `${p.colWidths[ci]}%` : undefined }} />
          ))}
        </colgroup>
      ) : null}
      <tbody>
        {cells.map((row, ri) => (
          <tr key={ri} style={heights[ri] > 0 ? { height: heights[ri] } : undefined}>
            {row.map((cell, ci) => {
              const span = layout[ri]?.[ci];
              // 다른 셀에 덮인 자리 — 그리지 않는다 (그리면 열 수가 늘어 표가 깨진다)
              if (span?.skip) return null;
              const header = p.hasHeader && ri === 0;
              const editing = editingCell?.r === ri && editingCell?.c === ci;
              const Cell = header ? "th" : "td";
              return (
                <Cell
                  key={ci}
                  className={`border px-2 py-1 align-top ${
                    header ? "bg-muted font-medium" : ""
                  } ${editable && !editing ? "cursor-text" : ""}`}
                  style={{ textAlign: alignOf(ci) }}
                  rowSpan={span?.rowSpan === 1 ? undefined : span?.rowSpan}
                  colSpan={span?.colSpan === 1 ? undefined : span?.colSpan}
                  onDoubleClick={
                    editable
                      ? (e) => {
                          // 블록 전체 편집(더블클릭)으로 번지지 않게 여기서 멈춘다
                          e.stopPropagation();
                          onStartCellEdit?.(ri, ci);
                        }
                      : undefined
                  }
                >
                  <InlineText
                    text={cell}
                    editing={editing}
                    // 표 칸은 값을 바꾸는 자리라 진입 시 전체 선택한다 (본문 블록과 다르다)
                    selectAll
                    onCommit={(text) => onCellCommit?.(ri, ci, text)}
                    onCancel={onCancel}
                  />
                </Cell>
              );
            })}
          </tr>
        ))}
      </tbody>
    </table>

    {/* 행 경계 손잡이 — 아래쪽 변을 끌어 그 행의 높이를 바꾼다 */}
    {showColumnHandles && onResizeRow
      ? rowGeo.map((geo, i) => (
          <div
            key={`row-${i}`}
            role="separator"
            aria-orientation="horizontal"
            aria-label={`${i + 1}번째 행 높이`}
            onMouseDown={(e) => beginRowDrag(i, e)}
            onDoubleClick={(e) => e.stopPropagation()}
            className="absolute inset-x-0 z-10 h-2 -translate-y-1/2 cursor-row-resize hover:bg-primary/30"
            style={{ top: geo.bottom }}
          />
        ))
      : null}

    {/* 열 경계 손잡이 — 고른 블록에서만 보인다 */}
    {showColumnHandles && onResizeColumn
      ? boundaries.map((left, i) => (
          <div
            key={i}
            role="separator"
            aria-orientation="vertical"
            aria-label={`${i + 1}번째와 ${i + 2}번째 열 경계`}
            onMouseDown={(e) => beginColumnDrag(i, e)}
            onDoubleClick={(e) => e.stopPropagation()}
            className="absolute top-0 z-10 h-full w-2 -translate-x-1/2 cursor-col-resize hover:bg-primary/30"
            style={{ left: `${left}%` }}
          />
        ))
      : null}
    </div>
  );
}
