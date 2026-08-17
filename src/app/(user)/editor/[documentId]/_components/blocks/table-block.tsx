import type { Block, BlockPropsMap, Align } from "@/lib/editor-schema";

export function TableBlock({ block }: { block: Block }) {
  const p = block.props as BlockPropsMap["table"];
  const alignOf = (ci: number): Align => p.colAligns?.[ci] ?? "left";
  return (
    <table className="w-full border-collapse text-xs">
      <tbody>
        {p.cells.map((row, ri) => (
          <tr key={ri}>
            {row.map((cell, ci) => {
              const header = p.hasHeader && ri === 0;
              const style = { textAlign: alignOf(ci) } as const;
              return header ? (
                <th
                  key={ci}
                  className="border bg-muted px-2 py-1 align-top font-medium"
                  style={style}
                >
                  {cell}
                </th>
              ) : (
                <td key={ci} className="border px-2 py-1 align-top" style={style}>
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
