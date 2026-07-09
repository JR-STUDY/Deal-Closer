"use client";

import { useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";

type AccountActionsProps = {
  email: string;
};

/**
 * 연결된 계정 카드의 "연결 해제" 버튼 (데모: 실제 저장 없음).
 * 발신 계정 선택은 아래 "발신 도메인" 섹션에서 하므로 기본 계정 스위치는 두지 않는다.
 */
export function AccountActions({ email }: AccountActionsProps) {
  const [isDisconnected, setIsDisconnected] = useState(false);

  function handleDisconnect() {
    setIsDisconnected(true);
    toast.success(`${email} 계정 연결을 해제했습니다 (데모)`);
  }

  return (
    <Button
      variant="outline"
      size="sm"
      disabled={isDisconnected}
      onClick={handleDisconnect}
    >
      {isDisconnected ? "연결 해제됨" : "연결 해제"}
    </Button>
  );
}
