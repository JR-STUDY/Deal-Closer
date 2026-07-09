"use client";

import { useCallback, useRef } from "react";
import type { UIEvent } from "react";

/**
 * 스크롤 중에만 스크롤바를 보이게 하는 onScroll 핸들러를 반환한다 (#2).
 * 스크롤 시 대상 요소에 .is-scrolling 을 붙이고, 멈춘 뒤 잠시 후 제거한다.
 */
export function useAutoHideScroll() {
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  return useCallback((e: UIEvent<HTMLElement>) => {
    const el = e.currentTarget;
    el.classList.add("is-scrolling");
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => el.classList.remove("is-scrolling"), 900);
  }, []);
}
