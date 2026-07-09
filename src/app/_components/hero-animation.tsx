"use client";

import { useEffect, useRef } from "react";

/**
 * 메인 hero 비주얼 — DealCloser 워크플로우(AI 대화 → 문서 생성 → 원클릭 발송)를
 * 표현하는 Lottie 애니메이션. lottie-web 코어를 클라이언트에서만 동적 로드하고,
 * 애니메이션 JSON 은 public 에서 self-host 한다(번들 밖).
 *
 * 접근성(ACC_*): prefers-reduced-motion 시 자동재생·루프를 끄고 대표 프레임에서
 * 정지한다. role="img" + aria-label 로 대체 텍스트를 제공한다.
 */
const ARIA_LABEL =
  "Rainmaker 워크플로우: AI 대화로 견적·제안 문서를 생성하고 원클릭으로 발송합니다";
const RESTING_FRAME = 104; // 정지 시 문서·성사 체크가 함께 보이는 프레임

export function HeroAnimation() {
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    const reduceMotion = window.matchMedia(
      "(prefers-reduced-motion: reduce)",
    ).matches;

    let cancelled = false;
    let animation: { destroy: () => void; goToAndStop: (v: number, f?: boolean) => void } | undefined;

    void import("lottie-web").then(({ default: lottie }) => {
      if (cancelled || !container) return;
      animation = lottie.loadAnimation({
        container,
        renderer: "svg",
        loop: !reduceMotion,
        autoplay: !reduceMotion,
        path: "/animations/dealcloser-workflow.json",
      });
      if (reduceMotion) {
        animation.goToAndStop(RESTING_FRAME, true);
      }
    });

    return () => {
      cancelled = true;
      animation?.destroy();
    };
  }, []);

  return (
    <div
      ref={containerRef}
      role="img"
      aria-label={ARIA_LABEL}
      className="mx-auto h-[180px] w-60 max-w-full"
    />
  );
}
