"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  emptyOpportunityForm,
  type OpportunityOwnerOption,
} from "@/lib/opportunity";
import { OpportunityFormDialog } from "./opportunity-form-dialog";

type NewOpportunityButtonProps = {
  owners: OpportunityOwnerOption[];
  /** 거래처 상세에서 열면 그 거래처가 미리 선택된다 (F-111) */
  defaultAccountId?: string;
  /** 미리 선택된 거래처의 회사명 — 자동완성 입력에 그대로 채운다 */
  defaultAccountName?: string;
  /** 기본 담당자 — 현재 로그인 사용자 */
  defaultOwnerId: string;
  label?: string;
  variant?: "default" | "outline";
};

/**
 * 영업 기회 등록 버튼 (F-111).
 *
 * 다이얼로그는 열 때만 마운트해 매번 빈 폼으로 시작하고,
 * 저장 후에는 목록·상세 서버 컴포넌트를 다시 조회한다.
 *
 * **거래처 후보를 미리 받지 않는다** (기회-16) — 다이얼로그의 자동완성이 필요할 때 검색하고,
 * 없는 회사는 그 자리에서 만든다. 그래서 "거래처가 없으면 기회를 만들 수 없다" 는 제약도 없앴다.
 */
export function NewOpportunityButton({
  owners,
  defaultAccountId,
  defaultAccountName,
  defaultOwnerId,
  label = "새 기회",
  variant = "default",
}: NewOpportunityButtonProps) {
  const router = useRouter();
  const [isOpen, setIsOpen] = useState(false);

  return (
    <>
      <Button variant={variant} onClick={() => setIsOpen(true)}>
        <Plus className="size-4" />
        {label}
      </Button>

      {isOpen ? (
        <OpportunityFormDialog
          owners={owners}
          initial={emptyOpportunityForm({
            accountId: defaultAccountId,
            ownerId: defaultOwnerId,
          })}
          initialAccountName={defaultAccountName}
          title="새 영업 기회 등록"
          description="거래처와 기회명만 입력하시면 등록됩니다. 예상 금액은 연결하신 문서에서 자동으로 정해집니다."
          onSaved={() => router.refresh()}
          onClose={() => setIsOpen(false)}
        />
      ) : null}
    </>
  );
}
