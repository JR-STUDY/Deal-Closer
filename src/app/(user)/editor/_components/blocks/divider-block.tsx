import type { Block, BlockPropsMap } from "@/lib/editor-schema";

export function DividerBlock({ block }: { block: Block }) {
  const p = block.props as BlockPropsMap["divider"];
  const lineStyle = p.dashed ? "dashed" : "solid";
  return (
    <div className="flex h-full w-full items-center justify-center">
      <div
        style={
          p.orientation === "vertical"
            ? {
                height: "100%",
                borderLeftWidth: p.thickness,
                borderLeftStyle: lineStyle,
                borderColor: p.color,
              }
            : {
                width: "100%",
                borderTopWidth: p.thickness,
                borderTopStyle: lineStyle,
                borderColor: p.color,
              }
        }
      />
    </div>
  );
}
