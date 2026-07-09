"use client";

import Link from "next/link";
import { CheckCircle2, AlertTriangle } from "lucide-react";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import type { SenderOption } from "./sender-client";

type SenderAccountBannerProps = {
  options: SenderOption[];
  /** 현재 선택값 (SenderOption.value) */
  selectedValue: string | null;
  /** 저장 중 여부 — 셀렉트 비활성화 */
  saving: boolean;
  /** 현재 발신 종류 (배너 라벨용) — 선택된 계정이 없으면 null */
  kind: "team" | "personal" | null;
  onChange: (value: string) => void;
};

/**
 * 발송 화면 상단의 발신 계정 배너.
 * 연동 계정이 있으면 셀렉트로 개인 계정↔팀 도메인을 바로 전환하고(메일 연동 페이지로 이동하지 않는다),
 * 하나도 없으면 계정 연동을 안내한다.
 */
export function SenderAccountBanner({
  options,
  selectedValue,
  saving,
  kind,
  onChange,
}: SenderAccountBannerProps) {
  if (options.length === 0) {
    return (
      <div className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-amber-300 bg-amber-50 px-4 py-3 text-sm text-amber-800 dark:border-amber-500/30 dark:bg-amber-500/10 dark:text-amber-300">
        <span className="flex items-center gap-2">
          <AlertTriangle className="size-4" />
          연동된 발신 계정이 없습니다. 이메일 계정을 먼저 연동해주세요.
        </span>
        <Link
          href="/settings/email"
          className="text-sm font-medium underline"
        >
          계정 연동하기
        </Link>
      </div>
    );
  }

  return (
    <div className="flex flex-wrap items-center justify-between gap-3 rounded-lg border bg-muted/40 px-4 py-3 text-sm">
      <span className="flex items-center gap-2 whitespace-nowrap">
        <CheckCircle2 className="size-4 text-emerald-600" />
        {kind === "team" ? "팀 도메인" : "연동됨"} · 발신 계정
      </span>
      <div className="flex flex-1 items-center justify-end gap-2">
        <Select
          value={selectedValue ?? undefined}
          onValueChange={onChange}
          disabled={saving}
        >
          <SelectTrigger
            size="sm"
            className="min-w-[240px] max-w-full"
            aria-label="발신 계정 선택"
          >
            <SelectValue placeholder="발신 계정 선택" />
          </SelectTrigger>
          <SelectContent>
            {options.map((o) => (
              <SelectItem key={o.value} value={o.value}>
                <span className="flex items-center gap-2">
                  <span className="font-medium">{o.email}</span>
                  <span className="text-xs text-muted-foreground">
                    {o.label}
                  </span>
                </span>
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Link
          href="/settings/email"
          className="whitespace-nowrap text-sm font-medium text-primary hover:underline"
        >
          계정 관리
        </Link>
      </div>
    </div>
  );
}
