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
 */

/** 붙여넣기·복제 위치 오프셋 — 원본에 정확히 겹치면 복제된 줄 모른다 */
const PASTE_OFFSET = 12;

export function useBlockClipboard(options: {
  doc: EditorDoc;
  editDoc: (updater: DocUpdater, options?: SetDocOptions) => void;
  /** 새로 만든 블록을 선택 상태로 만든다 */
  onInserted: (id: string) => void;
}) {
  const { doc, editDoc, onInserted } = options;
  const clipboardRef = useRef<Block | null>(null);

  const insertCopy = useCallback(
    (source: Block) => {
      const copy: Block = {
        ...structuredClone(source),
        id: uid(),
        x: source.x + PASTE_OFFSET,
        y: source.y + PASTE_OFFSET,
      };
      editDoc((d) => ({ ...d, blocks: [...d.blocks, copy] }));
      onInserted(copy.id);
    },
    [editDoc, onInserted],
  );

  const duplicate = useCallback(
    (id: string) => {
      const source = doc.blocks.find((b) => b.id === id);
      if (source) insertCopy(source);
    },
    [doc.blocks, insertCopy],
  );

  const copy = useCallback(
    (id: string) => {
      const source = doc.blocks.find((b) => b.id === id);
      if (!source) return;
      clipboardRef.current = structuredClone(source);
      toast.success(`${BLOCK_LABELS[source.type]} 블록을 복사했습니다.`);
    },
    [doc.blocks],
  );

  const paste = useCallback(() => {
    const source = clipboardRef.current;
    if (source) insertCopy(source);
  }, [insertCopy]);

  return { duplicate, copy, paste };
}
