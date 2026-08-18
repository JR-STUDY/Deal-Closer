"use client";

import { useCallback, useRef, useState } from "react";
import type { EditorDoc } from "@/lib/editor-schema";

/**
 * 문서 상태 + 되돌리기/다시 실행 (진단 2).
 *
 * 에디터에는 Backspace 한 번에 블록이 사라지는 조작이 있는데 복구 수단이 없었다.
 * 자동 저장도 없어 실수한 상태로 저장하면 끝이었다 — 되돌리기가 이 에디터의 안전망이다.
 *
 * **묶음(coalesce)이 핵심이다.** 타이핑·방향키 이동처럼 잦은 변경을 한 건씩 쌓으면
 * ⌘Z 가 글자 하나씩 되돌아가 되돌리기가 쓸모없어진다. 같은 `coalesceKey` 가 짧은 시간
 * 안에 연속되면 직전 항목을 **교체**해 한 동작으로 묶는다.
 *
 * 문서·과거·미래를 **한 state 객체**로 묶은 이유: updater 안에서 다른 setState 를
 * 부르면 StrictMode 의 이중 호출 때 스택이 두 번 쌓인다. 전이를 하나의 순수 함수로
 * 만들어야 몇 번 호출돼도 결과가 같다.
 *
 * 스냅샷은 참조만 보관한다 — EditorDoc 은 항상 불변 갱신되므로(핸들러가 새 객체를
 * 만든다) 딥 클론하면 base64 이미지까지 복제해 메모리만 잡아먹는다.
 */

/** 같은 키로 이어지는 변경을 한 건으로 묶는 시간(ms) */
const COALESCE_MS = 600;

/** 스택 상한 — 넘으면 가장 오래된 항목부터 버린다 */
const MAX_HISTORY = 50;

export type DocUpdater = (previous: EditorDoc) => EditorDoc;

export type SetDocOptions = {
  /**
   * 이 키가 같고 시간 간격이 짧으면 직전 변경과 한 건으로 묶는다.
   * 예: `props:{blockId}:text`(타이핑), `move:{blockId}`(방향키 이동).
   * 생략하면 언제나 새 항목이 된다 (블록 추가·삭제 같은 단발 조작).
   */
  coalesceKey?: string;
};

export type DocHistory = {
  doc: EditorDoc;
  setDoc: (updater: DocUpdater, options?: SetDocOptions) => void;
  /** 히스토리를 비우고 새 문서로 시작한다 (템플릿 불러오기 등) */
  replaceDoc: (next: EditorDoc) => void;
  undo: () => void;
  redo: () => void;
  canUndo: boolean;
  canRedo: boolean;
};

type HistoryState = {
  doc: EditorDoc;
  /** 되돌릴 과거 상태들 (가장 최근이 뒤) */
  past: EditorDoc[];
  /** 다시 실행할 상태들 (다음에 갈 곳이 뒤) */
  future: EditorDoc[];
};

function capped(stack: EditorDoc[]): EditorDoc[] {
  return stack.length > MAX_HISTORY ? stack.slice(stack.length - MAX_HISTORY) : stack;
}

export function useDocHistory(initialDoc: EditorDoc): DocHistory {
  const [state, setState] = useState<HistoryState>({
    doc: initialDoc,
    past: [],
    future: [],
  });
  /** 마지막 커밋의 묶음 키·시각 — 다음 변경을 묶을지 판단한다 */
  const lastCommit = useRef<{ key: string; at: number } | null>(null);

  const setDoc = useCallback(
    (updater: DocUpdater, options?: SetDocOptions) => {
      const key = options?.coalesceKey;
      const now = Date.now();
      const previous = lastCommit.current;
      // 묶을지는 setState **밖에서** 정한다 — updater 안에서 ref 를 읽으면
      // 이중 호출 때 판단이 달라질 수 있다.
      const coalesce =
        key !== undefined &&
        previous !== null &&
        previous.key === key &&
        now - previous.at < COALESCE_MS;

      setState((current) => {
        const next = updater(current.doc);
        // 값이 그대로면 히스토리를 더럽히지 않는다 (움직이지 않은 드래그 등)
        if (next === current.doc) return current;
        return {
          doc: next,
          past: coalesce ? current.past : capped([...current.past, current.doc]),
          // 새로 편집하면 다시 실행 갈래는 버린다 (표준 undo 동작)
          future: [],
        };
      });

      lastCommit.current = { key: key ?? `once:${now}`, at: now };
    },
    [],
  );

  const replaceDoc = useCallback((next: EditorDoc) => {
    setState({ doc: next, past: [], future: [] });
    lastCommit.current = null;
  }, []);

  const undo = useCallback(() => {
    // 되돌린 직후의 편집은 새 항목이어야 하므로 묶음 기준을 끊는다
    lastCommit.current = null;
    setState((current) => {
      if (current.past.length === 0) return current;
      return {
        doc: current.past[current.past.length - 1],
        past: current.past.slice(0, -1),
        future: [...current.future, current.doc],
      };
    });
  }, []);

  const redo = useCallback(() => {
    lastCommit.current = null;
    setState((current) => {
      if (current.future.length === 0) return current;
      return {
        doc: current.future[current.future.length - 1],
        past: [...current.past, current.doc],
        future: current.future.slice(0, -1),
      };
    });
  }, []);

  return {
    doc: state.doc,
    setDoc,
    replaceDoc,
    undo,
    redo,
    canUndo: state.past.length > 0,
    canRedo: state.future.length > 0,
  };
}
