"use client";

import { useState } from "react";
import { Plus, Pencil, Trash2, Users, User as UserIcon, Mail } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import type { EmailTemplateDTO, TemplateScope } from "@/lib/email-template";
import {
  TemplateFormDialog,
  type TemplateFormInitial,
} from "@/components/email-template/template-form-dialog";

/** 열려 있는 폼 상태 — null 이면 닫힘 */
type FormState =
  | { mode: "create" }
  | { mode: "edit"; template: EmailTemplateDTO };

/** 새 템플릿 기본값 — 실수로 팀 전체에 공유되지 않도록 개인(비공유)이 기본 */
const NEW_TEMPLATE_INITIAL: TemplateFormInitial = {
  name: "",
  subject: "",
  body: "",
  shared: false,
};

const SECTIONS: {
  scope: TemplateScope;
  label: string;
  hint: string;
  icon: typeof Users;
}[] = [
  {
    scope: "team",
    label: "팀 공용 템플릿",
    hint: "조직의 모든 팀원이 함께 사용·수정합니다.",
    icon: Users,
  },
  {
    scope: "personal",
    label: "개인 템플릿",
    hint: "나만 보고 사용하는 템플릿입니다.",
    icon: UserIcon,
  },
];

export function TemplatesManager({
  initialTemplates,
}: {
  initialTemplates: EmailTemplateDTO[];
}) {
  const [templates, setTemplates] = useState(initialTemplates);
  const [form, setForm] = useState<FormState | null>(null);
  const [pendingDelete, setPendingDelete] = useState<EmailTemplateDTO | null>(
    null,
  );
  const [isDeleting, setIsDeleting] = useState(false);

  /** 생성/수정 결과를 목록에 반영 (id 있으면 교체, 없으면 추가) */
  const handleSaved = (saved: EmailTemplateDTO) => {
    setTemplates((prev) =>
      prev.some((t) => t.id === saved.id)
        ? prev.map((t) => (t.id === saved.id ? saved : t))
        : [...prev, saved],
    );
  };

  const handleDelete = async () => {
    if (!pendingDelete) return;
    setIsDeleting(true);
    try {
      const res = await fetch(`/api/email-templates/${pendingDelete.id}`, {
        method: "DELETE",
      });
      if (!res.ok) {
        const json = await res.json().catch(() => null);
        toast.error(json?.error ?? "삭제에 실패했습니다.");
        return;
      }
      setTemplates((prev) => prev.filter((t) => t.id !== pendingDelete.id));
      toast.success("템플릿을 삭제했습니다.");
      setPendingDelete(null);
    } catch {
      toast.error("삭제에 실패했습니다.");
    } finally {
      setIsDeleting(false);
    }
  };

  return (
    <div className="space-y-8">
      <div className="flex justify-end">
        <Button onClick={() => setForm({ mode: "create" })}>
          <Plus className="size-4" />새 템플릿
        </Button>
      </div>

      {templates.length === 0 ? (
        <div className="flex flex-col items-center justify-center gap-3 rounded-lg border border-dashed py-16 text-center">
          <Mail className="size-10 text-muted-foreground" />
          <p className="text-sm text-muted-foreground">
            아직 저장된 메일 템플릿이 없습니다. 자주 쓰는 발송 문구를
            템플릿으로 저장해 두면 발송 화면에서 바로 불러올 수 있습니다.
          </p>
        </div>
      ) : (
        SECTIONS.map(({ scope, label, hint, icon: Icon }) => {
          const items = templates.filter((t) => t.scope === scope);
          return (
            <section key={scope} className="space-y-3">
              <div>
                <h2 className="flex items-center gap-2 text-sm font-semibold">
                  <Icon className="size-4 text-muted-foreground" />
                  {label}
                  <span className="text-xs font-normal text-muted-foreground">
                    ({items.length})
                  </span>
                </h2>
                <p className="mt-0.5 text-xs text-muted-foreground">{hint}</p>
              </div>

              {items.length === 0 ? (
                <p className="rounded-md border border-dashed p-4 text-center text-sm text-muted-foreground">
                  이 분류에 저장된 템플릿이 없습니다.
                </p>
              ) : (
                <div className="grid gap-3 sm:grid-cols-2">
                  {items.map((template) => (
                    <Card key={template.id}>
                      <CardHeader className="flex-row items-start justify-between gap-2">
                        <div className="min-w-0">
                          <p className="truncate font-medium">
                            {template.name}
                          </p>
                          <p className="mt-0.5 truncate text-xs text-muted-foreground">
                            {template.subject}
                          </p>
                        </div>
                        <Badge variant="outline" className="shrink-0">
                          {scope === "team" ? "공용" : "개인"}
                        </Badge>
                      </CardHeader>
                      <CardContent className="space-y-3">
                        <p className="line-clamp-3 whitespace-pre-line text-sm text-muted-foreground">
                          {template.body}
                        </p>
                        <div className="flex justify-end gap-2">
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() =>
                              setForm({ mode: "edit", template })
                            }
                          >
                            <Pencil className="size-3.5" />
                            수정
                          </Button>
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => setPendingDelete(template)}
                          >
                            <Trash2 className="size-3.5" />
                            삭제
                          </Button>
                        </div>
                      </CardContent>
                    </Card>
                  ))}
                </div>
              )}
            </section>
          );
        })
      )}

      {form ? (
        <TemplateFormDialog
          templateId={form.mode === "edit" ? form.template.id : undefined}
          title={form.mode === "edit" ? "템플릿 수정" : "새 메일 템플릿"}
          description="제목·본문에 변수를 넣으면 발송 시 현재 문서 값으로 치환됩니다."
          lockShared={form.mode === "edit" && form.template.scope === "team"}
          initial={
            form.mode === "edit"
              ? {
                  name: form.template.name,
                  subject: form.template.subject,
                  body: form.template.body,
                  shared: form.template.scope === "team",
                }
              : NEW_TEMPLATE_INITIAL
          }
          onSaved={handleSaved}
          onClose={() => setForm(null)}
        />
      ) : null}

      <AlertDialog
        open={pendingDelete !== null}
        onOpenChange={(open) => {
          if (!open) setPendingDelete(null);
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>템플릿을 삭제할까요?</AlertDialogTitle>
            <AlertDialogDescription>
              &ldquo;{pendingDelete?.name}&rdquo; 템플릿을 삭제합니다. 이 작업은
              되돌릴 수 없습니다.
              {pendingDelete?.scope === "team"
                ? " 이 템플릿은 팀 전체가 사용 중이며, 삭제하면 모든 팀원에게서 사라집니다."
                : ""}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={isDeleting}>취소</AlertDialogCancel>
            <AlertDialogAction
              onClick={(e) => {
                e.preventDefault();
                handleDelete();
              }}
              disabled={isDeleting}
            >
              {isDeleting ? "삭제 중…" : "삭제"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
