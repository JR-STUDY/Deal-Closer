"use client";

import { useCallback, useState } from "react";
import { toast } from "sonner";
import type { EditorDoc } from "@/lib/editor-schema";
import type { DocUpdater, SetDocOptions } from "./use-doc-history";
import { FIT_TOLERANCE, naturalBlockHeight } from "./measure-block";

/**
 * 잘린 블록 집계와 "내용 높이에 맞추기" (진단 4).
 *
 * 넘침 측정은 각 `CanvasBlock` 이 `use-overflow` 로 하고, 여기서는 **어느 블록이 잘렸는지**만
 * 모아 툴바 안내("잘린 블록 N개")와 일괄 맞춤에 쓴다.
 *
 * 맞추기는 **양방향**이다 — 내용이 넘치면 늘리고, 남으면 줄인다. 넘침만 고칠 수 있으면
 * 표를 지운 뒤 남은 빈 상자를 손으로 끌어 줄여야 하고, 그 결과가 사람마다 달라진다.
 *
 * 다만 **자동으로 하지는 않는다**. 블록이 절대 좌표라서 높이를 늘리면 아래 블록을 덮어
 * 잘림이 **겹침**으로 바뀐다(겹침은 PDF 에서도 안 보인다). 여백도 의도한 것일 수 있다.
 * 그래서 판단은 사용자가 하고, 우리는 한 번에 맞출 길만 준다.
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
   * 주어진 블록들을 내용 높이에 맞춘다 (한 번의 편집 = 되돌리기 1건).
   * 실제로 바뀐 블록 수를 돌려준다 — 이미 맞은 것은 세지 않는다.
   */
  const fitBlocks = useCallback(
    (ids: string[]) => {
      const heights = new Map<string, number>();
      for (const id of ids) {
        const height = naturalBlockHeight(id);
        if (height === null) continue;
        const block = doc.blocks.find((b) => b.id === id);
        // 이미 맞았으면 건드리지 않는다 (불필요한 미저장 표시를 만들지 않게)
        if (!block || Math.abs(block.h - height) <= FIT_TOLERANCE) continue;
        heights.set(id, height);
      }
      if (heights.size === 0) return 0;

      editDoc((d) => ({
        ...d,
        blocks: d.blocks.map((b) => {
          const h = heights.get(b.id);
          return h === undefined ? b : { ...b, h };
        }),
      }));

      // 늘어난 블록이 페이지 경계를 넘으면 알린다 — 넘긴 부분은 다음 장에서 잘려 이어진다
      const pageH = doc.canvas.h;
      const crosses = [...heights].some(([id, h]) => {
        const block = doc.blocks.find((b) => b.id === id);
        if (!block || h <= block.h) return false;
        return (
          Math.floor((block.y + h - 1) / pageH) > Math.floor(block.y / pageH)
        );
      });
      if (crosses) {
        toast.warning(
          "블록을 늘리니 페이지 경계를 넘습니다. 위치를 옮기거나 페이지를 추가해 주세요.",
        );
      }
      return heights.size;
    },
    [doc.blocks, doc.canvas.h, editDoc],
  );

  /** 한 블록 — 배지·우클릭 메뉴·인스펙터에서 부른다 */
  const handleFit = useCallback((id: string) => fitBlocks([id]), [fitBlocks]);

  /** 잘린 블록을 한 번에 (툴바) — 하나씩 누르지 않게 */
  const handleFitAll = useCallback(() => {
    const changed = fitBlocks([...clippedIds]);
    if (changed > 0) {
      toast.success(`잘린 블록 ${changed}개를 내용에 맞췄습니다.`);
    }
  }, [clippedIds, fitBlocks]);

  /** 고른 블록을 한 번에 (정렬 패널) — 넘친 것도 남는 것도 함께 맞춘다 */
  const handleFitSelected = useCallback(
    (ids: string[]) => {
      const changed = fitBlocks(ids);
      toast.success(
        changed === 0
          ? "이미 내용 높이에 맞아 있습니다."
          : `블록 ${changed}개를 내용 높이에 맞췄습니다.`,
      );
    },
    [fitBlocks],
  );

  return {
    clippedCount: clippedIds.size,
    handleClippedChange,
    handleFit,
    handleFitAll,
    handleFitSelected,
  };
}
