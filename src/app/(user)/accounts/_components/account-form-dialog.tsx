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
import { Textarea } from "@/components/ui/textarea";
import {
  ACCOUNT_COMPANY_NAME_MAX,
  ACCOUNT_CONTACT_NAME_MAX,
  ACCOUNT_EMAIL_MAX,
  ACCOUNT_MEMO_MAX,
  ACCOUNT_PHONE_MAX,
  ACCOUNT_POSITION_MAX,
  BIZ_REG_NO_FORMAT,
  type AccountDTO,
  type AccountFormValues,
} from "@/lib/account";

type AccountFormDialogProps = {
  /** 값이 있으면 수정(PATCH), 없으면 생성(POST) */
  accountId?: string;
  initial: AccountFormValues;
  title: string;
  description?: string;
  /** 저장 성공 시 저장된 거래처 전달 */
  onSaved: (account: AccountDTO) => void;
  /** 다이얼로그가 닫힐 때 (성공·취소 공통) */
  onClose: () => void;
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
  hint,
  required = false,
}: {
  id: string;
  label: string;
  value: string;
  onChange: (value: string) => void;
  maxLength: number;
  placeholder?: string;
  type?: "text" | "email" | "tel";
  hint?: string;
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
        aria-describedby={hint ? `${id}-hint` : undefined}
        onChange={(e) => onChange(e.target.value)}
      />
      {hint ? (
        <p id={`${id}-hint`} className="text-xs text-muted-foreground">
          {hint}
        </p>
      ) : null}
    </div>
  );
}

/**
 * 거래처 생성·수정 다이얼로그 (F-101 · F-103).
 * 회사명만 필수이고 나머지는 선택이다. 형식 검증(이메일·사업자등록번호)은
 * 서버(`parseAccountInput`)가 단일 기준이며, 실패 메시지를 toast 로 보여준다.
 *
 * 부모는 열고 싶을 때만 이 컴포넌트를 마운트한다. `key` 를 함께 주면 열 때마다
 * initial 로 새로 초기화된다 (파생 state 없이 리마운트로 해결).
 */
export function AccountFormDialog({
  accountId,
  initial,
  title,
  description,
  onSaved,
  onClose,
}: AccountFormDialogProps) {
  const [companyName, setCompanyName] = useState(() => initial.companyName);
  const [contactName, setContactName] = useState(() => initial.contactName);
  const [position, setPosition] = useState(() => initial.position);
  const [phone, setPhone] = useState(() => initial.phone);
  const [email, setEmail] = useState(() => initial.email);
  const [bizRegNo, setBizRegNo] = useState(() => initial.bizRegNo);
  const [memo, setMemo] = useState(() => initial.memo);
  const [isSaving, setIsSaving] = useState(false);

  const canSubmit = companyName.trim().length > 0 && !isSaving;

  const handleSubmit = async () => {
    setIsSaving(true);
    try {
      const res = await fetch(
        accountId ? `/api/accounts/${accountId}` : "/api/accounts",
        {
          method: accountId ? "PATCH" : "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            companyName,
            contactName,
            position,
            phone,
            email,
            bizRegNo,
            memo,
          }),
        },
      );
      const json = await res.json().catch(() => null);
      if (!res.ok) {
        toast.error(json?.error ?? "저장에 실패했습니다.");
        return;
      }
      onSaved(json.data as AccountDTO);
      toast.success(
        accountId ? "거래처를 수정했습니다." : "거래처를 등록했습니다.",
      );
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
          <Field
            id="account-company-name"
            label="회사명"
            required
            value={companyName}
            onChange={setCompanyName}
            maxLength={ACCOUNT_COMPANY_NAME_MAX}
            placeholder="예: (주)에이비씨 테크놀로지"
          />

          <div className="grid gap-4 sm:grid-cols-2">
            <Field
              id="account-contact-name"
              label="담당자명"
              value={contactName}
              onChange={setContactName}
              maxLength={ACCOUNT_CONTACT_NAME_MAX}
              placeholder="예: 이서준"
            />
            <Field
              id="account-position"
              label="직책"
              value={position}
              onChange={setPosition}
              maxLength={ACCOUNT_POSITION_MAX}
              placeholder="예: 구매팀 과장"
            />
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <Field
              id="account-phone"
              label="핸드폰 번호"
              type="tel"
              value={phone}
              onChange={setPhone}
              maxLength={ACCOUNT_PHONE_MAX}
              placeholder="예: 010-1234-5678"
            />
            <Field
              id="account-email"
              label="담당자 이메일"
              type="email"
              value={email}
              onChange={setEmail}
              maxLength={ACCOUNT_EMAIL_MAX}
              placeholder="예: buyer@example.com"
            />
          </div>

          <Field
            id="account-biz-reg-no"
            label="사업자등록번호"
            value={bizRegNo}
            onChange={setBizRegNo}
            maxLength={ACCOUNT_PHONE_MAX}
            placeholder={BIZ_REG_NO_FORMAT}
            hint={`${BIZ_REG_NO_FORMAT} 형식으로 입력하시거나, 숫자 10자리만 입력하셔도 자동으로 정리됩니다.`}
          />

          <div className="space-y-1.5">
            <Label htmlFor="account-memo">메모</Label>
            <Textarea
              id="account-memo"
              value={memo}
              maxLength={ACCOUNT_MEMO_MAX}
              rows={4}
              placeholder="영업 이력·특이사항을 자유롭게 남겨주세요."
              onChange={(e) => setMemo(e.target.value)}
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
