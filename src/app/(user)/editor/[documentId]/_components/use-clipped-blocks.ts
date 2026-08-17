"use client";

import { useCallback, useState } from "react";
import { toast } from "sonner";
import type { EditorDoc } from "@/lib/editor-schema";
import type { DocUpdater, SetDocOptions } from "./use-doc-history";

/**
 * 잘린 블록 집계와 "내용에 맞추기" (진단 4).
 *
 * 측정은 각 `CanvasBlock` 이 `use-overflow` 로 하고, 여기서는 **어느 블록이 잘렸는지**만
 * 모아 툴바 안내("잘린 블록 N개")와 일괄 맞춤에 쓴다.
 *
 * 자동으로 늘리지 않는 이유는 `use-overflow` 주석에 적어 두었다 — 블록이 절대 좌표라서
 * 높이를 늘리면 아래 블록을 덮어, 잘림이 **겹침**으로 바뀐다(겹침은 PDF 에서도 안 보인다).
 */
export function useClippedBlocks(options: {
  doc: EditorDoc;
  editDoc: (updater: DocUpdater, options?: SetDocOptions) => void;
}) {
  const { doc, editDoc } = options;
  const [clippedIds, setClippedIds] = useState<ReadonlySet<string>>(
    () => new Set(),
  );

  const handleClippedChange = useCallback((id: string, clipped: boolean) => {
    setClippedIds((current) => {
      if (clipped === current.has(id)) return current;
      const next = new Set(current);
      if (clipped) next.add(id);
      else next.delete(id);
      return next;
    });
  }, []);

  /**
   * 한 블록을 내용 높이에 맞춘다.
   * 늘린 결과가 페이지 경계를 넘으면 알린다 — 넘긴 부분은 다음 장에서 잘려 이어진다.
   */
  const handleFit = useCallback(
    (id: string, contentHeight: number) => {
      editDoc((d) => ({
        ...d,
        blocks: d.blocks.map((b) =>
          b.id === id && contentHeight > b.h ? { ...b, h: contentHeight } : b,
        ),
      }));
      const block = doc.blocks.find((b) => b.id === id);
      if (!block) return;
      const pageH = doc.canvas.h;
      if (
        Math.floor((block.y + contentHeight - 1) / pageH) >
        Math.floor(block.y / pageH)
      ) {
        toast.warning(
          "블록을 늘리니 페이지 경계를 넘습니다. 위치를 옮기거나 페이지를 추가해 주세요.",
        );
      }
    },
    [editDoc, doc.blocks, doc.canvas.h],
  );

  /** 잘린 블록을 한 번에 맞춘다 — 하나씩 누르지 않게 (자동 확장 대신 주는 편의) */
  const handleFitAll = useCallback(() => {
    const heights = new Map<string, number>();
    for (const id of clippedIds) {
      const node = document.querySelector<HTMLElement>(
        `[data-block-id="${id}"]`,
      );
      if (node) heights.set(id, Math.ceil(node.scrollHeight));
    }
    if (heights.size === 0) return;
    editDoc((d) => ({
      ...d,
      blocks: d.blocks.map((b) => {
        const h = heights.get(b.id);
        return h !== undefined && h > b.h ? { ...b, h } : b;
      }),
    }));
    toast.success(`잘린 블록 ${heights.size}개를 내용에 맞췄습니다.`);
  }, [clippedIds, editDoc]);

  return {
    clippedCount: clippedIds.size,
    handleClippedChange,
    handleFit,
    handleFitAll,
  };
}
