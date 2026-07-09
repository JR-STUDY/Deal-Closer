import type { Block, BlockPropsMap } from "@/lib/editor-schema";

export function TableBlock({ block }: { block: Block }) {
  const p = block.props as BlockPropsMap["table"];
  return (
    <table className="h-full w-full border-collapse text-xs">
      <tbody>
        {p.cells.map((row, ri) => (
          <tr key={ri}>
            {row.map((cell, ci) => {
              const header = p.hasHeader && ri === 0;
              return header ? (
                <th
                  key={ci}
                  className="border bg-muted px-2 py-1 text-left font-medium"
                >
                  {cell}
                </th>
              ) : (
                <td key={ci} className="border px-2 py-1">
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
