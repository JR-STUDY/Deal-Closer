"use client";

import type { ReactNode } from "react";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";

/**
 * 캘린더 칸의 일정에 붙는 툴팁 (F-302).
 *
 * ## 왜 `title` 로 충분하지 않은가
 *
 * 처음에는 브라우저 기본 `title` 만 달아 두었다. 세 가지가 아쉬웠다 — 뜨기까지 1초 가까이
 * 걸리고, 표식(아이콘)에 초점을 맞춘 **키보드 사용자에게는 아예 뜨지 않으며**, 줄바꿈이
 * 마음대로 되지 않아 여러 값을 나열할 수 없다. 컴팩트 칸은 아이콘 하나가 링크의 전부라
 * "누르면 어디로 가는가"를 알 방법이 그 툴팁밖에 없는데, 그게 가장 부실했다.
 *
 * Radix 툴팁은 hover 와 **focus 모두**에서 열리고(Tab 으로 닿으면 그대로 뜬다), 화면
 * 가장자리에서 자리를 스스로 바꾸며, `aria-describedby` 로 낭독기에 이어 준다.
 *
 * ## 색은 반전 배경을 기준으로 고른다
 *
 * 툴팁은 `bg-foreground` + `text-background` 로 **본문과 반전된 판**이다. 그 위에
 * `text-muted-foreground` 를 쓰면 밝은 배경을 전제로 만든 회색이라 거의 읽히지 않는다
 * (실제로 거래처명이 그랬다). 흐린 글자가 필요하면 **배경색을 투명도로 낮춘다**
 * (`text-background/75`) — 라이트·다크 어느 쪽이든 판 색에서 파생되므로 대비가 유지된다.
 *
 * ## 링크의 이름은 그대로 둔다
 *
 * 툴팁은 **보조 설명**이지 접근성 이름이 아니다. 트리거인 링크는 여전히 `aria-label` 로
 * 기회명·금액·결말을 스스로 말한다 — 툴팁이 열리지 않는 환경(낭독기의 훑어보기 모드 등)
 * 에서도 "이 링크가 어디로 가는지" 는 알 수 있어야 한다.
 *
 * ## Provider 는 여기 없다
 *
 * 한 달 캘린더에는 표식이 100개를 넘는다. 표식마다 `TooltipProvider` 를 두면 같은 수의
 * 컨텍스트가 생기고, 그중 하나에 hover 해도 **다른 툴팁들이 지연 없이 이어 열리는**
 * 그룹 동작(skipDelayDuration)을 잃는다. 그래서 Provider 는 캘린더 표 하나를 감싼다
 * (`InfoHint` 는 화면에 한둘뿐이라 스스로 감싸는 것이고, 여기는 사정이 다르다).
 */
export function CalendarEventTooltip({
  name,
  accountName,
  amountLabel,
  outcomeLabel,
  children,
}: {
  name: string;
  /** 거래처 회사명 — 없으면 줄 자체를 그리지 않는다 (빈 자리를 남기지 않는다) */
  accountName?: string | null;
  /**
   * 이미 포맷된 금액 문구와 결말 라벨. **둘 다 옵셔널**이다 — 칸에 이미 보이는 것을
   * 툴팁이 되풀이할 이유가 없다. 컴팩트 칸은 결말을 아이콘 모양으로 이미 말하고 월 단위
   * 금액은 헤더 합계 타일이 맡으므로, 대시보드에서는 넘기지 않아 **거래처·기회명 두 줄**로
   * 끝낸다(둘 중 하나만 주면 남은 하나가 홀로 남지 않도록 함께 있을 때만 그린다).
   */
  amountLabel?: string;
  outcomeLabel?: string;
  children: ReactNode;
}) {
  return (
    <Tooltip>
      {/*
        `asChild` — 트리거가 DOM 을 하나 더 만들면 표 칸 안에서 줄바꿈·정렬이 틀어진다.
        링크 자체가 트리거가 된다.
      */}
      <TooltipTrigger asChild>{children}</TooltipTrigger>
      {/*
        `items-center` 가 기본이라 여러 줄이면 가운데 정렬된다 — 왼쪽으로 맞춰 읽는 줄을 세운다.
      */}
      <TooltipContent side="top" className="max-w-64 flex-col items-start gap-0">
        {/*
          **소속이 위, 값이 아래**다 — 상세 화면의 브레드크럼(`거래처 > 회사명 > 기회명`)과
          같은 배치라 사용자가 순서를 새로 배우지 않는다.
          흐린 글자는 판 색(`background`)에서 파생시킨다 — `muted-foreground` 는 밝은 배경을
          전제로 한 회색이라 이 반전 판에서는 읽히지 않는다.
        */}
        {accountName ? (
          <span className="text-background/75">{accountName}</span>
        ) : null}
        <span className="font-medium">{name}</span>
        {amountLabel && outcomeLabel ? (
          <span className="tabular-nums text-background/75">
            {amountLabel} · {outcomeLabel}
          </span>
        ) : null}
      </TooltipContent>
    </Tooltip>
  );
}
