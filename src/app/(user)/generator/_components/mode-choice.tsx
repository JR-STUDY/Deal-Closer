"use client";

import Link from "next/link";
import { FilePlus2, LayoutTemplate } from "lucide-react";
import { cn } from "@/lib/utils";
import type { GenerateMode } from "./types";

/**
 * 생성 방식 — **빈 문서로 만들기** / **표준 양식으로 만들기** (F-211 · F-212).
 *
 * 이 선택이 화면 맨 위에 크게 있는 이유는, 두 방식이 **AI 에게 주는 것과 결과물이 다르기**
 * 때문이다. 빈 문서는 지시문만으로 레이아웃까지 새로 짜고, 양식 기반은 양식의 레이아웃·문구·
 * 공급자 정보를 **보존한 채 값만 채운다**. 어느 쪽인지 모르고 지시문을 적으면 "왜 우리 양식이
 * 아니지" 또는 "왜 내가 적은 대로 안 나오지" 가 된다.
 *
 * 예전에는 이 선택이 작은 탭 두 개였다. 폭이 좁아 라벨(`새로 작성` / `표준 양식으로`)밖에
 * 들어가지 않았고, 그래서 **무엇이 달라지는지 화면에 적을 자리가 없었다**. 카드로 키워
 * 각 방식이 무엇을 하는지 한 줄로 적는다 — 선택의 결과를 고르기 전에 읽을 수 있어야 한다.
 *
 * 접근성: 탭이 아니라 **라디오 그룹**이다(ACC_*). 탭은 "같은 것의 다른 보기"인데 이건
 * 서로를 배제하는 값의 선택이다. ←→ 로 옮기고 색만으로 선택 상태를 구분하지 않는다
 * (테두리 굵기 + 점 표식 + `aria-checked`).
 */
export function ModeChoice({
  mode,
  onModeChange,
  templateCount,
  disabled,
}: {
  mode: GenerateMode;
  onModeChange: (mode: GenerateMode) => void;
  /** 고를 수 있는 표준 양식 수 — 0이면 양식 방식을 열 수 없다 */
  templateCount: number;
  disabled: boolean;
}) {
  const noTemplates = templateCount === 0;

  const options = [
    {
      value: "blank" as GenerateMode,
      icon: FilePlus2,
      label: "빈 문서로 만들기",
      hint: "지시문만으로 처음부터 구성합니다. 어떤 문서인지도 지시문을 보고 AI 가 판단합니다.",
      disabled: false,
    },
    {
      value: "template" as GenerateMode,
      icon: LayoutTemplate,
      label: "표준 양식으로 만들기",
      hint: noTemplates
        ? "등록된 표준 양식이 없습니다."
        : `팀 양식의 레이아웃·문구를 그대로 두고 값만 채웁니다. ${templateCount}개 사용 가능`,
      disabled: noTemplates,
    },
  ];

  /** ←→ 로 선택을 옮긴다 — 라디오 그룹의 기본 동작이다 */
  const moveFocus = (event: React.KeyboardEvent, index: number) => {
    if (event.key !== "ArrowLeft" && event.key !== "ArrowRight") return;
    event.preventDefault();
    const next = options[(index + (event.key === "ArrowRight" ? 1 : -1) + options.length) % options.length];
    if (!next.disabled) onModeChange(next.value);
  };

  return (
    <div
      role="radiogroup"
      aria-label="생성 방식"
      className="grid gap-2 sm:grid-cols-2"
    >
      {options.map((option, index) => {
        const selected = mode === option.value;
        return (
          <button
            key={option.value}
            type="button"
            role="radio"
            aria-checked={selected}
            disabled={disabled || option.disabled}
            onClick={() => onModeChange(option.value)}
            onKeyDown={(e) => moveFocus(e, index)}
            // 선택 상태를 색만으로 구분하지 않는다 — 테두리 굵기와 점 표식을 함께 쓴다
            className={cn(
              "group flex flex-col gap-1 rounded-lg border px-4 py-3 text-left transition-colors",
              "focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none",
              "disabled:cursor-not-allowed disabled:opacity-60",
              selected
                ? "border-2 border-primary bg-primary/5"
                : "border-2 border-transparent bg-muted/40 hover:bg-muted/70 ring-1 ring-border ring-inset",
            )}
          >
            <span className="flex items-center gap-2 text-sm font-medium">
              <option.icon
                className={cn("size-4 shrink-0", selected ? "text-primary" : "text-muted-foreground")}
                aria-hidden="true"
              />
              {option.label}
              <span
                aria-hidden="true"
                className={cn(
                  "ml-auto size-2 shrink-0 rounded-full",
                  selected ? "bg-primary" : "bg-transparent ring-1 ring-border",
                )}
              />
            </span>
            <span className="text-xs leading-relaxed text-muted-foreground">
              {option.hint}
            </span>
          </button>
        );
      })}

      {/*
       * 양식이 없을 때의 탈출구는 **카드 밖**에 둔다 — `disabled` 버튼은 그 안의 링크까지
       * 포인터 이벤트를 삼켜서, 안에 넣으면 눌러도 아무 일이 없는 링크가 된다.
       */}
      {noTemplates ? (
        <p className="text-xs text-muted-foreground sm:col-span-2">
          표준 양식을 먼저 등록하시면 양식 기반으로 만들 수 있습니다.{" "}
          <Link href="/library/templates" className="underline hover:text-primary">
            표준 양식으로 이동
          </Link>
        </p>
      ) : null}
    </div>
  );
}
