"use client";

import { useEffect, useRef } from "react";
import type { CSSProperties } from "react";

/**
 * 캔버스에서 글자를 **직접 고치는** 텍스트 표시·편집 요소 (진단 5).
 *
 * 예전에는 오타 하나를 고치려면 블록 선택 → 우측 탭 전환 → textarea 안에서 커서를
 * 찾아야 했다. 문서 에디터에서 기대하는 동작은 더블클릭해서 그 자리에서 고치는 것이다.
 *
 * 조작 규칙은 기회 상세의 인라인 편집과 같게 맞췄다 — **blur·Enter 저장, Esc 되돌리기**.
 * 다만 문서 본문은 여러 줄이라 Enter 는 줄바꿈이고 저장은 **⌘/Ctrl+Enter** 다.
 *
 * 편집 중에는 React 가 내용을 다시 쓰지 않는다(`contentEditable` 요소의 자식을 렌더로
 * 갈아치우면 매 입력마다 커서가 맨 앞으로 튄다). 그래서 진입할 때 한 번만 DOM 에 값을
 * 넣고, 이후에는 브라우저가 편집을 맡는다.
 */
export function InlineText({
  className,
  style,
  text,
  editing,
  onCommit,
  onCancel,
}: {
  className?: string;
  style?: CSSProperties;
  text: string;
  editing: boolean;
  onCommit?: (text: string) => void;
  onCancel?: () => void;
}) {
  const ref = useRef<HTMLDivElement>(null);
  /** 편집을 시작할 때의 값 — Esc 로 되돌릴 기준이자, 바뀐 게 없으면 저장을 건너뛰는 기준 */
  const startedWith = useRef(text);
  /** blur 로 저장이 두 번 불리지 않게 (Esc·⌘Enter 가 이미 처리한 경우) */
  const settled = useRef(false);

  useEffect(() => {
    if (!editing) return;
    const node = ref.current;
    if (!node) return;

    startedWith.current = text;
    settled.current = false;
    node.textContent = text;
    node.focus();
    // 커서를 맨 끝에 둔다 — 편집 진입 직후 전체 선택되면 실수로 다 지운다
    const selection = window.getSelection();
    if (selection) {
      const range = document.createRange();
      range.selectNodeContents(node);
      range.collapse(false);
      selection.removeAllRanges();
      selection.addRange(range);
    }
    // text 를 의존성에 넣지 않는다 — 편집 중 부모 상태가 갱신될 때마다 커서가 튄다
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [editing]);

  function commit() {
    if (settled.current) return;
    settled.current = true;
    const next = ref.current?.textContent ?? "";
    if (next === startedWith.current) onCancel?.();
    else onCommit?.(next);
  }

  function cancel() {
    if (settled.current) return;
    settled.current = true;
    if (ref.current) ref.current.textContent = startedWith.current;
    onCancel?.();
  }

  if (!editing) {
    return (
      <div className={className} style={style}>
        {text}
      </div>
    );
  }

  return (
    <div
      ref={ref}
      // 편집 중에는 사용자가 지정한 텍스트 정렬을 그대로 두면서 커서만 보이게 한다
      className={`${className ?? ""} cursor-text outline-2 outline-primary`}
      style={style}
      contentEditable
      suppressContentEditableWarning
      role="textbox"
      aria-multiline="true"
      aria-label="블록 내용 편집"
      onBlur={commit}
      onKeyDown={(e) => {
        // 캔버스 단축키(Backspace 삭제·방향키 이동·⌘Z)가 편집을 가로채지 않게 막는다
        e.stopPropagation();
        if (e.key === "Escape") {
          e.preventDefault();
          cancel();
          return;
        }
        if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) {
          e.preventDefault();
          commit();
        }
      }}
      // 붙여넣기는 서식 없는 글자만 받는다 — 블록 서식이 붙여넣은 HTML 로 깨지지 않게
      onPaste={(e) => {
        e.preventDefault();
        const plain = e.clipboardData.getData("text/plain");
        document.execCommand("insertText", false, plain);
      }}
    />
  );
}
