"use client";

import { useLayoutEffect, useRef, useState } from "react";
import type { Block, BlockPropsMap, Align } from "@/lib/editor-schema";
import { normalizeColWidths, normalizeRowHeights, tableLayout } from "@/lib/editor-schema";
import { sameCell, type CellRef } from "@/lib/editor-cell";
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
  editingRef,
  onCommitCell,
  onStartEdit,
  onCancel,
  showColumnHandles = false,
  onResizeColumn,
  onResizeRow,
}: {
  block: Block;
  /** 지금 편집 중인 칸 (다른 블록의 칸이면 부모가 걸러 준다) */
  editingRef?: CellRef | null;
  onCommitCell?: (ref: CellRef, text: string) => void;
  onStartEdit?: (ref: CellRef) => void;
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
  const editable = onStartEdit !== undefined;
  const colCount = cells[0]?.length ?? 0;
  const widths = normalizeColWidths(p.colWidths, colCount);
  const heights = normalizeRowHeights(p.rowHeights, cells.length);
  const wrapRef = useRef<HTMLDivElement>(null);
  const tableRef = useRef<HTMLTableElement>(null);

  /**
   * 경계를 끌어 열 폭을 바꾼다.
   * 이동량은 **표 폭 대비 %** 로 환산한다 — 캔버스에 `transform: scale()` 이 걸려 있어도
   * 같은 비율이 나오도록 화면 px 를 표의 화면 폭으로 나눈다(둘 다 배율이 곱해져 상쇄된다).
   */
  function beginColumnDrag(index: number, e: React.MouseEvent) {
    // Rnd 가 블록 드래그를 시작하지 않게 막는다
    e.stopPropagation();
    e.preventDefault();
    /*
     * 표 폭은 **이벤트가 준 요소**에서 잰다 (손잡이의 부모가 곧 감싸는 상자다).
     * ref 로 읽으면 "렌더 중 ref 접근" 으로 잡히고(react-hooks/refs), 상태로 들고 있으면
     * 확대 배율이 바뀔 때 낡은 값이 된다 — 배율은 블록을 바꾸지 않아 다시 재지 않는다.
     * 여기서 재면 배율이 걸린 화면 폭을 그때그때 얻는다(이동량도 화면 px 라 상쇄된다).
     */
    const width =
      e.currentTarget.parentElement?.getBoundingClientRect().width ?? 0;
    if (width <= 0) return;
    const startX = e.clientX;
    // 저장된 폭이 없으면 지금 보이는 비율에서 이어 간다 (조정 시작에 표가 튀지 않게)
    const baseline = columnBaseline();
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
  /**
   * 지금 화면에 그려진 열 비율(%) — 저장된 폭이 없을 때 조정의 시작점이다.
   * 없으면 첫 조정에 표가 균등 분배로 튄다.
   *
   * **상태로 둔다.** 예전에는 조정을 시작할 때 ref 로 DOM 을 직접 쟀는데, 그러면
   * 렌더 중 ref 를 읽는 함수를 이벤트 핸들러에 넘기는 모양이 되어 규칙에 걸린다
   * (react-hooks/refs). 행 높이와 똑같이 레이아웃 직후 한 번 재서 들고 있으면 된다.
   */
  const [colPercents, setColPercents] = useState<number[] | null>(null);
  /*
   * 레이아웃 직후 행 높이와 열 비율을 잰다.
   *
   * 효과 안에서 ref 를 읽는 것은 규칙에 맞다 — 예전처럼 이벤트 핸들러가 부르는 함수에서
   * 재면 "렌더 중 ref 읽기" 로 잡힌다(react-hooks/refs). 내용·폭이 바뀌면 다시 잰다.
   */
  useLayoutEffect(() => {
    const table = tableRef.current;
    const wrap = wrapRef.current;
    if (!table || !wrap) return;

    const base = wrap.getBoundingClientRect().top;
    const rows = [...table.rows].map((tr) => {
      const r = tr.getBoundingClientRect();
      return { bottom: Math.round(r.bottom - base), height: Math.round(r.height) };
    });
    setRowGeo((current) =>
      current.length === rows.length &&
      current.every((c, i) => c.bottom === rows[i].bottom && c.height === rows[i].height)
        ? current
        : rows,
    );

    /*
     * 열 비율은 **병합이 없는 행에서만** 잰다 — colspan 이 걸린 행의 칸 폭은 여러 열의
     * 합이라 열별 폭을 알 수 없다. 그런 행이 없으면 null 이고 균등 분배로 시작한다.
     */
    const plainRow = layout.findIndex(
      (row) =>
        row.length === colCount &&
        row.every((cell) => !cell.skip && cell.rowSpan === 1 && cell.colSpan === 1),
    );
    const tr = plainRow >= 0 ? table.rows[plainRow] : null;
    const px =
      tr && tr.cells.length === colCount
        ? [...tr.cells].map((cell) => cell.offsetWidth)
        : null;
    const total = px?.reduce((a, b) => a + b, 0) ?? 0;
    const percents = px && total > 0 ? px.map((w) => (w / total) * 100) : null;
    setColPercents((current) => {
      if (current === null && percents === null) return current;
      if (
        current !== null &&
        percents !== null &&
        current.length === percents.length &&
        current.every((c, i) => Math.abs(c - percents[i]) < 0.01)
      ) {
        return current;
      }
      return percents;
    });
  }, [block, layout, colCount]);

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

  /** 저장된 폭이 있으면 그것을 쓰고, 없으면 화면에서 잰 비율에서 이어 간다 */
  function columnBaseline(): number[] | null {
    return p.colWidths && p.colWidths.length > 0 ? null : colPercents;
  }

  /*
   * 키보드로도 폭·높이를 바꾼다.
   *
   * 드래그만 두면 마우스 없이는 표를 조정할 방법이 아예 없다 — 이 프로젝트는 같은 상황에
   * 대해 이미 규칙을 갖고 있다("단계 변경 UI 는 드래그 전용으로 만들지 않는다", ACC_*).
   * 인스펙터에도 폭·높이 입력이 없으므로 여기가 유일한 경로다.
   *
   * 방향키는 **캔버스의 블록 이동과 같은 키**다 — `stopPropagation` 으로 삼켜야 손잡이에
   * 포커스를 둔 채 누를 때 블록이 함께 움직이지 않는다.
   */
  const COL_STEP = 1; // %
  const ROW_STEP = 4; // px
  const COARSE = 4; // ⇧ 를 누르면 이만큼 곱한다

  function onColumnKeyDown(index: number, e: React.KeyboardEvent) {
    const dir = e.key === "ArrowLeft" ? -1 : e.key === "ArrowRight" ? 1 : 0;
    if (dir === 0) return;
    e.preventDefault();
    e.stopPropagation();
    onResizeColumn?.(
      index,
      dir * COL_STEP * (e.shiftKey ? COARSE : 1),
      columnBaseline(),
    );
  }

  function onRowKeyDown(index: number, e: React.KeyboardEvent) {
    const dir = e.key === "ArrowUp" ? -1 : e.key === "ArrowDown" ? 1 : 0;
    if (dir === 0) return;
    e.preventDefault();
    e.stopPropagation();
    const measured = rowGeo[index]?.height ?? 0;
    onResizeRow?.(index, dir * ROW_STEP * (e.shiftKey ? COARSE : 1), measured);
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
              const ref: CellRef = { kind: "cell", r: ri, c: ci };
              const editing = sameCell(editingRef, ref);
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
                          onStartEdit?.(ref);
                        }
                      : undefined
                  }
                >
                  <InlineText
                    text={cell}
                    editing={editing}
                    // 표 칸은 값을 바꾸는 자리라 진입 시 전체 선택한다 (본문 블록과 다르다)
                    selectAll
                    onCommit={(text) => onCommitCell?.(ref, text)}
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
            aria-label={`${i + 1}번째 행 높이 (방향키로 조정)`}
            aria-valuenow={geo.height}
            tabIndex={0}
            onMouseDown={(e) => beginRowDrag(i, e)}
            onKeyDown={(e) => onRowKeyDown(i, e)}
            onDoubleClick={(e) => e.stopPropagation()}
            className="absolute inset-x-0 z-10 h-2 -translate-y-1/2 cursor-row-resize hover:bg-primary/30 focus-visible:bg-primary/50 focus-visible:outline-2 focus-visible:outline-primary"
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
            aria-label={`${i + 1}번째와 ${i + 2}번째 열 경계 (방향키로 조정)`}
            aria-valuenow={Math.round(left)}
            aria-valuemin={0}
            aria-valuemax={100}
            tabIndex={0}
            onMouseDown={(e) => beginColumnDrag(i, e)}
            onKeyDown={(e) => onColumnKeyDown(i, e)}
            onDoubleClick={(e) => e.stopPropagation()}
            className="absolute top-0 z-10 h-full w-2 -translate-x-1/2 cursor-col-resize hover:bg-primary/30 focus-visible:bg-primary/50 focus-visible:outline-2 focus-visible:outline-primary"
            style={{ left: `${left}%` }}
          />
        ))
      : null}
    </div>
  );
}
