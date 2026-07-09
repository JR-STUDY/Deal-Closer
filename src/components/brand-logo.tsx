import { cn } from "@/lib/utils";

/**
 * RAINMAKER 브랜드 로고 (인라인 SVG·순수 텍스트 — 외부 요청 없이 CSP 안전).
 *
 * 컨셉: "rainmaker" = 큰 딜을 몰고 와 매출을 쏟아내는 사람. 이름 정중앙에
 * AI 가 박혀 있고(R·AI·NMAKER), 심볼은 "솟아오르는 봉우리(= rAInmaker 의 A·
 * 우상향) + 물빛 빗방울(rain)"로 딜이 쏟아지고 매출이 오른다는 의미를 담는다.
 *
 * 팔레트: 봉우리 = 인디고 그라디언트(#8B84FF→#4F46E5),
 *         빗방울 = 물빛 그라디언트(#4F46E5→#38BDF8).
 *
 * 서버 컴포넌트에서도 쓸 수 있는 프레젠테이션 전용 컴포넌트.
 * (앱 내에서 페이지당 1회만 렌더되므로 그라디언트 id 는 정적으로 둔다.
 *  앱 아이콘·파비콘은 같은 형태의 타일 버전 `src/app/icon.svg` 참고.)
 */

/** 심볼 마크 — 봉우리 + 물빛 빗방울(투톤 그라디언트). 자체 색을 가지므로 배경 박스 없이 단독 배치한다. */
export function BrandMark({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 48 48" fill="none" className={className} aria-hidden="true">
      <defs>
        <linearGradient id="rmPeakGrad" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="#8b84ff" />
          <stop offset="1" stopColor="#4f46e5" />
        </linearGradient>
        <linearGradient id="rmDropGrad" x1="0" y1="1" x2="1" y2="0">
          <stop offset="0" stopColor="#4f46e5" />
          <stop offset="1" stopColor="#38bdf8" />
        </linearGradient>
      </defs>
      {/* 솟아오르는 봉우리 — rAInmaker 의 A·우상향 */}
      <path
        d="M7 42 24 12 41 42"
        stroke="url(#rmPeakGrad)"
        strokeWidth={6.6}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      {/* 물빛 빗방울 — rain */}
      <path
        d="M24 22.5C24 22.5 29 28 29 30.8A5 5 0 0 1 19 30.8C19 28 24 22.5 24 22.5Z"
        fill="url(#rmDropGrad)"
      />
    </svg>
  );
}

/**
 * 레터링 워드마크 — R·AI·NMAKER 에서 "AI"만 바이올렛→인디고 그라디언트로 강조.
 * 헤비(800)·타이트 트래킹으로 임팩트를 준다. 기본 글자는 foreground.
 * 그라디언트 텍스트는 브라우저 호환을 위해 inline style 로 직접 지정한다.
 */
export function BrandWordmark({ className }: { className?: string }) {
  return (
    <span className={cn("font-extrabold tracking-tight text-foreground", className)}>
      R
      <span
        style={{
          backgroundImage: "linear-gradient(135deg,#7c74ff,#4f46e5)",
          WebkitBackgroundClip: "text",
          backgroundClip: "text",
          color: "transparent",
        }}
      >
        AI
      </span>
      NMAKER
    </span>
  );
}
