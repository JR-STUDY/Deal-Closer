"use client";

import { useState } from "react";
import { Check, User, AtSign } from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { teamAddress, type TeamMailDomainDTO } from "@/lib/mail-domain";

type SendingDomainFormProps = {
  /** 인증(VERIFIED)된 팀 도메인만 전달된다 */
  domains: TeamMailDomainDTO[];
  /** 현재 선택된 도메인 id (null = 개인 계정) */
  initialSelectedId: string | null;
  /** 팀 주소 조합에 쓰는 담당자 이메일 */
  userEmail: string;
  /** 개인 기본 연동 계정 주소 (없으면 null) */
  personalEmail: string | null;
};

type Option = {
  id: string | null;
  title: string;
  address: string | null;
  hint: string;
};

/**
 * 발신 신원 선택 — 개인 연동 계정 vs 팀 발신 도메인.
 * 선택은 즉시 저장(PATCH /api/mail-preference)되며 발송 화면에 반영된다.
 * 네이티브 라디오(sr-only)를 써서 방향키 순회·단일 선택 등 접근성을 브라우저에 위임한다.
 */
export function SendingDomainForm({
  domains,
  initialSelectedId,
  userEmail,
  personalEmail,
}: SendingDomainFormProps) {
  const [selectedId, setSelectedId] = useState<string | null>(
    initialSelectedId,
  );
  const [saving, setSaving] = useState(false);

  const options: Option[] = [
    {
      id: null,
      title: "개인 연동 계정",
      address: personalEmail,
      hint: personalEmail
        ? "연동한 Gmail/Outlook 계정으로 발송합니다."
        : "연동된 개인 계정이 없습니다. 위에서 계정을 연결해주세요.",
    },
    ...domains.map((d) => ({
      id: d.id,
      title: d.label ? `${d.label} (@${d.domain})` : `@${d.domain}`,
      address: teamAddress(userEmail, d.domain),
      hint: "팀 공용 도메인으로 발송합니다.",
    })),
  ];

  const select = async (id: string | null) => {
    if (id === selectedId || saving) return;
    const prev = selectedId;
    setSelectedId(id); // 낙관적 업데이트
    setSaving(true);
    try {
      const res = await fetch("/api/mail-preference", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ mailDomainId: id }),
      });
      const json = await res.json().catch(() => null);
      if (!res.ok || !json) {
        throw new Error(json?.error ?? "저장에 실패했습니다.");
      }
      toast.success("발신 신원을 변경했습니다.");
    } catch (err) {
      setSelectedId(prev); // 실패 시 원복
      toast.error(err instanceof Error ? err.message : "저장에 실패했습니다.");
    } finally {
      setSaving(false);
    }
  };

  return (
    <fieldset className="space-y-2" disabled={saving}>
      <legend className="sr-only">발신 신원 선택</legend>
      {options.map((opt) => {
        const checked = opt.id === selectedId;
        const disabled = opt.id === null && !personalEmail;
        return (
          <label
            key={opt.id ?? "personal"}
            className={cn(
              "block",
              disabled ? "cursor-not-allowed" : "cursor-pointer",
            )}
          >
            <input
              type="radio"
              name="sending-identity"
              className="peer sr-only"
              checked={checked}
              disabled={disabled}
              onChange={() => select(opt.id)}
            />
            <span
              className={cn(
                "flex items-center gap-3 rounded-lg border p-4 transition-colors",
                "peer-focus-visible:ring-2 peer-focus-visible:ring-ring peer-focus-visible:ring-offset-1",
                checked
                  ? "border-primary bg-primary/5 ring-1 ring-primary"
                  : "peer-enabled:hover:bg-muted/50",
                disabled && "opacity-60",
              )}
            >
              <span
                className={cn(
                  "flex size-9 shrink-0 items-center justify-center rounded-full",
                  checked
                    ? "bg-primary text-primary-foreground"
                    : "bg-muted text-muted-foreground",
                )}
              >
                {opt.id === null ? (
                  <User className="size-4" />
                ) : (
                  <AtSign className="size-4" />
                )}
              </span>
              <span className="min-w-0 flex-1">
                <span className="flex items-center gap-2">
                  <span className="truncate font-medium">{opt.title}</span>
                  {checked ? (
                    <Check className="size-4 shrink-0 text-primary" />
                  ) : null}
                </span>
                <span className="mt-0.5 block truncate text-sm text-muted-foreground">
                  {opt.address ? (
                    <>
                      발신 주소:{" "}
                      <span className="font-medium text-foreground">
                        {opt.address}
                      </span>
                    </>
                  ) : (
                    opt.hint
                  )}
                </span>
                {opt.address ? (
                  <span className="mt-0.5 block text-xs text-muted-foreground">
                    {opt.hint}
                  </span>
                ) : null}
              </span>
            </span>
          </label>
        );
      })}
    </fieldset>
  );
}
