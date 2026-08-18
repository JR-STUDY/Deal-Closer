import type { Block, BlockPropsMap } from "@/lib/editor-schema";

export function ClientMetaBlock({ block }: { block: Block }) {
  const p = block.props as BlockPropsMap["clientMeta"];
  return (
    <table className="w-full border-collapse text-xs">
      <tbody>
        {p.fields.map((f) => (
          <tr key={f.id}>
            <th
              className="border bg-muted px-2 py-1 align-top text-left font-medium text-muted-foreground"
              style={{ width: p.labelWidth }}
            >
              {f.label}
            </th>
            <td className="border px-2 py-1 align-top">{f.value}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}
