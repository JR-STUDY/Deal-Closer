"use client";

import { useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import {
  CONTACT_EMAIL_MAX,
  CONTACT_NAME_MAX,
  CONTACT_PHONE_MAX,
  CONTACT_POSITION_MAX,
  type ContactFormValues,
} from "@/lib/contact";

/**
 * 대표 스위치를 잠그는 이유. 잠글 때는 **왜 못 바꾸는지**를 함께 보여준다 —
 * 눌리지 않는 스위치만 두면 고장으로 읽힌다 (정책 ACC_* · COPY-TONE).
 */
export type PrimaryLock =
  /** 자유롭게 켜고 끌 수 있다 */
  | "none"
  /** 첫 담당자다 — 담당자가 하나뿐인데 대표가 아니면 목록에서 사라진다 */
  | "first"
  /** 이미 대표다 — 스스로 내려오면 대표 0명이 된다. 다른 담당자를 올려야 바뀐다 */
  | "current";

const LOCK_HINT: Record<PrimaryLock, string> = {
  none: "대표 담당자는 거래처당 한 분이며, 목록에는 이분만 표시됩니다.",
  first: "첫 담당자는 자동으로 대표가 됩니다.",
  current:
    "이미 대표 담당자입니다. 다른 담당자를 대표로 지정하시면 자동으로 해제됩니다.",
};

/** 선택 입력 한 줄 (라벨 + 단일 행 입력) */
function Field({
  id,
  label,
  value,
  onChange,
  maxLength,
  placeholder,
  type = "text",
  required = false,
}: {
  id: string;
  label: string;
  value: string;
  onChange: (value: string) => void;
  maxLength: number;
  placeholder?: string;
  type?: "text" | "email" | "tel";
  required?: boolean;
}) {
  return (
    <div className="space-y-1.5">
      <Label htmlFor={id}>
        {label}
        {required ? (
          <span className="text-destructive" aria-hidden="true">
            *
          </span>
        ) : null}
      </Label>
      <Input
        id={id}
        type={type}
        value={value}
        required={required}
        maxLength={maxLength}
        placeholder={placeholder}
        onChange={(e) => onChange(e.target.value)}
      />
    </div>
  );
}

/**
 * 거래처 담당자 추가·수정 다이얼로그 (거래처-8).
 * 담당자명만 필수이고 나머지는 선택이다. 형식 검증은 서버(`parseContactInput`)가
 * 단일 기준이며, 실패 메시지를 toast 로 보여준다.
 *
 * 대표 지정은 **보내기만** 하고 판정하지 않는다 — 첫 담당자 자동 대표·기존 대표 해제는
 * 서버가 `@/lib/contact` 규칙으로 한 트랜잭션에 처리한다.
 *
 * 부모는 열고 싶을 때만 이 컴포넌트를 마운트한다. `key` 를 함께 주면 열 때마다
 * initial 로 새로 초기화된다 (파생 state 없이 리마운트로 해결).
 */
export function ContactFormDialog({
  accountId,
  contactId,
  initial,
  title,
  description,
  primaryLock,
  onSaved,
  onClose,
}: {
  accountId: string;
  /** 값이 있으면 수정(PATCH), 없으면 생성(POST) */
  contactId?: string;
  initial: ContactFormValues;
  title: string;
  description?: string;
  primaryLock: PrimaryLock;
  onSaved: () => void;
  onClose: () => void;
}) {
  const [name, setName] = useState(() => initial.name);
  const [position, setPosition] = useState(() => initial.position);
  const [phone, setPhone] = useState(() => initial.phone);
  const [email, setEmail] = useState(() => initial.email);
  const [isPrimary, setIsPrimary] = useState(
    () => initial.isPrimary || primaryLock !== "none",
  );
  const [isSaving, setIsSaving] = useState(false);

  const canSubmit = name.trim().length > 0 && !isSaving;
  const isLocked = primaryLock !== "none";

  const handleSubmit = async () => {
    setIsSaving(true);
    try {
      const res = await fetch(
        contactId
          ? `/api/accounts/${accountId}/contacts/${contactId}`
          : `/api/accounts/${accountId}/contacts`,
        {
          method: contactId ? "PATCH" : "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ name, position, phone, email, isPrimary }),
        },
      );
      const json = await res.json().catch(() => null);
      if (!res.ok) {
        toast.error(json?.error ?? "저장에 실패했습니다.");
        return;
      }
      toast.success(
        contactId ? "담당자를 수정했습니다." : "담당자를 등록했습니다.",
      );
      onSaved();
      onClose();
    } catch {
      toast.error("저장에 실패했습니다.");
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <Dialog
      defaultOpen
      onOpenChange={(open) => {
        if (!open) onClose();
      }}
    >
      <DialogContent className="max-h-[90svh] gap-5 overflow-y-auto sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          {description ? (
            <DialogDescription>{description}</DialogDescription>
          ) : null}
        </DialogHeader>

        <form
          className="space-y-4"
          onSubmit={(e) => {
            e.preventDefault();
            if (canSubmit) handleSubmit();
          }}
        >
          <div className="grid gap-4 sm:grid-cols-2">
            <Field
              id="contact-name"
              label="담당자명"
              required
              value={name}
              onChange={setName}
              maxLength={CONTACT_NAME_MAX}
              placeholder="예: 이서준"
            />
            <Field
              id="contact-position"
              label="직책"
              value={position}
              onChange={setPosition}
              maxLength={CONTACT_POSITION_MAX}
              placeholder="예: 구매팀 과장"
            />
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <Field
              id="contact-phone"
              label="핸드폰 번호"
              type="tel"
              value={phone}
              onChange={setPhone}
              maxLength={CONTACT_PHONE_MAX}
              placeholder="예: 010-1234-5678"
            />
            <Field
              id="contact-email"
              label="담당자 이메일"
              type="email"
              value={email}
              onChange={setEmail}
              maxLength={CONTACT_EMAIL_MAX}
              placeholder="예: buyer@example.com"
            />
          </div>

          <div className="flex items-start justify-between gap-4 rounded-md border px-3 py-3">
            <div className="space-y-1">
              <Label htmlFor="contact-is-primary">대표 담당자</Label>
              <p
                id="contact-is-primary-hint"
                className="text-xs text-muted-foreground"
              >
                {LOCK_HINT[primaryLock]}
              </p>
            </div>
            <Switch
              id="contact-is-primary"
              checked={isPrimary}
              disabled={isLocked}
              aria-describedby="contact-is-primary-hint"
              onCheckedChange={setIsPrimary}
            />
          </div>
        </form>

        <DialogFooter>
          <Button variant="outline" onClick={onClose} disabled={isSaving}>
            취소
          </Button>
          <Button onClick={handleSubmit} disabled={!canSubmit}>
            {isSaving ? "저장 중…" : "저장"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
