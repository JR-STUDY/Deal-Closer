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
import { toAccountFormValues, type AccountDTO } from "@/lib/account";
import { AccountFormDialog } from "../../_components/account-form-dialog";

const LIST_HREF = "/accounts";

/**
 * 거래처 상세의 수정·삭제 액션 (F-103).
 * 연관 기회가 있으면 삭제 확인 다이얼로그에서 사유를 알리고 실행을 막는다
 * (서버도 409 로 거부하므로 이중 방어다).
 */
export function AccountDetailActions({
  account,
  opportunityCount,
}: {
  account: AccountDTO;
  opportunityCount: number;
}) {
  const router = useRouter();
  const [isEditing, setIsEditing] = useState(false);
  const [pendingDelete, setPendingDelete] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);

  const hasOpportunities = opportunityCount > 0;

  const handleDelete = async () => {
    setIsDeleting(true);
    try {
      const res = await fetch(`/api/accounts/${account.id}`, {
        method: "DELETE",
      });
      if (!res.ok) {
        const json = await res.json().catch(() => null);
        toast.error(json?.error ?? "삭제에 실패했습니다.");
        return;
      }
      toast.success("거래처를 삭제했습니다.");
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
        <AccountFormDialog
          // 최신 값으로 매번 새로 초기화한다 (파생 state 없이 리마운트로 해결)
          key={account.updatedAt}
          accountId={account.id}
          initial={toAccountFormValues(account)}
          title="거래처 수정"
          description={`"${account.companyName}" 의 정보를 수정합니다.`}
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
            <AlertDialogTitle>
              {hasOpportunities
                ? "이 거래처는 삭제할 수 없습니다"
                : "거래처를 삭제할까요?"}
            </AlertDialogTitle>
            <AlertDialogDescription>
              {hasOpportunities
                ? `"${account.companyName}" 에 연결된 영업 기회가 ${opportunityCount}건 있습니다. 기회와 그 문서·발송 이력까지 함께 사라지는 것을 막기 위해 삭제를 제한합니다. 기회를 먼저 정리한 뒤 다시 시도해주세요.`
                : `"${account.companyName}" 을(를) 삭제합니다. 이 작업은 되돌릴 수 없습니다.`}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={isDeleting}>
              {hasOpportunities ? "닫기" : "취소"}
            </AlertDialogCancel>
            {hasOpportunities ? null : (
              <AlertDialogAction
                onClick={(e) => {
                  e.preventDefault();
                  handleDelete();
                }}
                disabled={isDeleting}
              >
                {isDeleting ? "삭제 중…" : "삭제"}
              </AlertDialogAction>
            )}
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
