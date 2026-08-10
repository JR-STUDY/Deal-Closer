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
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  OPPORTUNITY_MEMO_MAX,
  OPPORTUNITY_NAME_MAX,
  formatAmountInput,
  type OpportunityAccountOption,
  type OpportunityDTO,
  type OpportunityFormValues,
  type OpportunityOwnerOption,
} from "@/lib/opportunity";

type OpportunityFormDialogProps = {
  /** 값이 있으면 수정(PATCH), 없으면 생성(POST) */
  opportunityId?: string;
  initial: OpportunityFormValues;
  /** 현재 조직의 거래처 후보 */
  accounts: OpportunityAccountOption[];
  /** 현재 조직의 담당자 후보 */
  owners: OpportunityOwnerOption[];
  title: string;
  description?: string;
  /** 저장 성공 시 저장된 기회 전달 */
  onSaved: (opportunity: OpportunityDTO) => void;
  /** 다이얼로그가 닫힐 때 (성공·취소 공통) */
  onClose: () => void;
};

/**
 * 영업 기회 생성·수정 다이얼로그 (F-111).
 *
 * 거래처·기회명이 필수이고 금액·마감일·메모는 선택이다. 형식 검증은
 * 서버(`parseOpportunityInput`)가 단일 기준이며, 실패 메시지를 toast 로 보여준다.
 * 단계(stage)는 여기서 다루지 않는다 — 생성은 INITIAL 고정이고 변경은 Phase 3 범위다.
 *
 * 부모는 열고 싶을 때만 이 컴포넌트를 마운트한다. `key` 를 함께 주면 열 때마다
 * initial 로 새로 초기화된다 (파생 state 없이 리마운트로 해결).
 */
export function OpportunityFormDialog({
  opportunityId,
  initial,
  accounts,
  owners,
  title,
  description,
  onSaved,
  onClose,
}: OpportunityFormDialogProps) {
  const [accountId, setAccountId] = useState(() => initial.accountId);
  const [name, setName] = useState(() => initial.name);
  const [expectedAmount, setExpectedAmount] = useState(() =>
    formatAmountInput(initial.expectedAmount),
  );
  const [expectedCloseDate, setExpectedCloseDate] = useState(
    () => initial.expectedCloseDate,
  );
  const [ownerId, setOwnerId] = useState(() => initial.ownerId);
  const [memo, setMemo] = useState(() => initial.memo);
  const [isSaving, setIsSaving] = useState(false);

  const canSubmit = Boolean(accountId) && name.trim().length > 0 && !isSaving;

  const handleSubmit = async () => {
    setIsSaving(true);
    try {
      const res = await fetch(
        opportunityId
          ? `/api/opportunities/${opportunityId}`
          : "/api/opportunities",
        {
          method: opportunityId ? "PATCH" : "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            accountId,
            name,
            expectedAmount,
            expectedCloseDate,
            ownerId,
            memo,
          }),
        },
      );
      const json = await res.json().catch(() => null);
      if (!res.ok) {
        toast.error(json?.error ?? "저장에 실패했습니다.");
        return;
      }
      onSaved(json.data as OpportunityDTO);
      toast.success(
        opportunityId
          ? "영업 기회를 수정했습니다."
          : "영업 기회를 등록했습니다.",
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
          <div className="space-y-1.5">
            <Label htmlFor="opportunity-account">
              거래처
              <span className="text-destructive" aria-hidden="true">
                *
              </span>
            </Label>
            <Select value={accountId} onValueChange={setAccountId}>
              <SelectTrigger id="opportunity-account" className="w-full">
                <SelectValue placeholder="거래처를 선택해주세요" />
              </SelectTrigger>
              <SelectContent>
                {accounts.map((account) => (
                  <SelectItem key={account.id} value={account.id}>
                    {account.companyName}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="opportunity-name">
              기회명
              <span className="text-destructive" aria-hidden="true">
                *
              </span>
            </Label>
            <Input
              id="opportunity-name"
              value={name}
              required
              maxLength={OPPORTUNITY_NAME_MAX}
              placeholder="예: 2026 그룹웨어 도입"
              onChange={(e) => setName(e.target.value)}
            />
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label htmlFor="opportunity-amount">예상 금액</Label>
              <div className="relative">
                <span
                  className="pointer-events-none absolute top-1/2 left-3 -translate-y-1/2 text-sm text-muted-foreground"
                  aria-hidden="true"
                >
                  ₩
                </span>
                <Input
                  id="opportunity-amount"
                  className="pl-7"
                  inputMode="numeric"
                  value={expectedAmount}
                  placeholder="0"
                  aria-describedby="opportunity-amount-hint"
                  onChange={(e) =>
                    setExpectedAmount(formatAmountInput(e.target.value))
                  }
                />
              </div>
              <p
                id="opportunity-amount-hint"
                className="text-xs text-muted-foreground"
              >
                원(KRW) 단위로 입력해주세요.
              </p>
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="opportunity-close-date">예상 마감일</Label>
              <Input
                id="opportunity-close-date"
                type="date"
                value={expectedCloseDate}
                aria-describedby="opportunity-close-date-hint"
                onChange={(e) => setExpectedCloseDate(e.target.value)}
              />
              <p
                id="opportunity-close-date-hint"
                className="text-xs text-muted-foreground"
              >
                아직 정해지지 않았다면 비워두셔도 됩니다.
              </p>
            </div>
          </div>

          <div className="space-y-1.5">
            {/* 거래처 담당자 입력란과 헷갈리지 않게 "영업 담당자" 로 못박는다 (기회-14) */}
            <Label htmlFor="opportunity-owner">영업 담당자</Label>
            <Select value={ownerId} onValueChange={setOwnerId}>
              <SelectTrigger id="opportunity-owner" className="w-full">
                <SelectValue placeholder="영업 담당자를 선택해주세요" />
              </SelectTrigger>
              <SelectContent>
                {owners.map((owner) => (
                  <SelectItem key={owner.id} value={owner.id}>
                    {owner.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="opportunity-memo">메모</Label>
            <Textarea
              id="opportunity-memo"
              value={memo}
              maxLength={OPPORTUNITY_MEMO_MAX}
              rows={4}
              placeholder="상담 내용·경쟁사·결재 라인 등을 남겨주세요."
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
