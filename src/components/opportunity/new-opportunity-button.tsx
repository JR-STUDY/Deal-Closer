"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  emptyOpportunityForm,
  type OpportunityAccountOption,
  type OpportunityOwnerOption,
} from "@/lib/opportunity";
import { OpportunityFormDialog } from "./opportunity-form-dialog";

type NewOpportunityButtonProps = {
  accounts: OpportunityAccountOption[];
  owners: OpportunityOwnerOption[];
  /** 거래처 상세에서 열면 그 거래처가 미리 선택된다 (F-111) */
  defaultAccountId?: string;
  /** 기본 담당자 — 현재 로그인 사용자 */
  defaultOwnerId: string;
  label?: string;
  variant?: "default" | "outline";
};

/**
 * 영업 기회 등록 버튼 (F-111).
 * 다이얼로그는 열 때만 마운트해 매번 빈 폼으로 시작하고,
 * 저장 후에는 목록·상세 서버 컴포넌트를 다시 조회한다.
 */
export function NewOpportunityButton({
  accounts,
  owners,
  defaultAccountId,
  defaultOwnerId,
  label = "새 기회",
  variant = "default",
}: NewOpportunityButtonProps) {
  const router = useRouter();
  const [isOpen, setIsOpen] = useState(false);

  const hasAccount = accounts.length > 0;

  return (
    <>
      <Button
        variant={variant}
        onClick={() => setIsOpen(true)}
        disabled={!hasAccount}
        title={
          hasAccount
            ? undefined
            : "먼저 거래처를 등록하시면 기회를 만들 수 있습니다."
        }
      >
        <Plus className="size-4" />
        {label}
      </Button>

      {isOpen ? (
        <OpportunityFormDialog
          accounts={accounts}
          owners={owners}
          initial={emptyOpportunityForm({
            accountId: defaultAccountId,
            ownerId: defaultOwnerId,
          })}
          title="새 영업 기회 등록"
          description="거래처와 기회명만 입력하시면 등록됩니다. 금액·마감일은 나중에 채우실 수 있습니다."
          onSaved={() => router.refresh()}
          onClose={() => setIsOpen(false)}
        />
      ) : null}
    </>
  );
}
