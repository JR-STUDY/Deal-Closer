"use client";

import { useEffect } from "react";
import type { Block } from "@/lib/editor-schema";
import type { Geometry } from "./canvas-block";

/**
 * 캔버스 단축키 (진단 2·5).
 *
 * 판정 순서가 중요하다.
 *  ① **인라인 편집 중이면 전부 양보한다** — Backspace 가 블록을 지우면 안 된다.
 *  ② 입력 요소(input·textarea·select·contentEditable) 안에서도 양보한다 — ⌘Z 는
 *     브라우저 기본 되돌리기가 맡아야 한다.
 *  ③ 되돌리기·붙여넣기는 **선택된 블록이 없어도** 동작한다 (블록을 지운 직후가 그렇다).
 *     그래서 `selectedId` 검사를 이 뒤로 둔다.
 *  ④ 나머지(삭제·선택 해제·방향키 이동)는 선택된 블록이 있어야 한다.
 */
export function useEditorShortcuts(options: {
  /** 인라인 편집 중인 블록 — 있으면 모든 단축키를 양보한다 */
  editingId: string | null;
  selectedId: string | null;
  blocks: Block[];
  onUndo: () => void;
  onRedo: () => void;
  onPaste: () => void;
  onDuplicate: (id: string) => void;
  onCopy: (id: string) => void;
  onRemove: (id: string) => void;
  onDeselect: () => void;
  onGeometry: (id: string, geo: Geometry) => void;
}) {
  const {
    editingId,
    selectedId,
    blocks,
    onUndo,
    onRedo,
    onPaste,
    onDuplicate,
    onCopy,
    onRemove,
    onDeselect,
    onGeometry,
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

      // ④ 선택된 블록이 있어야 하는 것들
      if (!selectedId) return;
      if (mod && key === "d") {
        e.preventDefault();
        onDuplicate(selectedId);
        return;
      }
      if (mod && key === "c") {
        e.preventDefault();
        onCopy(selectedId);
        return;
      }
      if (e.key === "Backspace" || e.key === "Delete") {
        e.preventDefault();
        onRemove(selectedId);
      } else if (e.key === "Escape") {
        onDeselect();
      } else if (e.key.startsWith("Arrow")) {
        const block = blocks.find((b) => b.id === selectedId);
        if (!block) return;
        const step = e.shiftKey ? 10 : 1;
        const dx = e.key === "ArrowLeft" ? -step : e.key === "ArrowRight" ? step : 0;
        const dy = e.key === "ArrowUp" ? -step : e.key === "ArrowDown" ? step : 0;
        if (dx || dy) {
          e.preventDefault();
          onGeometry(selectedId, {
            x: Math.max(0, block.x + dx),
            y: Math.max(0, block.y + dy),
            w: block.w,
            h: block.h,
          });
        }
      }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [
    editingId,
    selectedId,
    blocks,
    onUndo,
    onRedo,
    onPaste,
    onDuplicate,
    onCopy,
    onRemove,
    onDeselect,
    onGeometry,
  ]);
}
