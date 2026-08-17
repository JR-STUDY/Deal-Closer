"use client";

import { useEffect } from "react";
import type { Block } from "@/lib/editor-schema";

/**
 * 캔버스 단축키 (진단 2·5).
 *
 * 판정 순서가 중요하다.
 *  ① **인라인 편집 중이면 전부 양보한다** — Backspace 가 블록을 지우면 안 된다.
 *  ② 입력 요소(input·textarea·select·contentEditable) 안에서도 양보한다 — ⌘Z 는
 *     브라우저 기본 되돌리기가 맡아야 한다.
 *  ③ 되돌리기·붙여넣기·전체 선택은 **선택된 블록이 없어도** 동작한다 (블록을 지운
 *     직후가 그렇다). 그래서 선택 검사를 이 뒤로 둔다.
 *  ④ 나머지(삭제·복제·복사·선택 해제·방향키 이동)는 선택된 블록이 있어야 한다.
 *
 * 삭제·복제·복사·방향키는 **선택 전체**를 대상으로 한다. 대상 목록은 호출측이 알고
 * 있으므로 여기서는 인자 없이 부르고, 각 동작이 한 번의 편집(=되돌리기 1건)이 된다.
 */
export function useEditorShortcuts(options: {
  /** 인라인 편집 중인 블록 — 있으면 모든 단축키를 양보한다 */
  editingId: string | null;
  /** 선택된 블록들 (다중선택) */
  selectedIds: string[];
  blocks: Block[];
  onUndo: () => void;
  onRedo: () => void;
  onPaste: () => void;
  onSelectAll: () => void;
  onDuplicate: () => void;
  onCopy: () => void;
  onRemove: () => void;
  onDeselect: () => void;
  /** 선택 전체를 같은 만큼 옮긴다 (묶음째 캔버스 안으로 가둔다) */
  onTranslate: (dx: number, dy: number) => void;
}) {
  const {
    editingId,
    selectedIds,
    blocks,
    onUndo,
    onRedo,
    onPaste,
    onSelectAll,
    onDuplicate,
    onCopy,
    onRemove,
    onDeselect,
    onTranslate,
  } = options;

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      // ① 인라인 편집 중에는 캔버스 단축키를 전부 양보한다
      if (editingId) return;

      // ② 입력 중에는 무시 — ⌘Z 도 브라우저 기본 되돌리기에 양보한다
      const t = e.target as HTMLElement | null;
      if (
        t &&
        (t.isContentEditable ||
          t.tagName === "INPUT" ||
          t.tagName === "TEXTAREA" ||
          t.tagName === "SELECT")
      ) {
        return;
      }

      const mod = e.metaKey || e.ctrlKey;
      const key = e.key.toLowerCase();

      // ③ 선택된 블록이 없어도 되는 것들
      if (mod && key === "z") {
        e.preventDefault();
        if (e.shiftKey) onRedo();
        else onUndo();
        return;
      }
      if (mod && key === "y") {
        e.preventDefault();
        onRedo();
        return;
      }
      // 복사해 둔 것이 있으면 어디서든 붙여넣을 수 있다
      if (mod && key === "v") {
        e.preventDefault();
        onPaste();
        return;
      }
      // 전체 선택 — 블록이 없으면 브라우저 기본(텍스트 전체 선택)에 양보한다
      if (mod && key === "a") {
        if (blocks.length === 0) return;
        e.preventDefault();
        onSelectAll();
        return;
      }

      // ④ 선택된 블록이 있어야 하는 것들
      if (selectedIds.length === 0) return;
      if (mod && key === "d") {
        e.preventDefault();
        onDuplicate();
        return;
      }
      if (mod && key === "c") {
        e.preventDefault();
        onCopy();
        return;
      }
      if (e.key === "Backspace" || e.key === "Delete") {
        e.preventDefault();
        onRemove();
      } else if (e.key === "Escape") {
        onDeselect();
      } else if (e.key.startsWith("Arrow")) {
        const step = e.shiftKey ? 10 : 1;
        const dx = e.key === "ArrowLeft" ? -step : e.key === "ArrowRight" ? step : 0;
        const dy = e.key === "ArrowUp" ? -step : e.key === "ArrowDown" ? step : 0;
        if (dx || dy) {
          e.preventDefault();
          onTranslate(dx, dy);
        }
      }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [
    editingId,
    selectedIds,
    blocks,
    onUndo,
    onRedo,
    onPaste,
    onSelectAll,
    onDuplicate,
    onCopy,
    onRemove,
    onDeselect,
    onTranslate,
  ]);
}
