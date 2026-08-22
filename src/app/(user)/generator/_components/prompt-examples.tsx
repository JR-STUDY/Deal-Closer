"use client";

import { MessageSquareText } from "lucide-react";

/**
 * 예시 지시문 — 컴포저 **오른쪽**에 세로로 둔다.
 *
 * 예전에는 폼 카드 **아래**에 3열 카드로 있었다. 지시문을 적다가 예시를 보려면 아래로
 * 스크롤해야 했고, 카드가 커서 화면 한 뷰를 더 잡아먹었다. 예시는 "적는 동안 곁눈질하는 것"
 * 이므로 입력칸과 **같은 높이에** 있어야 한다.
 *
 * 누르면 지시문을 **덮어쓴다**(이어붙이지 않는다) — 예시는 출발점이지 조각이 아니고,
 * 이어붙이면 두 지시가 섞인 문장이 만들어진다. 이미 적어 둔 내용이 있으면 확인을 받는다.
 */
export function PromptExamples({
  examples,
  onPick,
  hasDraft,
  disabled,
}: {
  examples: string[];
  onPick: (example: string) => void;
  /** 지시문에 이미 적어 둔 내용이 있는지 — 덮어쓰기 전에 알린다 */
  hasDraft: boolean;
  disabled: boolean;
}) {
  const pick = (example: string) => {
    if (
      hasDraft &&
      !window.confirm("적어 두신 지시문을 예시로 바꿉니다. 계속하시겠습니까?")
    ) {
      return;
    }
    onPick(example);
  };

  return (
    <aside className="space-y-2" aria-labelledby="prompt-examples-heading">
      <h2
        id="prompt-examples-heading"
        className="flex items-center gap-1.5 text-xs font-medium text-muted-foreground"
      >
        <MessageSquareText className="size-3.5" aria-hidden="true" />
        이렇게 말해보세요
      </h2>
      <ul className="space-y-1.5">
        {examples.map((example) => (
          <li key={example}>
            <button
              type="button"
              disabled={disabled}
              onClick={() => pick(example)}
              className="w-full rounded-md border bg-card px-3 py-2 text-left text-xs leading-relaxed transition-colors hover:border-primary/50 hover:bg-muted/50 focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none disabled:cursor-not-allowed disabled:opacity-60"
            >
              {example}
            </button>
          </li>
        ))}
      </ul>
    </aside>
  );
}
