import type { Block, BlockPropsMap } from "@/lib/editor-schema";
import { FONT_FAMILIES } from "@/lib/editor-schema";

export function TitleBlock({ block }: { block: Block }) {
  const p = block.props as BlockPropsMap["title"];
  return (
    <div
      className="flex h-full w-full items-center px-2 font-bold tracking-widest"
      style={{
        textAlign: p.align,
        fontSize: p.fontSize,
        fontFamily: FONT_FAMILIES[p.fontFamily],
        color: p.color,
        border: p.border ? `1px solid ${p.borderColor}` : undefined,
        justifyContent:
          p.align === "center"
            ? "center"
            : p.align === "right"
              ? "flex-end"
              : "flex-start",
      }}
    >
      {p.text}
    </div>
  );
}
