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
import { LinkableDocumentPicker } from "@/components/document/linkable-document-picker";
import {
  OPPORTUNITY_MEMO_MAX,
  OPPORTUNITY_NAME_MAX,
  type OpportunityAccountOption,
  type OpportunityDTO,
  type OpportunityFormValues,
  type OpportunityOwnerOption,
} from "@/lib/opportunity";
import { AccountCombobox } from "./account-combobox";

type OpportunityFormDialogProps = {
  /** 값이 있으면 수정(PATCH), 없으면 생성(POST) */
  opportunityId?: string;
  initial: OpportunityFormValues;
  /** 미리 선택된 거래처의 회사명 (자동완성 입력에 그대로 채운다) */
  initialAccountName?: string;
  /** 현재 조직의 영업 담당자 후보 */
  owners: OpportunityOwnerOption[];
  title: string;
  description?: string;
  /** 저장 성공 시 저장된 기회 전달 */
  onSaved: (opportunity: OpportunityDTO) => void;
  /** 다이얼로그가 닫힐 때 (성공·취소 공통) */
  onClose: () => void;
};

/**
 * 영업 기회 생성·수정 다이얼로그 (F-111 · 기회-16 · 기회-17).
 *
 * 거래처·기회명이 필수이고 마감일·메모는 선택이다. 형식 검증은 서버
 * (`parseOpportunityInput`)가 단일 기준이며, 실패 메시지를 toast 로 보여준다.
 *
 * **예상 금액 입력은 없다** (기회-6). 확정 문서에서 파생되는 값이라 폼에서 손대면 두 출처가
 * 싸운다. 대신 등록할 때 **보관함 문서를 골라 바로 연결**할 수 있고(기회-17), 그 문서가
 * 곧바로 확정 문서 판정 대상이 되어 금액이 정해진다.
 *
 * 거래처는 셀렉트가 아니라 **자동완성**이다 (기회-16) — 목록에서 찾고, 없으면 그 자리에서 만든다.
 * 단계(stage)는 여기서 다루지 않는다 — 생성은 INITIAL 고정이고 전이는 스테퍼·칸반이 맡는다.
 *
 * 부모는 열고 싶을 때만 이 컴포넌트를 마운트한다. `key` 를 함께 주면 열 때마다
 * initial 로 새로 초기화된다 (파생 state 없이 리마운트로 해결).
 */
export function OpportunityFormDialog({
  opportunityId,
  initial,
  initialAccountName,
  owners,
  title,
  description,
  onSaved,
  onClose,
}: OpportunityFormDialogProps) {
  const isCreating = !opportunityId;
  const [account, setAccount] = useState<OpportunityAccountOption | null>(() =>
    initial.accountId
      ? { id: initial.accountId, companyName: initialAccountName ?? "" }
      : null,
  );
  const [name, setName] = useState(() => initial.name);
  const [expectedCloseDate, setExpectedCloseDate] = useState(
    () => initial.expectedCloseDate,
  );
  const [ownerId, setOwnerId] = useState(() => initial.ownerId);
  const [memo, setMemo] = useState(() => initial.memo);
  const [documentIds, setDocumentIds] = useState<string[]>([]);
  const [isSaving, setIsSaving] = useState(false);

  const canSubmit = Boolean(account) && name.trim().length > 0 && !isSaving;

  const handleSubmit = async () => {
    if (!account) return;
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
            accountId: account.id,
            name,
            expectedCloseDate,
            ownerId,
            memo,
            // 연결은 등록과 한 트랜잭션으로 처리된다 — 수정에서는 상세의 연관 문서에서 다룬다.
            ...(isCreating ? { documentIds } : {}),
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
          : documentIds.length > 0
            ? `영업 기회를 등록하고 문서 ${documentIds.length}건을 연결했습니다.`
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
            {/* 목록에서 찾고, 없으면 그 자리에서 만든다 (기회-16) */}
            <AccountCombobox
              id="opportunity-account"
              value={account}
              onChange={setAccount}
              disabled={isSaving}
              aria-describedby="opportunity-account-hint"
            />
            <p
              id="opportunity-account-hint"
              className="text-xs text-muted-foreground"
            >
              등록되지 않은 회사라면 입력하신 이름으로 바로 등록하실 수 있습니다.
            </p>
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
          </div>

          {/*
            등록 시점에 보관함 문서를 골라 바로 연결한다 (기회-17).
            수정에서는 감춘다 — 이미 만들어진 기회의 문서는 상세의 "연관 문서" 에서 다뤄야
            연결·해제·확정 지정이 한자리에 모인다.
          */}
          {isCreating ? (
            <div className="space-y-1.5">
              <Label>연결할 문서</Label>
              <LinkableDocumentPicker
                selectedIds={documentIds}
                onChange={setDocumentIds}
                disabled={isSaving}
              />
              <p className="text-xs text-muted-foreground">
                예상 금액은 연결하신 문서에서 자동으로 정해집니다. 지금 고르지
                않으셔도 나중에 기회 상세에서 연결하실 수 있습니다.
              </p>
            </div>
          ) : null}

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
