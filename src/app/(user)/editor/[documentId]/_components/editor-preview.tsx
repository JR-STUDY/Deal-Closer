"use client";

import { useState } from "react";
import type { EditorDoc } from "@/lib/editor-schema";
import { pageCount } from "@/lib/editor-schema";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { renderBlock } from "./blocks";

type Props = {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  doc: EditorDoc;
  title: string;
};

/** 페이지 단위 미리보기 모달 (#8, #10) — 페이지네이션으로 한 장씩 확인 */
export function EditorPreview({ open, onOpenChange, doc, title }: Props) {
  const pages = pageCount(doc);
  const { w, h } = doc.canvas;
  const scale = Math.min(1, 680 / w);
  const [page, setPage] = useState(0);
  const current = Math.min(page, pages - 1);

  const pageBlocks = doc.blocks.filter(
    (b) => b.y < (current + 1) * h && b.y + b.h > current * h,
  );

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        className="flex max-h-[90vh] max-w-[92vw] flex-col overflow-hidden sm:max-w-[760px]"
        style={{ resize: "both" }}
      >
        <DialogHeader>
          <DialogTitle className="truncate">미리보기 · {title}</DialogTitle>
        </DialogHeader>

        {/* 페이지네이션 (#10) */}
        <div className="flex items-center justify-center gap-3">
          <Button
            variant="outline"
            size="icon"
            aria-label="이전 페이지"
            disabled={current <= 0}
            onClick={() => setPage((p) => Math.max(0, p - 1))}
          >
            <ChevronLeft className="size-4" />
          </Button>
          <span className="min-w-16 text-center text-sm tabular-nums">
            {current + 1} / {pages}
          </span>
          <Button
            variant="outline"
            size="icon"
            aria-label="다음 페이지"
            disabled={current >= pages - 1}
            onClick={() => setPage((p) => Math.min(pages - 1, p + 1))}
          >
            <ChevronRight className="size-4" />
          </Button>
        </div>

        <div className="min-h-0 flex-1 overflow-auto rounded bg-muted/40 p-6">
          <div
            className="relative mx-auto shrink-0 overflow-hidden bg-white shadow ring-1 ring-border"
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
              {pageBlocks.map((b) => (
                <div
                  key={b.id}
                  className="absolute overflow-hidden"
                  style={{
                    left: b.x,
                    top: b.y - current * h,
                    width: b.w,
                    height: b.h,
                    zIndex: b.z,
                  }}
                >
                  {renderBlock(b)}
                </div>
              ))}
            </div>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
