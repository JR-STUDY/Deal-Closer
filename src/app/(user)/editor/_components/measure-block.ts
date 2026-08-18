"use client";

/**
 * 블록 **내용의 자연 높이**(px)를 잰다 — 상자보다 클 때도, 작을 때도.
 *
 * `use-overflow` 의 넘침 감지(`scrollHeight > clientHeight`)로는 **남는 여백을 알 수 없다**.
 * `scrollHeight` 는 최소한 `clientHeight` 이므로, 내용이 상자보다 작으면 둘이 같아진다.
 * 그래서 내용 요소의 높이 제약(`h-full`)을 잠깐 풀고 그 자연 높이를 읽는다.
 *
 * `offsetHeight` 를 쓰는 이유: 캔버스에 `transform: scale()` 이 걸려 있어도 레이아웃 px
 * 로 나온다(`getBoundingClientRect` 는 배율이 적용된 값을 준다).
 *
 * 사용자가 누를 때만 부르는 일회성 측정이다 — 매 렌더마다 재면 강제 리플로가 잦아진다.
 */
export function naturalBlockHeight(id: string): number | null {
  const node = document.querySelector<HTMLElement>(`[data-block-id="${id}"]`);
  if (!node) return null;
  const child = node.firstElementChild as HTMLElement | null;
  if (!child) return Math.max(MIN_BLOCK_HEIGHT, Math.ceil(node.scrollHeight));

  const previous = child.style.height;
  child.style.height = "auto";
  const measured = child.offsetHeight || child.scrollHeight;
  child.style.height = previous;
  return Math.max(MIN_BLOCK_HEIGHT, Math.ceil(measured));
}

/** 리사이즈 하한과 같은 값 — 0px 블록은 다시 잡을 수 없다 */
export const MIN_BLOCK_HEIGHT = 8;

/** 이만큼 차이나지 않으면 "맞았다"고 본다 (반올림 오차) */
export const FIT_TOLERANCE = 2;
