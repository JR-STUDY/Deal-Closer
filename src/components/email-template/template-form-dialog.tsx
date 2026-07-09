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
import type { EmailTemplateDTO, TemplateFormValues } from "@/lib/email-template";
import { TemplateFields } from "./template-fields";
import { submitTemplate } from "./submit-template";

/** 폼 초기값 (빈 값 또는 현재 작성 내용) */
export type TemplateFormInitial = TemplateFormValues;

type TemplateFormDialogProps = {
  initial: TemplateFormInitial;
  title: string;
  description?: string;
  /** 저장 성공 시 저장된 템플릿 전달 */
  onSaved: (template: EmailTemplateDTO) => void;
  /** 다이얼로그가 닫힐 때 (성공/취소 공통) */
  onClose: () => void;
};

/**
 * 메일 템플릿 "빠른 저장" 다이얼로그 — 발송 화면의 "현재 내용 저장" 전용(신규 생성).
 * 조회·수정은 전체 화면 상세(/settings/templates/[id])에서 처리한다.
 * 부모가 열고 싶을 때만 마운트하고 `key` 로 구분하면, 열 때마다 initial 로
 * 새로 초기화된다 (파생 state 문제 회피 — 지연 초기화 + 리마운트).
 */
export function TemplateFormDialog({
  initial,
  title,
  description,
  onSaved,
  onClose,
}: TemplateFormDialogProps) {
  const [name, setName] = useState(() => initial.name);
  const [subject, setSubject] = useState(() => initial.subject);
  const [body, setBody] = useState(() => initial.body);
  const [shared, setShared] = useState(() => initial.shared);
  const [recipientName, setRecipientName] = useState(
    () => initial.recipientName,
  );
  const [isSaving, setIsSaving] = useState(false);

  const handleSubmit = async () => {
    setIsSaving(true);
    const result = await submitTemplate(undefined, {
      name,
      subject,
      body,
      shared,
      recipientName,
    });
    setIsSaving(false);
    if ("error" in result) {
      toast.error(result.error);
      return;
    }
    onSaved(result.template);
    toast.success("템플릿을 저장했습니다.");
    onClose();
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

        <TemplateFields
          name={name}
          subject={subject}
          body={body}
          shared={shared}
          recipientName={recipientName}
          onNameChange={setName}
          onSubjectChange={setSubject}
          onBodyChange={setBody}
          onSharedChange={setShared}
          onRecipientNameChange={setRecipientName}
        />

        <DialogFooter>
          <Button variant="outline" onClick={onClose} disabled={isSaving}>
            취소
          </Button>
          <Button onClick={handleSubmit} disabled={isSaving}>
            {isSaving ? "저장 중…" : "저장"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
