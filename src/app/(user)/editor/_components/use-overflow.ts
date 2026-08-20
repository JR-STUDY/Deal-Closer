"use client";

import { useCallback, useEffect, useRef, useState } from "react";

/**
 * 블록 내용이 상자 밖으로 **넘쳤는지** 감지한다 (진단 4).
 *
 * 캔버스와 PDF 는 둘 다 블록에 `overflow: hidden` 을 걸기 때문에, 넘친 내용은
 * 경고 없이 잘린 채 그대로 고객에게 발송된다. 실제 시드 문서에서도 공급자 정보
 * 블록의 "이메일" 행이 잘려 있었다 — 주소가 한 줄 늘어난 것만으로 정보가 사라진다.
 *
 * **자동으로 늘리지 않는다.** 블록은 절대 좌표라서 높이를 늘려도 아래 블록이 밀려나지
 * 않고 그냥 **덮는다**. 잘림을 겹침으로 바꾸는 셈인데, 겹침은 z 순서가 승자를 정하고
 * 덮인 내용이 PDF 에서도 사라져 더 안 보이는 손상이다. 그래서 알리고, 한 번에 맞출
 * 길을 준다.
 *
 * 한계: 여기서 재는 것은 **화면 글꼴 기준**이라 PDF 와 완전히 같지는 않다.
 * 화면·인쇄가 같은 글꼴 스택(`FONT_FAMILIES`)을 쓰게 맞춰 그 격차를 줄였다.
 */

export type OverflowState = {
  /** 내용이 상자보다 큰지 */
  clipped: boolean;
  /** 잘리지 않으려면 필요한 높이(px). 0 이면 아직 측정하지 않았다 */
  contentHeight: number;
};

/** 측정 오차 — 반올림으로 1px 넘치는 것을 잘림으로 보지 않는다 */
const TOLERANCE = 2;

/**
 * @param revision 내용이 바뀌었음을 알리는 값(보통 블록 객체). 바뀌면 다시 잰다.
 *   `ResizeObserver` 만으로는 부족하다 — 텍스트가 길어져도 `h-full` 인 내용 요소의
 *   **상자 크기는 그대로**여서 관측자가 울리지 않는다. 상자 변화는 관측자가, 내용
 *   변화는 이 값이 잡는다.
 */
export function useOverflow(
  revision: unknown,
): [(node: HTMLElement | null) => (() => void) | undefined, OverflowState] {
  const [state, setState] = useState<OverflowState>({
    clipped: false,
    contentHeight: 0,
  });
  const nodeRef = useRef<HTMLElement | null>(null);

  const measure = useCallback(() => {
    const node = nodeRef.current;
    if (!node) return;
    const contentHeight = Math.ceil(node.scrollHeight);
    const clipped = contentHeight > node.clientHeight + TOLERANCE;
    // 값이 그대로면 setState 를 건너뛴다 — ResizeObserver 는 자주 울린다
    setState((current) =>
      current.clipped === clipped && current.contentHeight === contentHeight
        ? current
        : { clipped, contentHeight },
    );
  }, []);

  /**
   * 블록의 `overflow: hidden` 상자에 붙이는 ref 콜백.
   *
   * **정리 함수를 돌려준다** (React 19). 예전에는 관측자를 ref 에 담아 두고 다음 호출과
   * 언마운트 효과에서 각각 끊었는데, 같은 일을 두 곳에서 하니 어느 쪽이 책임인지
   * 흐릿하다. 붙일 때 만들고 뗄 때 끊는 것이 한 쌍으로 보이는 편이 낫다.
   */
  const ref = useCallback(
    (node: HTMLElement | null) => {
      nodeRef.current = node;
      if (!node) return;

      measure();
      const observer = new ResizeObserver(measure);
      observer.observe(node);
      return () => {
        observer.disconnect();
        nodeRef.current = null;
      };
    },
    [measure],
  );

  // 내용이 바뀌면 다시 잰다. 글꼴이 늦게 로드되는 경우까지 잡으려면 폰트 준비도 기다린다.
  useEffect(() => {
    measure();
    let cancelled = false;
    document.fonts?.ready.then(() => {
      if (!cancelled) measure();
    });
    return () => {
      cancelled = true;
    };
  }, [revision, measure]);

  return [ref, state];
}
