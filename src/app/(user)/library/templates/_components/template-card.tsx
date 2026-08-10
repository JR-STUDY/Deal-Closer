"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Loader2, MoreVertical, RefreshCw, Sparkles, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
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
import { DocTypeBadge } from "@/components/status-badge";
import { formatDateTime } from "@/lib/format";
import { TEMPLATE_SCOPE_LABELS, type TemplateScope } from "@/lib/constants";

export type TemplateCardData = {
  id: string;
  name: string;
  type: string;
  scope: string;
  description: string | null;
  sourceFileName: string | null;
  updatedAt: string;
  documentCount: number;
  variables: {
    id: string;
    key: string;
    label: string;
    sample: string | null;
    required: boolean;
  }[];
};

/** 표준 양식 카드 — 변수 필드(F-204) 확인 · 변수 재추출 · 삭제 · 이 양식으로 문서 만들기 */
export function TemplateCard({ template }: { template: TemplateCardData }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);

  const reextract = async () => {
    if (busy) return;
    setBusy(true);
    try {
      const res = await fetch(`/api/templates/${template.id}/variables`, {
        method: "POST",
      });
      const json = await res.json().catch(() => null);
      if (!res.ok) {
        toast.error(json?.error ?? "변수 재추출에 실패했습니다.");
        return;
      }
      const count: number = json?.data?.template?.variables?.length ?? 0;
      toast.success(`변수 ${count}개를 다시 추출했습니다.`);
      router.refresh();
    } catch {
      toast.error("네트워크 오류로 변수 재추출에 실패했습니다.");
    } finally {
      setBusy(false);
    }
  };

  const remove = async () => {
    setBusy(true);
    try {
      const res = await fetch(`/api/templates/${template.id}`, { method: "DELETE" });
      if (!res.ok) throw new Error("failed");
      toast.success("양식을 삭제했습니다.");
      router.refresh();
    } catch {
      toast.error("양식 삭제에 실패했습니다.");
    } finally {
      setBusy(false);
      setConfirmDelete(false);
    }
  };

  return (
    <>
      <Card className="flex flex-col">
        <CardHeader className="gap-2">
          <div className="flex items-start gap-2">
            <CardTitle className="min-w-0 flex-1 truncate text-base" title={template.name}>
              {template.name}
            </CardTitle>
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button
                  variant="ghost"
                  size="icon"
                  className="size-8 shrink-0"
                  aria-label={`${template.name} 메뉴`}
                  disabled={busy}
                >
                  {busy ? (
                    <Loader2 className="size-4 animate-spin" />
                  ) : (
                    <MoreVertical className="size-4" />
                  )}
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                <DropdownMenuItem onClick={reextract}>
                  <RefreshCw className="size-4" />
                  변수 다시 추출
                </DropdownMenuItem>
                <DropdownMenuItem
                  variant="destructive"
                  onClick={() => setConfirmDelete(true)}
                >
                  <Trash2 className="size-4" />
                  양식 삭제
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
          <div className="flex flex-wrap items-center gap-1.5">
            <DocTypeBadge type={template.type} />
            <Badge variant="outline">
              {TEMPLATE_SCOPE_LABELS[template.scope as TemplateScope] ?? template.scope}
            </Badge>
            <Badge variant="secondary">변수 {template.variables.length}개</Badge>
            {template.documentCount > 0 ? (
              <Badge variant="ghost">문서 {template.documentCount}건</Badge>
            ) : null}
          </div>
        </CardHeader>

        <CardContent className="flex flex-1 flex-col gap-3">
          {template.description ? (
            <p className="text-sm text-muted-foreground">{template.description}</p>
          ) : null}

          {template.variables.length > 0 ? (
            <ul className="flex flex-wrap gap-1.5">
              {template.variables.map((v) => (
                <li
                  key={v.id}
                  className="rounded border bg-muted/40 px-2 py-0.5 text-xs"
                  title={v.sample ? `예: ${v.sample}` : undefined}
                >
                  {v.label}
                  {v.required ? <span className="text-destructive"> *</span> : null}
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-xs text-muted-foreground">
              추출된 변수가 없습니다. 메뉴에서 ‘변수 다시 추출’을 실행해보세요.
            </p>
          )}

          <p className="text-xs text-muted-foreground">
            {template.sourceFileName ? `원본: ${template.sourceFileName} · ` : ""}
            {formatDateTime(template.updatedAt)}
          </p>

          <div className="mt-auto">
            <Button asChild variant="outline" className="w-full">
              <Link href={`/generator?template=${template.id}`}>
                <Sparkles className="size-4" />이 양식으로 문서 만들기
              </Link>
            </Button>
          </div>
        </CardContent>
      </Card>

      <AlertDialog open={confirmDelete} onOpenChange={setConfirmDelete}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>양식을 삭제할까요?</AlertDialogTitle>
            <AlertDialogDescription>
              ‘{template.name}’ 양식과 변수 정의가 삭제됩니다. 이 양식으로 이미 만든
              문서는 그대로 남습니다.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>취소</AlertDialogCancel>
            <AlertDialogAction onClick={remove}>삭제</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
