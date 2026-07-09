"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ArrowLeft, Pencil, Trash2, Users, User as UserIcon } from "lucide-react";
import { toast } from "sonner";
import { PageHeader } from "@/components/page-header";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
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
import type { EmailTemplateDTO } from "@/lib/email-template";
import { TemplateEditor } from "./template-editor";

const LIST_HREF = "/settings/templates";

/** 메일 템플릿 상세 (전체 화면) — 조회 + 인라인 수정 + 삭제. */
export function TemplateDetail({ template: initial }: { template: EmailTemplateDTO }) {
  const router = useRouter();
  const [template, setTemplate] = useState(initial);
  const [isEditing, setIsEditing] = useState(false);
  const [pendingDelete, setPendingDelete] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);

  const isTeam = template.scope === "team";

  const handleDelete = async () => {
    setIsDeleting(true);
    try {
      const res = await fetch(`/api/email-templates/${template.id}`, {
        method: "DELETE",
      });
      if (!res.ok) {
        const json = await res.json().catch(() => null);
        toast.error(json?.error ?? "삭제에 실패했습니다.");
        return;
      }
      toast.success("템플릿을 삭제했습니다.");
      router.push(LIST_HREF);
      router.refresh();
    } catch {
      toast.error("삭제에 실패했습니다.");
    } finally {
      setIsDeleting(false);
    }
  };

  if (isEditing) {
    return (
      <>
        <PageHeader
          title="템플릿 수정"
          description={`"${template.name}" 템플릿을 수정합니다.`}
        />
        <div className="flex-1 overflow-auto p-8">
          <div className="mx-auto max-w-3xl">
            <TemplateEditor
              templateId={template.id}
              initial={{
                name: template.name,
                subject: template.subject,
                body: template.body,
                shared: isTeam,
              }}
              lockShared={isTeam}
              onSaved={(saved) => {
                setTemplate(saved);
                setIsEditing(false);
                router.refresh();
              }}
              onCancel={() => setIsEditing(false)}
            />
          </div>
        </div>
      </>
    );
  }

  return (
    <>
      <PageHeader
        title={template.name}
        description="메일 템플릿 상세"
        actions={
          <>
            <Button variant="outline" onClick={() => setIsEditing(true)}>
              <Pencil className="size-4" />
              수정
            </Button>
            <Button variant="outline" onClick={() => setPendingDelete(true)}>
              <Trash2 className="size-4" />
              삭제
            </Button>
          </>
        }
      />

      <div className="flex-1 overflow-auto p-8">
        <div className="mx-auto max-w-3xl space-y-6">
          <Link
            href={LIST_HREF}
            className="inline-flex items-center gap-1.5 text-sm text-muted-foreground transition-colors hover:text-foreground"
          >
            <ArrowLeft className="size-4" />
            메일 템플릿 목록으로
          </Link>

          <Badge variant="outline" className="gap-1.5">
            {isTeam ? (
              <>
                <Users className="size-3.5" />팀 공용
              </>
            ) : (
              <>
                <UserIcon className="size-3.5" />개인
              </>
            )}
          </Badge>

          <Card>
            <CardHeader>
              <CardTitle className="text-base">메일 제목</CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-sm">{template.subject}</p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="text-base">메일 본문</CardTitle>
            </CardHeader>
            <CardContent>
              <p className="whitespace-pre-line text-sm leading-relaxed">
                {template.body}
              </p>
            </CardContent>
          </Card>

          <p className="text-xs text-muted-foreground">
            제목·본문의{" "}
            <code className="rounded bg-muted px-1 py-0.5">{`{{변수}}`}</code>{" "}
            는 발송 화면에서 이 템플릿을 불러올 때 현재 문서 값(거래처·문서제목·문서종류·총액)으로
            자동 치환됩니다.
          </p>
        </div>
      </div>

      <AlertDialog
        open={pendingDelete}
        onOpenChange={(open) => {
          if (!open) setPendingDelete(false);
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>템플릿을 삭제할까요?</AlertDialogTitle>
            <AlertDialogDescription>
              &ldquo;{template.name}&rdquo; 템플릿을 삭제합니다. 이 작업은 되돌릴
              수 없습니다.
              {isTeam
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
    </>
  );
}
