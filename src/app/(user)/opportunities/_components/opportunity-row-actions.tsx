"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { MoreHorizontal, Pencil, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
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
import { OpportunityFormDialog } from "@/components/opportunity/opportunity-form-dialog";
import {
  StageChangeConfirmDialog,
  StageChangeMenuItems,
  useStageChange,
} from "@/components/opportunity/stage-change";
import {
  toOpportunityFormValues,
  type OpportunityAccountOption,
  type OpportunityDTO,
  type OpportunityOwnerOption,
} from "@/lib/opportunity";

/**
 * 영업 기회 목록 행 액션 (F-111 · F-112).
 *
 * 목록에서도 수정·삭제·단계 변경이 가능하다는 사실이 드러나야 해서 각 행 끝에 `⋯` 메뉴를 둔다.
 * 수정은 상세로 보내지 않고 목록에서 바로 폼 다이얼로그를 연다.
 * 단계 변경은 칸반 카드와 **같은 컴포넌트**(`@/components/opportunity/stage-change`)를 쓴다 —
 * 드래그를 쓸 수 없어도 목록에서 키보드로 단계를 바꿀 수 있어야 한다 (정책 ACC_*).
 *
 * 기회 삭제에는 거래처처럼 차단 조건이 없다. 대신 활동 이력이 함께 사라진다는 사실과
 * 문서는 보관함에 남는다는 사실을 **누르기 전에** 알린다.
 * 거래처·담당자 후보는 목록 페이지가 이미 조회한 값을 그대로 받는다 (중복 쿼리 없음).
 */
export function OpportunityRowActions({
  opportunity,
  accounts,
  owners,
}: {
  opportunity: OpportunityDTO;
  accounts: OpportunityAccountOption[];
  owners: OpportunityOwnerOption[];
}) {
  const router = useRouter();
  const [isEditing, setIsEditing] = useState(false);
  const [pendingDelete, setPendingDelete] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);
  const stageChange = useStageChange({ onChanged: () => router.refresh() });

  const handleDelete = async () => {
    setIsDeleting(true);
    try {
      const res = await fetch(`/api/opportunities/${opportunity.id}`, {
        method: "DELETE",
      });
      if (!res.ok) {
        const json = await res.json().catch(() => null);
        toast.error(json?.error ?? "삭제에 실패했습니다.");
        return;
      }
      toast.success("영업 기회를 삭제했습니다.");
      setPendingDelete(false);
      router.refresh();
    } catch {
      toast.error("삭제에 실패했습니다.");
    } finally {
      setIsDeleting(false);
    }
  };

  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button
            variant="ghost"
            size="icon"
            className="size-8"
            aria-label={`${opportunity.name} 관리`}
          >
            <MoreHorizontal className="size-4" aria-hidden="true" />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end">
          <StageChangeMenuItems
            current={opportunity.stage}
            onSelect={(stage) =>
              stageChange.request({
                target: {
                  id: opportunity.id,
                  name: opportunity.name,
                  stage: opportunity.stage,
                },
                toStage: stage,
              })
            }
          />
          <DropdownMenuSeparator />
          <DropdownMenuItem onSelect={() => setIsEditing(true)}>
            <Pencil aria-hidden="true" />
            수정
          </DropdownMenuItem>
          <DropdownMenuItem
            variant="destructive"
            onSelect={() => setPendingDelete(true)}
          >
            <Trash2 aria-hidden="true" />
            삭제
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>

      {/* 마감 → 진행 되돌리기 확인 (칸반과 같은 문구·같은 규칙) */}
      <StageChangeConfirmDialog
        pending={stageChange.pending}
        isSaving={stageChange.isSaving}
        onCancel={stageChange.cancel}
        onConfirm={stageChange.confirm}
      />

      {isEditing ? (
        <OpportunityFormDialog
          // 최신 값으로 매번 새로 초기화한다 (파생 state 없이 리마운트로 해결)
          key={opportunity.updatedAt}
          opportunityId={opportunity.id}
          initial={toOpportunityFormValues(opportunity)}
          accounts={accounts}
          owners={owners}
          title="영업 기회 수정"
          description={`"${opportunity.name}" 의 정보를 수정합니다.`}
          onSaved={() => router.refresh()}
          onClose={() => setIsEditing(false)}
        />
      ) : null}

      {pendingDelete ? (
        <AlertDialog
          defaultOpen
          onOpenChange={(open) => {
            if (!open) setPendingDelete(false);
          }}
        >
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>영업 기회를 삭제할까요?</AlertDialogTitle>
              <AlertDialogDescription>
                {`"${opportunity.name}" 을(를) 삭제합니다. 이 기회에 쌓인 활동 이력도 함께 사라지며, 되돌릴 수 없습니다. 연결된 문서는 보관함에 그대로 남고 기회 연결만 해제됩니다.`}
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel disabled={isDeleting}>취소</AlertDialogCancel>
              <AlertDialogAction
                onClick={(e) => {
                  e.preventDefault();
                  handleDelete();
                }}
                disabled={isDeleting}
              >
                {isDeleting ? "삭제 중…" : "삭제"}
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      ) : null}
    </>
  );
}
