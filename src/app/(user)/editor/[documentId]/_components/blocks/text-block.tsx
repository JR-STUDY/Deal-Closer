import type { Block, BlockPropsMap } from "@/lib/editor-schema";
import { FONT_FAMILIES, textFormat } from "@/lib/editor-schema";
import { InlineText } from "./inline-text";

export function TextBlock({
  block,
  editing = false,
  onCommit,
  onCancel,
}: {
  block: Block;
  /** 캔버스에서 직접 편집 중인지 (더블클릭으로 진입) */
  editing?: boolean;
  onCommit?: (text: string) => void;
  onCancel?: () => void;
}) {
  const p = block.props as BlockPropsMap["text"];
  // 서식 기본값은 textFormat 하나가 정한다 — 인쇄 렌더러도 같은 함수를 쓴다
  const f = textFormat(p, "text");
  return (
    <InlineText
      className="h-full w-full whitespace-pre-wrap px-2 py-1"
      style={{
        textAlign: p.align,
        fontSize: p.fontSize,
        fontFamily: FONT_FAMILIES[p.fontFamily],
        color: p.color,
        border: p.border ? `1px solid ${p.borderColor}` : undefined,
        fontWeight: f.bold ? 700 : 400,
        fontStyle: f.italic ? "italic" : "normal",
        lineHeight: f.lineHeight,
      }}
      text={p.text}
      editing={editing}
      onCommit={onCommit}
      onCancel={onCancel}
    />
  );
}
