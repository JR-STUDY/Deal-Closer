import type { ReactNode } from "react";

/**
 * 문서 생성 화면의 **의미 단위 묶음** 하나 (한 화면 · 네 섹션).
 *
 * 예전에는 입력 7종이 한 덩어리로 늘어서 있었고, 그중 넷(기회·확정 견적서·거래처·AI 모델)이
 * `추가 설정` 이라는 한 이름 아래 있었다. 그 넷은 서로 **다른 질문**이다 — 기회·거래처는
 * "누구에게", 확정 견적서는 "무엇을 보고", 모델은 "무엇으로 만드는가"다. 같은 상자에 담으면
 * 어떤 값이 어떤 결과를 바꾸는지 화면으로 알 수 없다.
 *
 * 그래서 네 질문으로 묶는다:
 *  ① 무엇을 만드는가 ② 누구에게 ③ 무엇을 보고 ④ 무엇을 지시하는가.
 *
 * 계위는 **번호 + 제목 + 한 줄 설명 + 들여쓴 본문**으로 고정한다 — 섹션마다 제목 크기·여백을
 * 따로 적으면 한 곳을 손볼 때 나머지가 조용히 어긋난다(상세 화면의 `detail-columns` 와 같은 이유).
 * 위저드로 나누지 않는다: 네 값이 서로를 바꾸므로(양식 → 문서 종류 → 확정 견적서 노출)
 * 한 화면에서 함께 보여야 한다.
 */
export function FormSection({
  step,
  title,
  description,
  children,
}: {
  /** 화면에 찍히는 순서 번호 (제목의 일부가 아니라 **표식**이라 aria 에서 감춘다) */
  step: number;
  title: string;
  description?: string;
  children: ReactNode;
}) {
  const headingId = `generator-step-${step}`;
  return (
    // 구분선은 `first:` 로 첫 섹션에서만 지운다 — 부모가 자식 순서를 알 필요가 없다
    <section
      aria-labelledby={headingId}
      className="space-y-3 border-t pt-5 first:border-t-0 first:pt-0"
    >
      <div className="space-y-1">
        <h3
          id={headingId}
          className="flex items-center gap-2 text-sm font-semibold"
        >
          <span
            aria-hidden="true"
            className="flex size-5 shrink-0 items-center justify-center rounded-full bg-primary/10 text-[11px] font-semibold tabular-nums text-primary"
          >
            {step}
          </span>
          {title}
        </h3>
        {description ? (
          <p className="pl-7 text-xs leading-relaxed text-muted-foreground">
            {description}
          </p>
        ) : null}
      </div>
      <div className="space-y-3 pl-7">{children}</div>
    </section>
  );
}
