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
  ACCOUNT_BIZ_REG_NO_MAX,
  ACCOUNT_COMPANY_NAME_MAX,
  ACCOUNT_MEMO_MAX,
  BIZ_REG_NO_FORMAT,
  type AccountDTO,
  type AccountFormValues,
} from "@/lib/account";
import { isBlankContactForm, parseContactInputs } from "@/lib/contact";
import { ContactDraftFields, type ContactDraft } from "./contact-draft-fields";

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
 * 회사명만 필수이고 나머지는 선택이다. 형식 검증(사업자등록번호·담당자 연락처·이메일)은
 * `@/lib/account` · `@/lib/contact` 의 순수 함수가 단일 기준이며, 서버도 같은 함수를 쓴다.
 * 실패 메시지는 toast 로 보여준다.
 *
 * **담당자는 등록할 때만 여기서 받는다** (거래처-8 · 2차 피드백 8번). 저장 전에는 담당자를
 * 붙일 자리가 없어 등록 직후 상세로 들어가 다시 넣는 왕복이 생기기 때문이다.
 * **수정에서는 담당자를 다루지 않는다** — 거래처 상세에 이미 담당자 관리 카드가 있고,
 * 거기서 추가·수정·삭제·대표 지정이 각각 한 번의 요청으로 즉시 반영된다. 수정 팝업에 같은
 * 묶음을 또 두면 ① 편집 경로가 둘로 갈리고 ② 팝업의 "취소" 가 담당자 변경까지 되돌리는지
 * 모호해지며 ③ 대표 교체·삭제까지 팝업 안에서 트랜잭션을 다시 설계해야 한다.
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
  const isCreating = !accountId;
  const [companyName, setCompanyName] = useState(() => initial.companyName);
  const [bizRegNo, setBizRegNo] = useState(() => initial.bizRegNo);
  const [memo, setMemo] = useState(() => initial.memo);
  // 담당자 0명으로 시작한다 — 담당자 없는 거래처도 정상이다 (거래처-8)
  const [contacts, setContacts] = useState<ContactDraft[]>([]);
  const [isSaving, setIsSaving] = useState(false);

  const canSubmit = companyName.trim().length > 0 && !isSaving;

  const handleSubmit = async () => {
    // "추가"만 눌러 두고 채우지 않은 줄은 없는 것으로 본다
    const drafts = contacts.filter((row) => !isBlankContactForm(row));
    // 폼도 서버와 **같은 순수 함수**로 검증한다 — 여기서만 막으면 API 로는 그대로 들어간다
    const parsedContacts = parseContactInputs(
      drafts.map((row) => ({
        name: row.name,
        position: row.position,
        phone: row.phone,
        email: row.email,
        isPrimary: row.isPrimary,
      })),
    );
    if ("error" in parsedContacts) {
      toast.error(parsedContacts.error);
      return;
    }

    setIsSaving(true);
    try {
      const res = await fetch(
        accountId ? `/api/accounts/${accountId}` : "/api/accounts",
        {
          method: accountId ? "PATCH" : "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            companyName,
            bizRegNo,
            memo,
            // 담당자는 거래처 생성과 한 트랜잭션이다 (수정은 상세의 담당자 카드에서 다룬다)
            ...(isCreating ? { contacts: parsedContacts } : {}),
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
        accountId
          ? "거래처를 수정했습니다."
          : parsedContacts.length > 0
            ? `거래처와 담당자 ${parsedContacts.length}명을 등록했습니다.`
            : "거래처를 등록했습니다.",
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
      {/*
        높이는 내용에 맞추고 **화면을 넘길 때에만** 스크롤한다 (2차 피드백 1번).
        스크롤은 본문(form)만 진다 — 다이얼로그 전체에 overflow 를 걸면 제목·저장 버튼·
        닫기(×)까지 함께 밀려 올라가 어디서 저장하는지 알 수 없어진다.
      */}
      <DialogContent className="flex max-h-[90svh] flex-col gap-4 overflow-hidden sm:max-w-xl">
        <DialogHeader className="shrink-0">
          <DialogTitle>{title}</DialogTitle>
          {description ? (
            <DialogDescription>{description}</DialogDescription>
          ) : null}
        </DialogHeader>

        {/* -mx-4 px-4 : 스크롤바는 팝업 가장자리에 두고 입력의 포커스 링은 잘리지 않게 한다 */}
        <form
          className="-mx-4 min-h-0 flex-1 space-y-4 overflow-y-auto px-4"
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

          <Field
            id="account-biz-reg-no"
            label="사업자등록번호"
            value={bizRegNo}
            onChange={setBizRegNo}
            maxLength={ACCOUNT_BIZ_REG_NO_MAX}
            placeholder={BIZ_REG_NO_FORMAT}
            hint={`${BIZ_REG_NO_FORMAT} 형식으로 입력하시거나, 숫자 10자리만 입력하셔도 자동으로 정리됩니다.`}
          />

          {/*
            담당자는 **등록할 때만** 받는다 (거래처-8 · 2차 피드백 8번).
            수정에서는 감춘다 — 상세의 담당자 카드가 추가·수정·삭제·대표 지정을 모두 맡는다.
            메모(자유 서술)보다 위에 둔다 — 회사 정보 다음으로 자주 채우는 값이다.
          */}
          {isCreating ? (
            <div className="space-y-1.5">
              <Label>담당자</Label>
              <ContactDraftFields
                rows={contacts}
                onChange={setContacts}
                disabled={isSaving}
              />
              <p className="text-xs text-muted-foreground">
                담당자 없이 등록하셔도 됩니다. 대표를 고르지 않으시면 첫 번째
                담당자가 대표가 되며, 목록에는 대표 담당자 한 분만 표시됩니다.
              </p>
            </div>
          ) : null}

          <div className="space-y-1.5">
            <Label htmlFor="account-memo">메모</Label>
            <Textarea
              id="account-memo"
              value={memo}
              maxLength={ACCOUNT_MEMO_MAX}
              rows={4}
              onChange={(e) => setMemo(e.target.value)}
            />
          </div>
        </form>

        <DialogFooter className="shrink-0">
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
