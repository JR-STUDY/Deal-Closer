"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import {
  DOCUMENT_STATUSES,
  DOCUMENT_STATUS_LABELS,
  type DocumentStatus,
} from "@/lib/constants";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
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

/** 상태 배지 색상과 맞춘 상태별 점 색상 */
const STATUS_DOT: Record<DocumentStatus, string> = {
  DRAFT: "bg-amber-500",
  SENT: "bg-blue-500",
  COMPLETED: "bg-emerald-500",
  VOID: "bg-slate-400",
};

type DocumentStatusControlProps = {
  documentId: string;
  status: string;
};

/**
 * 편집 화면 헤더의 상태 전환 드롭다운.
 * 초안↔발송완료↔계약완료↔폐기 를 수동 전환하며, 변경 전 확인 얼럿을 띄운다.
 */
export function DocumentStatusControl({
  documentId,
  status,
}: DocumentStatusControlProps) {
  const router = useRouter();
  const [current, setCurrent] = useState(status);
  const [pending, setPending] = useState<string | null>(null);
  const [isSaving, startSaving] = useTransition();

  // 셀렉트에서 새 값을 고르면 즉시 반영하지 않고 확인 얼럿을 연다.
  const requestChange = (next: string) => {
    if (next !== current) setPending(next);
  };

  const confirmChange = () => {
    if (!pending) return;
    const next = pending;

    startSaving(async () => {
      try {
        const res = await fetch(`/api/documents/${documentId}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ status: next }),
        });
        if (!res.ok) throw new Error();

        setCurrent(next);
        setPending(null);
        const label = DOCUMENT_STATUS_LABELS[next as DocumentStatus] ?? next;
        toast.success(`상태를 "${label}"(으)로 변경했습니다.`);
        router.refresh();
      } catch {
        setPending(null);
        toast.error("상태 변경에 실패했습니다.");
      }
    });
  };

  const cur = current as DocumentStatus;
  const curLabel = DOCUMENT_STATUS_LABELS[cur] ?? current;
  const nextLabel = pending
    ? (DOCUMENT_STATUS_LABELS[pending as DocumentStatus] ?? pending)
    : "";

  return (
    <>
      {/* 셀렉트 값은 current 에 고정 — 취소 시 자동으로 이전 상태로 되돌아온다 */}
      <Select value={current} onValueChange={requestChange}>
        <SelectTrigger className="w-40" aria-label="문서 상태 변경">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          {DOCUMENT_STATUSES.map((s) => (
            <SelectItem key={s} value={s}>
              <span
                aria-hidden
                className={cn("size-2 rounded-full", STATUS_DOT[s])}
              />
              {DOCUMENT_STATUS_LABELS[s]}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>

      <AlertDialog
        open={pending !== null}
        onOpenChange={(open) => {
          if (!open && !isSaving) setPending(null);
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>문서 상태 변경</AlertDialogTitle>
            <AlertDialogDescription>
              문서 상태를{" "}
              <span className="font-medium text-foreground">{curLabel}</span>
              에서{" "}
              <span className="font-medium text-foreground">{nextLabel}</span>
              (으)로 변경하시겠습니까?
              {pending === "VOID"
                ? " 폐기하면 보관함 기본 목록과 통계 집계에서 제외됩니다."
                : ""}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={isSaving}>취소</AlertDialogCancel>
            <AlertDialogAction
              onClick={(e) => {
                e.preventDefault(); // 비동기 처리 동안 얼럿 유지 (성공/실패 후 직접 닫음)
                confirmChange();
              }}
              disabled={isSaving}
            >
              {isSaving ? "변경 중…" : "변경"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
