"use client";

import type { EditorDoc } from "@/lib/editor-schema";
import { pageCount } from "@/lib/editor-schema";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { renderBlock } from "./blocks";

type Props = {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  doc: EditorDoc;
  title: string;
};

/** 페이지 단위 미리보기 모달 (#8) — A4 페이지별로 블록을 렌더 (읽기 전용) */
export function EditorPreview({ open, onOpenChange, doc, title }: Props) {
  const pages = pageCount(doc);
  const { w, h } = doc.canvas;
  const scale = Math.min(1, 680 / w);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        className="flex max-h-[90vh] max-w-[92vw] flex-col overflow-hidden sm:max-w-[760px]"
        style={{ resize: "both" }}
      >
        <DialogHeader>
          <DialogTitle className="truncate">미리보기 · {title}</DialogTitle>
        </DialogHeader>
        <div className="min-h-0 flex-1 overflow-auto rounded bg-muted/40 p-6">
          <div className="mx-auto flex w-fit flex-col gap-6">
            {Array.from({ length: pages }).map((_, i) => (
              <div
                key={i}
                className="relative shrink-0 overflow-hidden bg-white shadow ring-1 ring-border"
                style={{ width: w * scale, height: h * scale }}
              >
                <div
                  className="absolute left-0 top-0"
                  style={{
                    width: w,
                    height: h,
                    transform: `scale(${scale})`,
                    transformOrigin: "top left",
                  }}
                >
                  {doc.blocks
                    .filter((b) => b.y < (i + 1) * h && b.y + b.h > i * h)
                    .map((b) => (
                      <div
                        key={b.id}
                        className="absolute overflow-hidden"
                        style={{
                          left: b.x,
                          top: b.y - i * h,
                          width: b.w,
                          height: b.h,
                          zIndex: b.z,
                        }}
                      >
                        {renderBlock(b)}
                      </div>
                    ))}
                </div>
                <span className="absolute bottom-1 right-2 text-[10px] text-muted-foreground">
                  {i + 1} / {pages}
                </span>
              </div>
            ))}
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
