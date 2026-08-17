import type { Block, BlockPropsMap } from "@/lib/editor-schema";
import { FONT_FAMILIES, textFormat } from "@/lib/editor-schema";
import { InlineText } from "./inline-text";

export function TitleBlock({
  block,
  editing = false,
  onCommit,
  onCancel,
}: {
  block: Block;
  editing?: boolean;
  onCommit?: (text: string) => void;
  onCancel?: () => void;
}) {
  const p = block.props as BlockPropsMap["title"];
  // 굵기는 더 이상 하드코딩하지 않는다 — 제목도 보통 굵기로 만들 수 있어야 한다
  const f = textFormat(p, "title");
  return (
    <InlineText
      className="flex h-full w-full items-center px-2 tracking-widest"
      style={{
        textAlign: p.align,
        fontSize: p.fontSize,
        fontFamily: FONT_FAMILIES[p.fontFamily],
        color: p.color,
        border: p.border ? `1px solid ${p.borderColor}` : undefined,
        fontWeight: f.bold ? 700 : 400,
        fontStyle: f.italic ? "italic" : "normal",
        lineHeight: f.lineHeight,
        justifyContent:
          p.align === "center"
            ? "center"
            : p.align === "right"
              ? "flex-end"
              : "flex-start",
      }}
      text={p.text}
      editing={editing}
      onCommit={onCommit}
      onCancel={onCancel}
    />
  );
}
