"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Pencil, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
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
  toOpportunityFormValues,
  type OpportunityAccountOption,
  type OpportunityDTO,
  type OpportunityOwnerOption,
} from "@/lib/opportunity";

const LIST_HREF = "/opportunities";

/**
 * 기회 상세의 수정·삭제 액션 (F-111).
 *
 * 삭제하면 활동 이력(ActivityLog)도 Cascade 로 함께 사라지므로 확인 다이얼로그에서
 * 그 사실과 연결된 문서 수를 함께 알린다 (문서는 보관함에 남는다).
 * 단계 변경은 이 화면에서 제공하지 않는다 — Phase 3(F-112) 범위다.
 */
export function OpportunityDetailActions({
  opportunity,
  accounts,
  owners,
  documentCount,
}: {
  opportunity: OpportunityDTO;
  accounts: OpportunityAccountOption[];
  owners: OpportunityOwnerOption[];
  documentCount: number;
}) {
  const router = useRouter();
  const [isEditing, setIsEditing] = useState(false);
  const [pendingDelete, setPendingDelete] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);

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
      router.push(LIST_HREF);
      router.refresh();
    } catch {
      toast.error("삭제에 실패했습니다.");
    } finally {
      setIsDeleting(false);
    }
  };

  return (
    <>
      <Button variant="outline" onClick={() => setIsEditing(true)}>
        <Pencil className="size-4" />
        수정
      </Button>
      <Button variant="outline" onClick={() => setPendingDelete(true)}>
        <Trash2 className="size-4" />
        삭제
      </Button>

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

      <AlertDialog
        open={pendingDelete}
        onOpenChange={(open) => {
          if (!open) setPendingDelete(false);
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>영업 기회를 삭제할까요?</AlertDialogTitle>
            <AlertDialogDescription>
              {`"${opportunity.name}" 을(를) 삭제합니다. 이 기회에 쌓인 활동 이력도 함께 사라지며, 되돌릴 수 없습니다.`}
              {documentCount > 0
                ? ` 연결된 문서 ${documentCount}건은 보관함에 그대로 남고 기회 연결만 해제됩니다.`
                : ""}
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
    </>
  );
}
