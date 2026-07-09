"use client";

import { useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  TEMPLATE_BODY_MAX,
  TEMPLATE_NAME_MAX,
  TEMPLATE_SUBJECT_MAX,
  TEMPLATE_VARIABLES,
  type EmailTemplateDTO,
} from "@/lib/email-template";

/** 폼 초기값 (생성 시 빈 값, 수정/현재내용 저장 시 채워진 값) */
export type TemplateFormInitial = {
  name: string;
  subject: string;
  body: string;
  shared: boolean;
};

type TemplateFormDialogProps = {
  /** 수정 대상 id (없으면 새로 생성) */
  templateId?: string;
  initial: TemplateFormInitial;
  title: string;
  description?: string;
  /** 저장 성공 시 저장된 템플릿 전달 */
  onSaved: (template: EmailTemplateDTO) => void;
  /** 다이얼로그가 닫힐 때 (성공/취소 공통) */
  onClose: () => void;
};

/**
 * 메일 템플릿 생성·수정 공용 다이얼로그.
 * 부모가 열고 싶을 때만 마운트하고 `key` 로 구분하면, 열 때마다 initial 로
 * 새로 초기화된다 (파생 state 문제 회피 — 지연 초기화 + 리마운트).
 */
export function TemplateFormDialog({
  templateId,
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
  const [isSaving, setIsSaving] = useState(false);

  const handleSubmit = async () => {
    setIsSaving(true);
    try {
      const res = await fetch(
        templateId ? `/api/email-templates/${templateId}` : "/api/email-templates",
        {
          method: templateId ? "PATCH" : "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ name, subject, body, shared }),
        },
      );
      const json = await res.json();
      if (!res.ok) {
        toast.error(json?.error ?? "저장에 실패했습니다.");
        return;
      }
      onSaved(json.data as EmailTemplateDTO);
      toast.success(templateId ? "템플릿을 수정했습니다." : "템플릿을 저장했습니다.");
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

        <div className="space-y-4">
          <div className="space-y-1.5">
            <Label htmlFor="template-name">템플릿 이름</Label>
            <Input
              id="template-name"
              value={name}
              maxLength={TEMPLATE_NAME_MAX}
              placeholder="예: 견적서 안내 (표준)"
              onChange={(e) => setName(e.target.value)}
            />
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="template-subject">메일 제목</Label>
            <Input
              id="template-subject"
              value={subject}
              maxLength={TEMPLATE_SUBJECT_MAX}
              placeholder="[{{문서종류}}] {{거래처}}님께 드리는 {{문서제목}}"
              onChange={(e) => setSubject(e.target.value)}
            />
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="template-body">메일 본문</Label>
            <Textarea
              id="template-body"
              value={body}
              maxLength={TEMPLATE_BODY_MAX}
              className="min-h-40"
              placeholder="안녕하세요, {{거래처}} 담당자님. …"
              onChange={(e) => setBody(e.target.value)}
            />
            <p className="text-xs text-muted-foreground">
              변수를 넣으면 발송 시 현재 문서 값으로 자동 치환됩니다:{" "}
              {TEMPLATE_VARIABLES.map((v, i) => (
                <span key={v.token}>
                  {i > 0 ? " · " : ""}
                  <code className="rounded bg-muted px-1 py-0.5 text-foreground">
                    {`{{${v.token}}}`}
                  </code>
                </span>
              ))}
            </p>
          </div>

          <div className="flex items-center justify-between rounded-lg border p-3">
            <div className="space-y-0.5 pr-4">
              <Label htmlFor="template-shared" className="font-medium">
                팀 공용으로 공유
              </Label>
              <p className="text-xs text-muted-foreground">
                켜면 조직의 모든 팀원이 사용·수정할 수 있습니다. 끄면 나만 보는
                개인 템플릿입니다.
              </p>
            </div>
            <Switch
              id="template-shared"
              checked={shared}
              onCheckedChange={setShared}
            />
          </div>
        </div>

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
