"use client";

import { useState, type ReactNode } from "react";
import { ChevronDown, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { cn } from "@/lib/utils";

/**
 * 컴포저 아래 한 줄 도구 모음.
 *
 * ## 왜 팝오버인가
 *
 * 예전에는 양식·기회·거래처·첨부·참고 문서가 **번호 붙은 섹션 네 개**로 세로로 펼쳐져
 * 있었다. 다섯 가지 입력을 늘 다 보여 주니 지시문 칸이 화면 아래로 밀리고, 정작 매번
 * 쓰는 것은 지시문 하나인데 스크롤을 해야 닿았다. 대부분의 생성은 **아무 것도 붙이지 않고**
 * 지시문만 적는다 — 그 경로가 가장 짧아야 한다.
 *
 * 그래서 부수 입력은 **자리를 미리 잡지 않고** 필요할 때 펼친다. 대신 고른 것은
 * `SelectionChips` 로 툴바 아래 한 줄에 남아, 접혀 있어도 **무엇을 준 상황인지** 보인다 —
 * 접는 것과 감추는 것은 다르다.
 */
export function ToolbarButton({
  label,
  icon: Icon,
  count,
  children,
  disabled,
  contentClassName,
}: {
  label: string;
  icon: React.ComponentType<{ className?: string; "aria-hidden"?: boolean }>;
  /** 고른 개수 — 있으면 라벨 옆에 배지로 적는다 */
  count?: number;
  children: ReactNode;
  disabled?: boolean;
  contentClassName?: string;
}) {
  const [open, setOpen] = useState(false);
  const active = (count ?? 0) > 0;

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          type="button"
          variant="outline"
          size="sm"
          disabled={disabled}
          // 고른 것이 있으면 색만으로 알리지 않는다 — 개수를 글자로 적는다 (ACC_*)
          className={cn("h-9 gap-1.5", active && "border-primary/60 bg-primary/5")}
        >
          <Icon className="size-4" aria-hidden={true} />
          {label}
          {active ? (
            <span className="tabular-nums font-medium text-primary">{count}</span>
          ) : null}
          <ChevronDown className="size-3.5 opacity-60" aria-hidden={true} />
        </Button>
      </PopoverTrigger>
      <PopoverContent
        align="start"
        // 팝오버 안의 목록이 길어질 수 있다 — 껍데기가 아니라 본문만 스크롤시킨다
        className={cn("flex max-h-[70svh] w-[22rem] flex-col overflow-hidden p-0", contentClassName)}
      >
        <div className="min-h-0 flex-1 space-y-3 overflow-y-auto p-3">{children}</div>
      </PopoverContent>
    </Popover>
  );
}

/**
 * 지금 AI 에게 주기로 한 것들 — 접힌 팝오버 대신 **여기서** 보인다.
 *
 * 칩마다 × 를 둬 팝오버를 다시 열지 않고도 뗄 수 있다. 지우는 동작이 두 곳에 있어도
 * 되는 이유는, 판정이 부모의 상태 하나뿐이라 결과가 갈라지지 않기 때문이다.
 */
export function SelectionChips({
  items,
}: {
  items: {
    id: string;
    icon: React.ComponentType<{ className?: string; "aria-hidden"?: boolean }>;
    label: string;
    /** 없으면 뗄 수 없는 칩 (예: 진입 경로로 정해진 기회) */
    onRemove?: () => void;
    removeLabel?: string;
  }[];
}) {
  if (items.length === 0) return null;

  return (
    <ul className="flex flex-wrap gap-1.5">
      {items.map((item) => (
        <li
          key={item.id}
          className="flex max-w-full items-center gap-1.5 rounded-md border bg-muted/40 py-1 pl-2 pr-1 text-xs"
        >
          <item.icon className="size-3.5 shrink-0 text-muted-foreground" aria-hidden={true} />
          <span className="truncate" title={item.label}>
            {item.label}
          </span>
          {item.onRemove ? (
            <button
              type="button"
              onClick={item.onRemove}
              aria-label={item.removeLabel ?? `${item.label} 제외`}
              className="rounded p-0.5 text-muted-foreground transition-colors hover:bg-background hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
            >
              <X className="size-3.5" aria-hidden={true} />
            </button>
          ) : (
            <span className="w-1" />
          )}
        </li>
      ))}
    </ul>
  );
}
