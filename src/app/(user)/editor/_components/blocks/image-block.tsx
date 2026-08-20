import type { Block, BlockPropsMap } from "@/lib/editor-schema";

export function ImageBlock({ block }: { block: Block }) {
  const p = block.props as BlockPropsMap["image"];
  const border = p.border ? `1px solid ${p.borderColor}` : undefined;
  if (!p.dataUrl) {
    return (
      <div
        className="flex h-full w-full items-center justify-center border border-dashed text-[11px] text-muted-foreground"
        style={{ border }}
      >
        이미지 없음
      </div>
    );
  }
  // 에디터 미리보기용 data URL — next/image 불필요
  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src={p.dataUrl}
      alt={p.alt}
      className="h-full w-full"
      style={{
        objectFit: p.fit,
        opacity: p.opacity / 100,
        border,
      }}
    />
  );
}
