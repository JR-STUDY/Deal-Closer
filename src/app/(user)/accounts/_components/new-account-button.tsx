"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { EMPTY_ACCOUNT_FORM } from "@/lib/account";
import { AccountFormDialog } from "./account-form-dialog";

/**
 * 거래처 등록 버튼 (F-101).
 * 다이얼로그는 열 때만 마운트해 매번 빈 폼으로 시작하고,
 * 저장 후에는 목록 서버 컴포넌트를 다시 조회한다.
 */
export function NewAccountButton({
  label = "새 거래처",
  variant = "default",
}: {
  label?: string;
  variant?: "default" | "outline";
}) {
  const router = useRouter();
  const [isOpen, setIsOpen] = useState(false);

  return (
    <>
      <Button variant={variant} onClick={() => setIsOpen(true)}>
        <Plus className="size-4" />
        {label}
      </Button>

      {isOpen ? (
        <AccountFormDialog
          initial={EMPTY_ACCOUNT_FORM}
          title="새 거래처 등록"
          description="회사명만 입력하시면 등록됩니다. 나머지 정보는 나중에 채우실 수 있습니다."
          onSaved={() => router.refresh()}
          onClose={() => setIsOpen(false)}
        />
      ) : null}
    </>
  );
}
