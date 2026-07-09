"use client";

import { useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";

type AccountActionsProps = {
  accountId: string;
  email: string;
  defaultChecked: boolean;
};

/** 연결된 계정 카드의 "기본 발송 계정 사용" 스위치 + "연결 해제" 버튼 (데모: 실제 저장 없음) */
export function AccountActions({
  accountId,
  email,
  defaultChecked,
}: AccountActionsProps) {
  const [isDefault, setIsDefault] = useState(defaultChecked);
  const [isDisconnected, setIsDisconnected] = useState(false);

  function handleDefaultChange(checked: boolean) {
    setIsDefault(checked);
    if (checked) {
      toast.success("기본 발송 계정으로 설정했습니다 (데모)");
    }
  }

  function handleDisconnect() {
    setIsDisconnected(true);
    toast.success(`${email} 계정 연결을 해제했습니다 (데모)`);
  }

  return (
    <div className="flex flex-wrap items-center gap-4 sm:gap-6">
      <div className="flex items-center gap-2">
        <Label
          htmlFor={`default-${accountId}`}
          className="text-xs font-normal text-muted-foreground"
        >
          기본 발송 계정으로 사용
        </Label>
        <Switch
          id={`default-${accountId}`}
          checked={isDefault}
          disabled={isDisconnected}
          onCheckedChange={handleDefaultChange}
        />
      </div>
      <Button
        variant="outline"
        size="sm"
        disabled={isDisconnected}
        onClick={handleDisconnect}
      >
        {isDisconnected ? "연결 해제됨" : "연결 해제"}
      </Button>
    </div>
  );
}
