"use client";

import { useCallback, useState } from "react";
import { ArrowRightLeft } from "lucide-react";
import { toast } from "sonner";
import {
  OPPORTUNITY_STAGES,
  OPPORTUNITY_STAGE_LABELS,
  isOpportunityStage,
  type OpportunityStage,
} from "@/lib/constants";
import { stageChangeWarning } from "@/lib/opportunity-transition";
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
    async (request: StageChangeRequest) => {
      setIsSaving(true);
      try {
        const res = await fetch(
          `/api/opportunities/${request.target.id}/stage`,
          {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ stage: request.toStage }),
          },
        );
        const json = await res.json().catch(() => null);
        if (!res.ok) {
          throw new Error(json?.error ?? "단계를 변경하지 못했습니다.");
        }

        const data = json?.data as
          | { changed?: boolean; message?: string }
          | undefined;
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

  return { request, pending, cancel, confirm, isSaving };
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

/**
 * 되돌리기 확인창 (정책 STATE_BACK_NAV_CONFIRM).
 * 마감(수주·실주)을 풀면 확정일·실주 사유가 지워지므로 누르기 전에 알린다.
 */
export function StageChangeConfirmDialog({
  pending,
  isSaving,
  onCancel,
  onConfirm,
}: {
  pending: StageChangeRequest | null;
  isSaving: boolean;
  onCancel: () => void;
  onConfirm: () => void;
}) {
  const warning = pending
    ? stageChangeWarning(pending.target.stage, pending.toStage)
    : null;

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
