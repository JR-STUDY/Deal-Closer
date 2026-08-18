"use client";

import { useCallback, useRef } from "react";
import { toast } from "sonner";
import type { Block, EditorDoc } from "@/lib/editor-schema";
import { BLOCK_LABELS, uid } from "@/lib/editor-schema";
import type { DocUpdater, SetDocOptions } from "./use-doc-history";

/**
 * 블록 복제·복사·붙여넣기 (진단 5).
 *
 * 예전에는 비슷한 블록을 매번 새로 추가해 좌표를 손으로 맞춰야 했다.
 *
 * 클립보드는 **앱 안에만** 둔다 — 시스템 클립보드를 쓰면 권한 프롬프트가 뜨고,
 * 문서 본문을 복사하려던 사용자의 실제 클립보드를 덮어쓴다.
 *
 * 다중선택을 받으므로 대상은 항상 **배열**이다. 여러 개를 복사·복제할 때
 * **상대 배치를 유지한 채** 묶음 전체를 같은 만큼 옮긴다 — 각자 옮기면 배치가 흐트러진다.
 */

/** 붙여넣기·복제 위치 오프셋 — 원본에 정확히 겹치면 복제된 줄 모른다 */
const PASTE_OFFSET = 12;

export function useBlockClipboard(options: {
  doc: EditorDoc;
  editDoc: (updater: DocUpdater, options?: SetDocOptions) => void;
  /** 새로 만든 블록들을 선택 상태로 만든다 */
  onInserted: (ids: string[]) => void;
}) {
  const { doc, editDoc, onInserted } = options;
  const clipboardRef = useRef<Block[]>([]);

  /** 원본들을 같은 오프셋으로 복사해 넣는다 (한 번의 editDoc = 되돌리기 1건) */
  const insertCopies = useCallback(
    (sources: Block[]) => {
      if (sources.length === 0) return;
      const copies = sources.map((source) => ({
        ...structuredClone(source),
        id: uid(),
        x: source.x + PASTE_OFFSET,
        y: source.y + PASTE_OFFSET,
      }));
      editDoc((d) => ({ ...d, blocks: [...d.blocks, ...copies] }));
      onInserted(copies.map((c) => c.id));
    },
    [editDoc, onInserted],
  );

  /** 문서 순서를 유지해 뽑는다 — 선택한 순서로 뽑으면 겹침 순서가 뒤섞인다 */
  const pick = useCallback(
    (ids: string[]) => {
      const set = new Set(ids);
      return doc.blocks.filter((b) => set.has(b.id));
    },
    [doc.blocks],
  );

  const duplicate = useCallback(
    (ids: string[]) => insertCopies(pick(ids)),
    [insertCopies, pick],
  );

  const copy = useCallback(
    (ids: string[]) => {
      const sources = pick(ids);
      if (sources.length === 0) return;
      clipboardRef.current = sources.map((b) => structuredClone(b));
      toast.success(
        sources.length === 1
          ? `${BLOCK_LABELS[sources[0].type]} 블록을 복사했습니다.`
          : `블록 ${sources.length}개를 복사했습니다.`,
      );
    },
    [pick],
  );

  const paste = useCallback(
    () => insertCopies(clipboardRef.current),
    [insertCopies],
  );

  return { duplicate, copy, paste };
}
