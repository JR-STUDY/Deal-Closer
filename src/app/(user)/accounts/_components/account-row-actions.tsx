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
import { toAccountFormValues, type AccountDTO } from "@/lib/account";
import { AccountFormDialog } from "./account-form-dialog";

/**
 * 거래처 목록 행 액션 (F-102 · F-103).
 *
 * 목록에서도 수정·삭제가 가능하다는 사실이 드러나야 해서 각 행 끝에 `⋯` 메뉴를 둔다.
 * 수정은 상세로 보내지 않고 목록에서 바로 폼 다이얼로그를 연다 — 그게 이 기능의 이유다.
 *
 * 삭제는 **누르기 전에** 차단 사유를 알린다. 연관 기회가 있으면 오류 토스트를 띄우는 대신
 * 다이얼로그에서 건수를 알리고 삭제 버튼을 아예 내린다 (서버도 409 로 거부하므로 이중 방어다).
 * 기회 건수는 목록이 이미 조회한 `_count` 를 그대로 받는다 (중복 쿼리 없음).
 */
export function AccountRowActions({
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
            aria-label={`${account.companyName} 관리`}
          >
            <MoreHorizontal className="size-4" aria-hidden="true" />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end">
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

      {pendingDelete ? (
        <AlertDialog
          defaultOpen
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
                  ? `"${account.companyName}" 에 연결된 영업 기회가 ${opportunityCount}건 있습니다. 기회와 그 문서·발송 이력까지 함께 사라지는 것을 막기 위해 삭제를 제한합니다. 기회를 먼저 정리해 주세요.`
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
      ) : null}
    </>
  );
}
