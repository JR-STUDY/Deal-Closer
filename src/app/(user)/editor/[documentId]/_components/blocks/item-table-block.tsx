import type { Block, BlockPropsMap } from "@/lib/editor-schema";
import { calcItemTableTotal } from "@/lib/editor-schema";
import { formatKRW } from "@/lib/format";

export function ItemTableBlock({ block }: { block: Block }) {
  const p = block.props as BlockPropsMap["itemTable"];
  const extraCols = p.extraColumns ?? [];
  const total = calcItemTableTotal(p.rows);
  return (
    <table className="h-full w-full border-collapse text-xs">
      <thead>
        <tr className="bg-muted">
          <th className="border px-2 py-1 text-left">품목 / 설명</th>
          {extraCols.map((c) => (
            <th key={c.id} className="border px-2 py-1" style={{ textAlign: c.align }}>
              {c.label}
            </th>
          ))}
          <th className="border px-2 py-1 text-right">수량</th>
          <th className="border px-2 py-1 text-right">단가</th>
          <th className="border px-2 py-1 text-right">금액</th>
        </tr>
      </thead>
      <tbody>
        {p.rows.map((r) => (
          <tr key={r.id}>
            <td className="border px-2 py-1">
              <div className="font-medium">{r.name}</div>
              {r.description ? (
                <div className="text-[11px] text-muted-foreground">
                  {r.description}
                </div>
              ) : null}
            </td>
            {extraCols.map((c) => (
              <td
                key={c.id}
                className="border px-2 py-1"
                style={{ textAlign: c.align }}
              >
                {r.extra?.[c.id] ?? ""}
              </td>
            ))}
            <td className="border px-2 py-1 text-right tabular-nums">
              {r.quantity}
            </td>
            <td className="border px-2 py-1 text-right tabular-nums">
              {formatKRW(r.unitPrice)}
            </td>
            <td className="border px-2 py-1 text-right tabular-nums">
              {formatKRW(r.quantity * r.unitPrice)}
            </td>
          </tr>
        ))}
      </tbody>
      {p.showTotal ? (
        <tfoot>
          <tr>
            <td
              className="border px-2 py-1 text-right font-semibold"
              colSpan={3 + extraCols.length}
            >
              합계
            </td>
            <td className="border px-2 py-1 text-right font-semibold tabular-nums">
              {formatKRW(total)}
            </td>
          </tr>
        </tfoot>
      ) : null}
    </table>
  );
}
