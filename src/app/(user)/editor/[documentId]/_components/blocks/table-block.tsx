import type { Block, BlockPropsMap, Align } from "@/lib/editor-schema";
import { tableLayout } from "@/lib/editor-schema";

export function TableBlock({ block }: { block: Block }) {
  const p = block.props as BlockPropsMap["table"];
  const alignOf = (ci: number): Align => p.colAligns?.[ci] ?? "left";
  // 병합 계산은 tableLayout 하나가 한다 — 인쇄 렌더러도 같은 함수를 쓴다
  const { cells, layout } = tableLayout(p);
  return (
    <table className="w-full border-collapse text-xs">
      <tbody>
        {cells.map((row, ri) => (
          <tr key={ri}>
            {row.map((cell, ci) => {
              const span = layout[ri]?.[ci];
              // 다른 셀에 덮인 자리 — 그리지 않는다 (그리면 열 수가 늘어 표가 깨진다)
              if (span?.skip) return null;
              const header = p.hasHeader && ri === 0;
              const style = { textAlign: alignOf(ci) } as const;
              const spanProps = {
                rowSpan: span?.rowSpan === 1 ? undefined : span?.rowSpan,
                colSpan: span?.colSpan === 1 ? undefined : span?.colSpan,
              };
              return header ? (
                <th
                  key={ci}
                  className="border bg-muted px-2 py-1 align-top font-medium"
                  style={style}
                  {...spanProps}
                >
                  {cell}
                </th>
              ) : (
                <td
                  key={ci}
                  className="border px-2 py-1 align-top"
                  style={style}
                  {...spanProps}
                >
                  {cell}
                </td>
              );
            })}
          </tr>
        ))}
      </tbody>
    </table>
  );
}
