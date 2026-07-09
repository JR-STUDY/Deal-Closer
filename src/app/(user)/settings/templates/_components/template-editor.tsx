"use client";

import { useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import type {
  EmailTemplateDTO,
  TemplateFormValues,
} from "@/lib/email-template";
import { TemplateFields } from "@/components/email-template/template-fields";
import { submitTemplate } from "@/components/email-template/submit-template";

type TemplateEditorProps = {
  /** 수정 대상 id (없으면 새로 생성) */
  templateId?: string;
  initial: TemplateFormValues;
  /** 팀 공용 템플릿 수정 시 공유 스위치 잠금 */
  lockShared?: boolean;
  onSaved: (template: EmailTemplateDTO) => void;
  onCancel: () => void;
};

/** 전체 화면 메일 템플릿 편집 폼 (생성·수정 공용). */
export function TemplateEditor({
  templateId,
  initial,
  lockShared = false,
  onSaved,
  onCancel,
}: TemplateEditorProps) {
  const [name, setName] = useState(() => initial.name);
  const [subject, setSubject] = useState(() => initial.subject);
  const [body, setBody] = useState(() => initial.body);
  const [shared, setShared] = useState(() => initial.shared);
  const [recipientName, setRecipientName] = useState(() => initial.recipientName);
  const [isSaving, setIsSaving] = useState(false);

  const handleSave = async () => {
    setIsSaving(true);
    const result = await submitTemplate(templateId, {
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
    toast.success(templateId ? "템플릿을 수정했습니다." : "템플릿을 저장했습니다.");
    onSaved(result.template);
  };

  return (
    <Card>
      <CardContent className="space-y-6">
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
          lockShared={lockShared}
          bodyClassName="min-h-64"
        />

        <div className="flex justify-end gap-2">
          <Button variant="outline" onClick={onCancel} disabled={isSaving}>
            취소
          </Button>
          <Button onClick={handleSave} disabled={isSaving}>
            {isSaving ? "저장 중…" : "저장"}
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
