import type { Block, BlockPropsMap } from "@/lib/editor-schema";
import { FONT_FAMILIES } from "@/lib/editor-schema";

export function TextBlock({ block }: { block: Block }) {
  const p = block.props as BlockPropsMap["text"];
  return (
    <div
      className="h-full w-full whitespace-pre-wrap px-2 py-1 leading-relaxed"
      style={{
        textAlign: p.align,
        fontSize: p.fontSize,
        fontFamily: FONT_FAMILIES[p.fontFamily],
        color: p.color,
        border: p.border ? `1px solid ${p.borderColor}` : undefined,
      }}
    >
      {p.text}
    </div>
  );
}
