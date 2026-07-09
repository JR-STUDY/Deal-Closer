"use client";

import { toast } from "sonner";
import { Button } from "@/components/ui/button";

type ConnectButtonProps = {
  label: string;
  brandName: string;
};

/** Gmail/Outlook 신규 연결 시작 버튼 (데모: OAuth 없이 안내 토스트만 표시) */
export function ConnectButton({ label, brandName }: ConnectButtonProps) {
  return (
    <Button
      variant="outline"
      className="w-full"
      onClick={() => toast(`${brandName} 계정 연결을 시작합니다 (데모)`)}
    >
      {label}
    </Button>
  );
}
