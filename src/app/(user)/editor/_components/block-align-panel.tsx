"use client";

import {
  AlignCenterHorizontal,
  AlignCenterVertical,
  AlignEndHorizontal,
  AlignEndVertical,
  AlignHorizontalDistributeCenter,
  AlignStartHorizontal,
  AlignStartVertical,
  AlignVerticalDistributeCenter,
  MoveVertical,
  Trash2,
} from "lucide-react";
import type { ZOrderAction } from "@/lib/editor-schema";
import {
  MIN_DISTRIBUTE,
  type AlignMode,
  type DistributeAxis,
} from "@/lib/block-align";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";

/**
 * 여러 블록을 골랐을 때의 사이드바 패널 (다중선택).
 *
 * 블록이 2개 이상이면 "이 블록의 속성" 이라는 것이 없다 — 대신 **서로 맞추는** 도구를 준다.
 * 기준은 선택 영역 바운딩 박스이고 계산은 `@/lib/block-align` 순수 함수가 한다.
 *
 * 툴바가 아니라 사이드바에 두는 이유: 툴바는 이미 1280 폭에서 줄바꿈하고, 블록을 고르면
 * 이 탭으로 자동 전환되므로 손이 가는 자리다.
 *
 * 아이콘만 두지 않는다 — 모든 버튼에 `aria-label`·`title` 을 붙여 무엇인지 말한다 (ACC_*).
 */

const ALIGN_BUTTONS: {
  mode: AlignMode;
  label: string;
  Icon: typeof AlignStartVertical;
}[] = [
  { mode: "left", label: "왼쪽 맞춤", Icon: AlignStartVertical },
  { mode: "centerX", label: "가로 가운데 맞춤", Icon: AlignCenterVertical },
  { mode: "right", label: "오른쪽 맞춤", Icon: AlignEndVertical },
  { mode: "top", label: "위쪽 맞춤", Icon: AlignStartHorizontal },
  { mode: "middleY", label: "세로 가운데 맞춤", Icon: AlignCenterHorizontal },
  { mode: "bottom", label: "아래쪽 맞춤", Icon: AlignEndHorizontal },
];

const DISTRIBUTE_BUTTONS: {
  axis: DistributeAxis;
  label: string;
  Icon: typeof AlignStartVertical;
}[] = [
  {
    axis: "x",
    label: "가로 간격 균등",
    Icon: AlignHorizontalDistributeCenter,
  },
  { axis: "y", label: "세로 간격 균등", Icon: AlignVerticalDistributeCenter },
];

const Z_ACTIONS: { action: ZOrderAction; label: string }[] = [
  { action: "front", label: "맨 앞" },
  { action: "forward", label: "앞으로" },
  { action: "backward", label: "뒤로" },
  { action: "back", label: "맨 뒤" },
];

export function BlockAlignPanel({
  count,
  onAlign,
  onDistribute,
  onZOrder,
  onRemove,
  onFit,
}: {
  /** 선택된 블록 수 (2 이상일 때만 이 패널이 나온다) */
  count: number;
  onAlign: (mode: AlignMode) => void;
  onDistribute: (axis: DistributeAxis) => void;
  onZOrder: (action: ZOrderAction) => void;
  onRemove: () => void;
  /** 고른 블록을 내용 높이에 맞춘다 — 넘치면 늘리고 남으면 줄인다 */
  onFit: () => void;
}) {
  // 간격을 나눌 '사이' 가 있어야 한다 — 2개는 사이가 하나뿐이라 나눌 것이 없다
  const canDistribute = count >= MIN_DISTRIBUTE;

  return (
    <div className="space-y-4">
      <p className="text-sm font-medium">블록 {count}개 선택됨</p>
      <p className="text-xs text-muted-foreground">
        선택 영역을 기준으로 맞춥니다. 속성을 고치려면 블록 하나만 선택하세요.
      </p>

      <div className="space-y-1">
        <Label className="text-xs">맞춤</Label>
        <div className="grid grid-cols-3 gap-1">
          {ALIGN_BUTTONS.map(({ mode, label, Icon }) => (
            <Button
              key={mode}
              type="button"
              variant="outline"
              size="icon"
              className="w-full"
              aria-label={label}
              title={label}
              onClick={() => onAlign(mode)}
            >
              <Icon className="size-4" />
            </Button>
          ))}
        </div>
      </div>

      <div className="space-y-1">
        <Label className="text-xs">간격</Label>
        <div className="grid grid-cols-2 gap-1">
          {DISTRIBUTE_BUTTONS.map(({ axis, label, Icon }) => (
            <Button
              key={axis}
              type="button"
              variant="outline"
              className="w-full"
              aria-label={label}
              title={
                canDistribute ? label : `${label} — 블록 3개 이상에서 쓸 수 있습니다`
              }
              disabled={!canDistribute}
              onClick={() => onDistribute(axis)}
            >
              <Icon className="size-4" />
            </Button>
          ))}
        </div>
        {canDistribute ? null : (
          <p className="text-xs text-muted-foreground">
            간격 균등은 블록 3개 이상에서 쓸 수 있습니다.
          </p>
        )}
      </div>

      <div className="space-y-1">
        <Label className="text-xs">겹침 순서</Label>
        <div className="grid grid-cols-4 gap-1">
          {Z_ACTIONS.map(({ action, label }) => (
            <Button
              key={action}
              type="button"
              variant="outline"
              size="sm"
              className="px-1 text-xs"
              onClick={() => onZOrder(action)}
            >
              {label}
            </Button>
          ))}
        </div>
      </div>

      <div className="space-y-1">
        <Label className="text-xs">크기</Label>
        <Button
          type="button"
          variant="outline"
          className="w-full"
          onClick={onFit}
        >
          <MoveVertical className="size-4" />
          내용 높이에 맞추기
        </Button>
      </div>

      <Button
        type="button"
        variant="outline"
        className="w-full text-destructive"
        onClick={onRemove}
      >
        <Trash2 className="size-4" />
        선택한 {count}개 삭제
      </Button>
    </div>
  );
}
