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
import {
  EMPTY_CONTACT_FORM,
  isBlankContactForm,
  parseContactAdditions,
  withAppendPrimary,
  type ContactDTO,
} from "@/lib/contact";
import {
  ContactDraftFields,
  type ContactDraft,
} from "../../_components/contact-draft-fields";

/**
 * 거래처 상세의 담당자 **다중 추가** 다이얼로그 (4차 피드백 2).
 *
 * 거래처 등록 팝업과 **같은 입력 묶음**(`ContactDraftFields`)을 쓴다 — 한 번에 한 명만 받던
 * 예전 폼은 세 명을 넣으려면 팝업을 세 번 열어야 했고, 같은 일을 하는 두 화면이 다르게
 * 생기면 사용자가 매번 다시 배운다.
 *
 * 대표 규칙은 화면이 판단하지 않는다 — 라디오의 초기 상태는 `withAppendPrimary`,
 * 저장 시 확정은 서버의 `resolveAppendIsPrimary` 이며 둘 다 `@/lib/contact` 의 같은 규칙을
 * 쓴다. 이미 대표가 있는 거래처에서는 **아무도 미리 켜지 않는다** — 담당자를 덧붙였을
 * 뿐인데 목록에 나오는 이름이 바뀌면 안 된다. 새로 대표를 고르면 기존 대표 해제까지
 * **한 트랜잭션**으로 처리된다.
 *
 * 여러 명은 한 번의 요청으로 보낸다. 한 명씩 나눠 보내면 중간에 실패했을 때 몇 명이
 * 들어갔는지 알 수 없는데 화면은 "등록했습니다" 로 끝난다.
 */
export function ContactAddDialog({
  accountId,
  companyName,
  existingContactCount,
  onSaved,
  onClose,
}: {
  accountId: string;
  companyName: string;
  /** 이 거래처에 이미 있는 담당자 수 (대표 초기값·안내 문구가 이 값에 달려 있다) */
  existingContactCount: number;
  onSaved: () => void;
  onClose: () => void;
}) {
  // 이 팝업을 연 사람은 최소 한 명을 넣으려는 것이므로 빈 줄 하나로 시작한다
  // (거래처 등록 팝업은 담당자 0명도 정상이라 빈 상태로 시작한다).
  const [rows, setRows] = useState<ContactDraft[]>(() =>
    withAppendPrimary(existingContactCount, [
      { ...EMPTY_CONTACT_FORM, key: "row-0" },
    ]),
  );
  const [isSaving, setIsSaving] = useState(false);

  const canSubmit = rows.some((row) => row.name.trim()) && !isSaving;

  const handleSubmit = async () => {
    // "추가"만 눌러 두고 채우지 않은 줄은 없는 것으로 본다
    const drafts = rows.filter((row) => !isBlankContactForm(row));
    // 폼도 서버와 **같은 순수 함수**로 검증한다 — 여기서만 막으면 API 로는 그대로 들어간다
    const parsed = parseContactAdditions(
      drafts.map((row) => ({
        name: row.name,
        position: row.position,
        phone: row.phone,
        email: row.email,
        isPrimary: row.isPrimary,
      })),
    );
    if ("error" in parsed) {
      toast.error(parsed.error);
      return;
    }
    if (parsed.length === 0) {
      toast.error("담당자명을 입력해주세요.");
      return;
    }

    setIsSaving(true);
    try {
      const res = await fetch(`/api/accounts/${accountId}/contacts`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ contacts: parsed }),
      });
      const json = await res.json().catch(() => null);
      if (!res.ok) {
        toast.error(json?.error ?? "저장에 실패했습니다.");
        return;
      }

      // 대표가 새로 정해졌는지는 응답이 알려준다 — 목록에 나오는 이름이 바뀌므로 조용히 넘기지 않는다
      const created = (json?.data ?? []) as ContactDTO[];
      const nextPrimary = created.find((contact) => contact.isPrimary);
      const added =
        created.length > 1
          ? `담당자 ${created.length}명을 등록했습니다.`
          : `${created[0]?.name ?? "담당자"} 님을 등록했습니다.`;
      toast.success(
        nextPrimary
          ? `${added} ${nextPrimary.name} 님이 대표 담당자입니다.`
          : added,
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
      {/*
        스크롤은 본문(form)만 진다 — 다이얼로그 전체에 overflow 를 걸면 제목·저장 버튼·
        닫기(×)까지 함께 밀려 올라가 어디서 저장하는지 알 수 없어진다 (2차 피드백 1번).
      */}
      <DialogContent className="flex max-h-[90svh] flex-col gap-4 overflow-hidden sm:max-w-xl">
        <DialogHeader className="shrink-0">
          <DialogTitle>담당자 추가</DialogTitle>
          <DialogDescription>
            {`"${companyName}" 에 담당자를 추가합니다. 여러 명을 한 번에 등록하실 수 있습니다.`}
          </DialogDescription>
        </DialogHeader>

        {/* -mx-4 px-4 : 스크롤바는 팝업 가장자리에 두고 입력의 포커스 링은 잘리지 않게 한다 */}
        <form
          className="-mx-4 min-h-0 flex-1 space-y-2 overflow-y-auto px-4"
          onSubmit={(e) => {
            e.preventDefault();
            if (canSubmit) handleSubmit();
          }}
        >
          <ContactDraftFields
            rows={rows}
            onChange={setRows}
            disabled={isSaving}
            existingContactCount={existingContactCount}
          />
          <p className="text-xs text-muted-foreground">
            {existingContactCount === 0
              ? "첫 담당자가 자동으로 대표가 되며, 거래처 목록에는 대표 담당자 한 분만 표시됩니다."
              : "대표를 고르지 않으시면 현재 대표 담당자가 그대로 유지됩니다. 새로 고르시면 기존 대표는 자동으로 해제됩니다."}
          </p>
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
