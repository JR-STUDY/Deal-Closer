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

/** 폼 초기값 (생성 시 빈 값, 현재 내용 저장 시 채워진 값) */
export type TemplateFormInitial = TemplateFormValues;

type TemplateFormDialogProps = {
  /** 수정 대상 id (없으면 새로 생성) */
  templateId?: string;
  initial: TemplateFormInitial;
  title: string;
  description?: string;
  /**
   * 공유 범위 스위치를 잠근다 (팀 공용 템플릿 수정 시).
   * 팀 공용을 개인으로 되돌리면 팀원이 접근을 잃으므로 서버에서도 막는다.
   */
  lockShared?: boolean;
  /** 저장 성공 시 저장된 템플릿 전달 */
  onSaved: (template: EmailTemplateDTO) => void;
  /** 다이얼로그가 닫힐 때 (성공/취소 공통) */
  onClose: () => void;
};

/**
 * 메일 템플릿 저장 다이얼로그 (발송 화면의 "현재 내용 저장" 등 작성 흐름 중 빠른 저장용).
 * 부모가 열고 싶을 때만 마운트하고 `key` 로 구분하면, 열 때마다 initial 로
 * 새로 초기화된다 (파생 state 문제 회피 — 지연 초기화 + 리마운트).
 */
export function TemplateFormDialog({
  templateId,
  initial,
  title,
  description,
  lockShared = false,
  onSaved,
  onClose,
}: TemplateFormDialogProps) {
  const [name, setName] = useState(() => initial.name);
  const [subject, setSubject] = useState(() => initial.subject);
  const [body, setBody] = useState(() => initial.body);
  const [shared, setShared] = useState(() => initial.shared);
  const [isSaving, setIsSaving] = useState(false);

  const handleSubmit = async () => {
    setIsSaving(true);
    const result = await submitTemplate(templateId, { name, subject, body, shared });
    setIsSaving(false);
    if ("error" in result) {
      toast.error(result.error);
      return;
    }
    onSaved(result.template);
    toast.success(templateId ? "템플릿을 수정했습니다." : "템플릿을 저장했습니다.");
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
          onNameChange={setName}
          onSubjectChange={setSubject}
          onBodyChange={setBody}
          onSharedChange={setShared}
          lockShared={lockShared}
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
