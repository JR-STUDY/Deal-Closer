"use client";

import { formatDate, formatDateTimeSeconds } from "@/lib/format";
import { HintTooltip } from "@/components/hint-tooltip";

/**
 * 기회 상세 헤더의 등록·최근 수정 일시 (4차 피드백 W-C 2).
 *
 * 전에는 제목 바로 아래 `description` 자리에 본문과 같은 크기(`text-sm`)로 놓여 있어, 기회명
 * 다음으로 눈에 드는 값이 **날짜 두 개**였다. 영업 판단에 쓰이는 값이 아니라 "언제 만든
 * 건이었지" 를 확인할 때만 보는 값이라 헤더 **우측 아래**로 옮기고 한 단계 작게(`text-xs`)
 * 줄였다 — 자리와 크기가 곧 중요도를 말한다.
 *
 * 화면에는 **날짜만** 적고 시각은 툴팁으로 접는다. 헤더 우측은 버튼과 폭을 나눠 쓰는 자리라
 * `2026.08.12 13:47` 까지 펼치면 그만큼 제목이 줄어든다. 목록의 최근 수정일 칸과 **같은 방식·
 * 같은 컴포넌트**(`HintTooltip`)라 두 화면의 툴팁이 다르게 보이지 않는다.
 *
 * **호버 전용이 아니다** — `HintTooltip` 의 트리거가 `tabIndex=0` 이라 Tab 초점으로도 열리고
 * Radix 가 `aria-describedby` 로 내용을 이어 준다 (정책 ACC_*). 툴팁은 `side="bottom"` 이다 —
 * 헤더가 화면 맨 위라 위로 띄우면 잘린다.
 *
 * 시각은 `formatDateTimeSeconds` 로 **초까지** 보여준다. 같은 날 여러 번 고친 기회는 분까지
 * 같아지는 경우가 있어, 목록 정렬(최근 수정 순)과 대조하려면 초가 필요하다.
 */
export function OpportunityTimestamps({
  createdAt,
  updatedAt,
}: {
  /** ISO 문자열 — 서버 컴포넌트에서 `Date` 를 그대로 넘기지 않는다 (직렬화 규칙) */
  createdAt: string;
  updatedAt: string;
}) {
  return (
    <HintTooltip
      side="bottom"
      className="tabular-nums"
      content={
        <span className="block">
          등록 {formatDateTimeSeconds(createdAt)}
          <br />
          최근 수정 {formatDateTimeSeconds(updatedAt)}
        </span>
      }
    >
      등록 {formatDate(createdAt)} · 수정 {formatDate(updatedAt)}
    </HintTooltip>
  );
}
