"use client";

import { toast } from "sonner";
import { EMAIL_PROVIDER_LABELS, type EmailProvider } from "@/lib/constants";
import { ProviderLogo } from "@/components/provider-logo";

/** 안내 토스트에 쓸 브랜드명 */
const PROVIDER_BRANDS: Record<EmailProvider, string> = {
  GMAIL: "Google",
  OUTLOOK: "Microsoft",
};

/**
 * Gmail/Outlook 신규 연결 pill 버튼 (데모: OAuth 없이 안내 토스트만 표시).
 * 실제 브랜드 아이콘 + 라벨을 컴팩트한 pill 로 노출한다.
 */
export function ConnectButton({ provider }: { provider: EmailProvider }) {
  const label = EMAIL_PROVIDER_LABELS[provider];
  return (
    <button
      type="button"
      aria-label={`${label} 계정 연결`}
      onClick={() =>
        toast(`${PROVIDER_BRANDS[provider]} 계정 연결을 시작합니다 (데모)`)
      }
      className="inline-flex items-center gap-2 rounded-full border bg-background px-4 py-2 text-sm font-medium transition-colors hover:border-primary/50 hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
    >
      <ProviderLogo provider={provider} className="size-5" />
      {label}
    </button>
  );
}
