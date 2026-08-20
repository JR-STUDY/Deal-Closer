"use client";

import { useCallback, useState } from "react";
import { ArrowRightLeft } from "lucide-react";
import { toast } from "sonner";
import {
  LOST_REASON_PRESETS,
  OPPORTUNITY_STAGES,
  OPPORTUNITY_STAGE_LABELS,
  isOpportunityStage,
  type OpportunityStage,
} from "@/lib/constants";
import { stageChangeWarning } from "@/lib/opportunity-transition";
import { Input } from "@/components/ui/input";
import {
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuSub,
  DropdownMenuSubContent,
  DropdownMenuSubTrigger,
} from "@/components/ui/dropdown-menu";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";

/**
 * 단계 변경 공용 조작 (F-112) — 칸반 드래그와 ⋯ 메뉴가 같은 경로를 쓴다.
 *
 * 드래그는 마우스로만 가능하므로 **키보드로 도달 가능한 대체 수단**을 함께 제공해야 한다
 * (정책 ACC_*). 목록 행 메뉴와 칸반 카드 메뉴가 이 파일의 `StageChangeMenuItems` 를 공유해
 * 어느 화면에서든 같은 방식으로 단계를 고를 수 있다.
 *
 * 전이 허용 규칙과 경고 문구는 `@/lib/opportunity-transition` 의 순수 함수가 단일 기준이고,
 * 실제 저장은 `POST /api/opportunities/:id/stage` → `@/lib/opportunity-stage` 로만 흐른다.
 */

export type StageChangeTarget = {
  id: string;
  name: string;
  /** 지금 화면에 보이는 단계 (칸반은 낙관적 반영 전 값) */
  stage: OpportunityStage;
};

export type StageChangeRequest = {
  target: StageChangeTarget;
  toStage: OpportunityStage;
  /**
   * 낙관적 반영을 되돌린다. 실패·취소·전이 없음일 때 호출된다.
   * 칸반처럼 미리 카드를 옮겨 둔 화면만 넘긴다 (목록은 넘기지 않는다).
   */
  rollback?: () => void;
};

/**
 * 단계 변경 요청 상태 관리.
 * 되돌리기(마감 → 진행)처럼 알릴 부작용이 있으면 먼저 확인창을 띄우고, 아니면 바로 저장한다.
 */
export function useStageChange({ onChanged }: { onChanged?: () => void } = {}) {
  const [pending, setPending] = useState<StageChangeRequest | null>(null);
  const [isSaving, setIsSaving] = useState(false);

  const submit = useCallback(
    async (request: StageChangeRequest, lost?: LostReasonInput) => {
      setIsSaving(true);
      try {
        const res = await fetch(
          `/api/opportunities/${request.target.id}/stage`,
          {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            // 저장 문자열을 여기서 조립하지 않는다 — 고른 값과 직접 입력을 그대로 보내고
            // 서버의 `parseLostReason()` 이 한 곳에서 정규화한다 (F-117).
            body: JSON.stringify({
              stage: request.toStage,
              ...(lost
                ? { lostReason: lost.choice, lostReasonOther: lost.otherText }
                : {}),
            }),
          },
        );
        const json = await res.json().catch(() => null);
        if (!res.ok) {
          throw new Error(json?.error ?? "단계를 변경하지 못했습니다.");
        }

        const data = json?.data as
          { changed?: boolean; message?: string } | undefined;
        if (data?.changed === false) {
          // 서버가 전이하지 않았다 → 화면에 미리 옮겨 둔 카드를 원위치로 되돌린다.
          request.rollback?.();
          toast.info(data.message ?? "단계가 그대로입니다.");
          return;
        }
        toast.success(data?.message ?? "단계를 변경했습니다.");
        onChanged?.();
      } catch (error) {
        request.rollback?.();
        toast.error(
          error instanceof Error
            ? error.message
            : "단계를 변경하지 못했습니다.",
        );
      } finally {
        setIsSaving(false);
        setPending(null);
      }
    },
    [onChanged],
  );

  const request = useCallback(
    (next: StageChangeRequest) => {
      if (next.toStage === next.target.stage) {
        next.rollback?.();
        return;
      }
      // 실주는 사유가 필수다 (F-117) — 바로 저장하지 않고 사유부터 받는다.
      // 되돌리기 경고와 겹치지 않는다: 되돌리기는 마감 → 진행이라 목표가 LOST 일 수 없다.
      if (next.toStage === "LOST") {
        setPending(next);
        return;
      }
      if (stageChangeWarning(next.target.stage, next.toStage)) {
        setPending(next);
        return;
      }
      void submit(next);
    },
    [submit],
  );

  const cancel = useCallback(() => {
    pending?.rollback?.();
    setPending(null);
  }, [pending]);

  const confirm = useCallback(() => {
    if (pending) void submit(pending);
  }, [pending, submit]);

  /** 실주 사유를 받아 저장한다 (F-117). 검증은 서버의 순수 함수가 한다. */
  const confirmLost = useCallback(
    (lost: LostReasonInput) => {
      if (pending) void submit(pending, lost);
    },
    [pending, submit],
  );

  return { request, pending, cancel, confirm, confirmLost, isSaving };
}

/**
 * ⋯ 메뉴 안의 "단계 변경" 하위 메뉴 — 드래그를 쓸 수 없는 사용자의 조작 경로다 (ACC_*).
 * 반드시 `DropdownMenu` 안에서 사용한다.
 */
export function StageChangeMenuItems({
  current,
  onSelect,
}: {
  current: OpportunityStage;
  onSelect: (stage: OpportunityStage) => void;
}) {
  return (
    <DropdownMenuSub>
      <DropdownMenuSubTrigger>
        <ArrowRightLeft aria-hidden="true" />
        단계 변경
      </DropdownMenuSubTrigger>
      <DropdownMenuSubContent>
        <DropdownMenuRadioGroup
          value={current}
          onValueChange={(value) => {
            if (isOpportunityStage(value)) onSelect(value);
          }}
        >
          {OPPORTUNITY_STAGES.map((stage) => (
            <DropdownMenuRadioItem key={stage} value={stage}>
              {OPPORTUNITY_STAGE_LABELS[stage]}
            </DropdownMenuRadioItem>
          ))}
        </DropdownMenuRadioGroup>
      </DropdownMenuSubContent>
    </DropdownMenuSub>
  );
}

/** 실주 사유 입력 (라디오에서 고른 값 + 기타 직접 입력) */
export type LostReasonInput = { choice: string; otherText: string };

/**
 * 단계 변경 전에 뜨는 창 — **두 가지**를 하나로 묶는다.
 *
 *  ① **실주 사유 입력** (F-117): 목표가 실주면 사유 없이 저장하지 않는다.
 *  ② **되돌리기 확인** (정책 STATE_BACK_NAV_CONFIRM): 마감을 풀면 확정일·실주 사유가
 *     지워지므로 누르기 전에 알린다.
 *
 * 한 컴포넌트로 둔 이유는 호출부(칸반·목록·스테퍼) 셋이 **같은 하나만 렌더하면 되도록**
 * 하기 위해서다. 창을 둘로 나누면 세 화면이 각자 두 개를 배치해야 하고, 한 곳이 빠지면
 * 그 화면에서만 실주가 사유 없이 조용히 저장된다.
 */
export function StageChangeConfirmDialog({
  pending,
  isSaving,
  onCancel,
  onConfirm,
  onConfirmLost,
}: {
  pending: StageChangeRequest | null;
  isSaving: boolean;
  onCancel: () => void;
  onConfirm: () => void;
  onConfirmLost: (lost: LostReasonInput) => void;
}) {
  const warning = pending
    ? stageChangeWarning(pending.target.stage, pending.toStage)
    : null;

  if (pending?.toStage === "LOST") {
    return (
      <LostReasonDialog
        name={pending.target.name}
        isSaving={isSaving}
        onCancel={onCancel}
        onConfirm={onConfirmLost}
      />
    );
  }

  return (
    <AlertDialog
      open={pending !== null}
      onOpenChange={(open) => {
        if (!open && !isSaving) onCancel();
      }}
    >
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>
            ‘{pending?.target.name}’ 의 단계를 되돌릴까요?
          </AlertDialogTitle>
          <AlertDialogDescription>{warning}</AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel disabled={isSaving}>취소</AlertDialogCancel>
          <AlertDialogAction
            disabled={isSaving}
            onClick={(event) => {
              event.preventDefault();
              onConfirm();
            }}
          >
            {isSaving ? "변경 중…" : "되돌리기"}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}

/**
 * 실주 사유 입력창 (F-117).
 *
 * 고정 목록 + `기타`(직접 입력)로 받는다. **저장 문자열을 여기서 만들지 않는다** —
 * 고른 값과 입력을 그대로 올려 보내고 서버의 `parseLostReason()` 이 정규화한다.
 * 화면이 조립하면 화면이 늘어날 때마다 통계에 다른 표기가 쌓인다.
 *
 * 라디오는 네이티브 `<input type="radio">` 다. 같은 `name` 으로 묶이므로 ↑↓ 이동과
 * 그룹 단위 Tab 이 브라우저 기본 동작으로 동작한다 (ACC_*).
 */
function LostReasonDialog({
  name,
  isSaving,
  onCancel,
  onConfirm,
}: {
  name: string;
  isSaving: boolean;
  onCancel: () => void;
  onConfirm: (lost: LostReasonInput) => void;
}) {
  const [choice, setChoice] = useState("");
  const [otherText, setOtherText] = useState("");
  const isOther = choice === "기타";
  // 기타를 골랐으면 입력이 있어야 한다 — "기타: " 만 저장하면 아무것도 기록하지 않은 것과 같다.
  const canSubmit =
    !isSaving && (isOther ? otherText.trim().length > 0 : choice.length > 0);

  return (
    <AlertDialog
      open
      onOpenChange={(open) => {
        if (!open && !isSaving) onCancel();
      }}
    >
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>
            ‘{name}’ 을(를) 실주로 마감할까요?
          </AlertDialogTitle>
          <AlertDialogDescription>
            마감 확정일이 오늘로 기록됩니다. 사유는 이탈률 통계의 분류 기준이
            되므로 하나를 선택해 주세요.
          </AlertDialogDescription>
        </AlertDialogHeader>

        <fieldset className="space-y-2" disabled={isSaving}>
          <legend className="sr-only">실주 사유</legend>
          <div className="grid grid-cols-2 gap-x-4 gap-y-2">
            {[...LOST_REASON_PRESETS, "기타"].map((preset) => (
              <label
                key={preset}
                className="flex cursor-pointer items-center gap-2 text-sm"
              >
                <input
                  type="radio"
                  name="lost-reason"
                  value={preset}
                  checked={choice === preset}
                  onChange={() => setChoice(preset)}
                  className="size-4 accent-primary"
                />
                {preset}
              </label>
            ))}
          </div>
          {isOther ? (
            <Input
              value={otherText}
              onChange={(event) => setOtherText(event.target.value)}
              placeholder="사유를 입력해주세요"
              aria-label="기타 사유"
              autoFocus
            />
          ) : null}
        </fieldset>

        <AlertDialogFooter>
          <AlertDialogCancel disabled={isSaving}>취소</AlertDialogCancel>
          <AlertDialogAction
            disabled={!canSubmit}
            onClick={(event) => {
              event.preventDefault();
              onConfirm({ choice, otherText });
            }}
          >
            {isSaving ? "저장 중…" : "실주로 마감"}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
