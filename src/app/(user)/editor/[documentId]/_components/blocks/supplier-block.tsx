import type { Block, BlockPropsMap } from "@/lib/editor-schema";

export function SupplierBlock({ block }: { block: Block }) {
  const p = block.props as BlockPropsMap["supplier"];
  return (
    <table className="h-full w-full border-collapse text-[11px]">
      <tbody>
        {p.fields.map((f) => (
          <tr key={f.id}>
            <th
              className="border bg-muted px-1 py-0.5 text-left font-medium text-muted-foreground"
              style={{ width: p.labelWidth }}
            >
              {f.label}
            </th>
            <td className="border px-1 py-0.5">{f.value}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}
