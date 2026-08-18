"use client";

import { useCallback, useState } from "react";
import type { RefObject } from "react";
import type { Block } from "@/lib/editor-schema";
import { blocksInRect, type Rect } from "@/lib/block-align";

/**
 * 빈 캔버스에서 끌어 여러 블록을 고른다 (마퀴 / 고무줄 선택).
 *
 * 지켜야 할 것 셋:
 *  ① 좌표는 **`/ scale`** 로 문서 좌표로 되돌린다 — `getBoundingClientRect` 는 배율이
 *     적용된 크기를 준다(드롭 처리와 같은 규칙). 빠뜨리면 150% 에서 고른 영역과 실제
 *     선택이 어긋난다.
 *  ② `MARQUEE_MIN` 미만으로 움직였으면 마퀴가 아니라 **빈 곳 클릭(선택 해제)** 이다.
 *     안 가르면 선택하려고 누르는 순간마다 선택이 초기화된다.
 *  ③ 창 전체에 리스너를 걸어 캔버스 **밖에서 놓아도** 끝난다.
 *
 * `preventDefault` 를 쓰지 않는다 — mousedown 을 막으면 blur 가 안 일어나 캔버스
 * 인라인 편집 내용이 커밋되지 않고 사라진다. 딸려온 글자 선택은 놓을 때 걷어낸다.
 */

/** 이만큼(화면 px) 움직이지 않으면 마퀴가 아니라 클릭으로 본다 */
const MARQUEE_MIN = 5;

export function useMarquee(options: {
  /** 문서 좌표계를 가진 캔버스 요소 (transform 이 걸린 안쪽 div) */
  canvasRef: RefObject<HTMLDivElement | null>;
  scale: number;
  blocks: Block[];
  /** 빈 곳 클릭 — 선택 해제 */
  onClear: () => void;
  onSelectMany: (ids: string[], additive: boolean) => void;
}) {
  const { canvasRef, scale, blocks, onClear, onSelectMany } = options;

  /** 끌고 있는 사각형 (문서 좌표). 문서를 바꾸지 않는 순수 화면 상태다 */
  const [marquee, setMarquee] = useState<Rect | null>(null);
  const begin = useCallback(
    (e: React.MouseEvent<HTMLDivElement>) => {
      const rect = canvasRef.current?.getBoundingClientRect();
      if (!rect) return;
      const startX = (e.clientX - rect.left) / scale;
      const startY = (e.clientY - rect.top) / scale;
      const origin = { x: e.clientX, y: e.clientY };
      const additive = e.shiftKey || e.metaKey || e.ctrlKey;

      /** 이 지점까지 끌었을 때의 문서 좌표 사각형 */
      const rectTo = (clientX: number, clientY: number): Rect | null => {
        const now = canvasRef.current?.getBoundingClientRect();
        if (!now) return null;
        return {
          x: startX,
          y: startY,
          w: (clientX - now.left) / scale - startX,
          h: (clientY - now.top) / scale - startY,
        };
      };
      const dragged = (clientX: number, clientY: number) =>
        Math.abs(clientX - origin.x) >= MARQUEE_MIN ||
        Math.abs(clientY - origin.y) >= MARQUEE_MIN;

      function onMove(ev: MouseEvent) {
        if (!dragged(ev.clientX, ev.clientY)) return;
        setMarquee(rectTo(ev.clientX, ev.clientY));
      }
      function onUp(ev: MouseEvent) {
        window.removeEventListener("mousemove", onMove);
        window.removeEventListener("mouseup", onUp);
        setMarquee(null);
        if (!dragged(ev.clientX, ev.clientY)) {
          // 빈 곳 클릭 — ⇧ 를 누른 채였다면 골라 둔 것을 지우지 않는다
          if (!additive) onClear();
          return;
        }
        const area = rectTo(ev.clientX, ev.clientY);
        if (area) {
          onSelectMany(blocksInRect(blocks, area), additive);
        }
        // 끄는 동안 본문 글자가 딸려 선택됐을 수 있다 — 파란 하이라이트를 걷어낸다
        window.getSelection()?.removeAllRanges();
      }
      window.addEventListener("mousemove", onMove);
      window.addEventListener("mouseup", onUp);
    },
    // 값들을 클로저로 잡는다 — 이 함수는 mousedown 마다 최신 렌더의 것이 쓰인다
    [canvasRef, scale, blocks, onClear, onSelectMany],
  );

  return { marquee, beginMarquee: begin };
}
