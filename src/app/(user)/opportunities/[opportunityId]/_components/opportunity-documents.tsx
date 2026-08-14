"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  CircleCheckBig,
  Eye,
  FilePlus2,
  FileText,
  Link2,
  Unlink,
} from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { formatDate, formatKRW } from "@/lib/format";
import { resolveConfirmedDocument } from "@/lib/confirmed-document";
import { Button } from "@/components/ui/button";
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
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { DocTypeBadge, StatusBadge } from "@/components/status-badge";
import { DocumentPreviewDialog } from "@/components/document/document-preview-dialog";
import { LinkableDocumentPicker } from "@/components/document/linkable-document-picker";
import {
  useConfirmedDocument,
  type AmountSync,
} from "@/components/opportunity/confirmed-document-actions";

/**
 * 기회의 연관 문서 (기회-5 · 기회-19 · 기회-6 ③).
 *
 * 문서를 붙이는 길은 **두 갈래**다 (기회-5).
 *  1. 새 문서 생성 — 이 기회에 연결된 문서를 새로 만든다 (기존 "문서 작성" 동선)
 *  2. 기존 문서 선택 — 보관함의 문서를 **연결**한다 (복제가 아니다)
 *
 * 목록의 각 문서는 **미리보기**로 확인하고(기회-19), 필요하면 **확정 문서로 지정**한다
 * (기회-6 ③ — 지정하면 자동 판정에서 제외된다). 확정 문서가 곧 예상 금액의 근거이므로
 * 어느 문서가 기준인지 배지로 드러낸다.
 *
 * 붙이는 길이 둘이면 **푸는 길도 있어야 한다** (기회-4 재수정). 문서별 `연결 해제` 가
 * 이 기회에서 문서를 떼어낸다 — 문서를 지우는 것이 아니라 보관함으로 돌려보내는 것이다.
 */

export type OpportunityDocument = {
  id: string;
  title: string;
  type: string;
  status: string;
  /** 총액 (KRW 정수) */
  amount: number;
  /** ISO 8601 — 서버 컴포넌트가 직렬화해 넘긴다 (Date 를 그대로 넘기지 않는다) */
  createdAt: string;
  /** ISO 8601. 확정 문서 동순위를 가르는 기준이라 해제 미리보기에 필요하다. */
  updatedAt: string;
};

/** 보관함 문서를 골라 이 기회에 연결한다 (기회-5 2번) */
function LinkDocumentDialog({
  opportunityId,
  onLinked,
  onClose,
}: {
  opportunityId: string;
  onLinked: (sync: AmountSync | null) => void;
  onClose: () => void;
}) {
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [isSaving, setIsSaving] = useState(false);

  const submit = async () => {
    if (selectedIds.length === 0) return;
    setIsSaving(true);
    try {
      const res = await fetch(`/api/opportunities/${opportunityId}/documents`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ documentIds: selectedIds }),
      });
      const json = await res.json().catch(() => null);
      if (!res.ok) {
        toast.error(json?.error ?? "문서를 연결하지 못했습니다.");
        return;
      }
      toast.success(`문서 ${selectedIds.length}건을 연결했습니다.`);
      onLinked((json.data?.amountSync as AmountSync | null) ?? null);
      onClose();
    } catch {
      toast.error("문서를 연결하지 못했습니다.");
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
      <DialogContent className="max-h-[90svh] gap-5 overflow-y-auto sm:max-w-xl">
        <DialogHeader>
          <DialogTitle>기존 문서 연결</DialogTitle>
          <DialogDescription>
            보관함의 문서를 이 기회에 연결합니다. 문서는 복제되지 않으며,
            연결하신 문서는 곧바로 예상 금액의 후보가 됩니다.
          </DialogDescription>
        </DialogHeader>

        <LinkableDocumentPicker
          selectedIds={selectedIds}
          onChange={setSelectedIds}
          disabled={isSaving}
        />

        <DialogFooter>
          <Button variant="outline" onClick={onClose} disabled={isSaving}>
            취소
          </Button>
          <Button
            onClick={submit}
            disabled={selectedIds.length === 0 || isSaving}
          >
            {isSaving ? "연결 중…" : `${selectedIds.length}건 연결`}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

/**
 * 연결을 해제하면 **예상 금액이 어떻게 되는지** 미리 계산한다 (기회-4 재수정).
 *
 * 판정은 여기서 새로 만들지 않는다 — `@/lib/confirmed-document` 의 순수 함수가 단일 기준이라
 * 서버가 해제 직후 실제로 저장할 결과와 같은 규칙을 쓴다. 규칙이 갈라지면 확인창이 예고한
 * 금액과 저장된 금액이 달라진다.
 *
 * `isPinned: false` 로 판정하는 이유: 이 미리보기는 **확정 문서를 뗄 때만** 쓰이는데,
 * 고정된 문서가 후보에서 사라지면 고정이 자동으로 풀리고 자동 판정으로 돌아가기 때문이다.
 */
function previewAfterUnlink(
  documents: readonly OpportunityDocument[],
  removedId: string,
): { amount: number; document: OpportunityDocument | null } {
  const remaining = documents.filter((document) => document.id !== removedId);
  const resolution = resolveConfirmedDocument(
    // 순수 함수는 `updatedAt` 을 Date 로 본다 (직렬화 과정에서 문자열이 된 값을 되돌린다)
    remaining.map((document) => ({
      ...document,
      updatedAt: new Date(document.updatedAt),
    })),
    { confirmedDocumentId: removedId, isPinned: false },
  );
  return {
    amount: resolution.amount,
    document:
      remaining.find(
        (document) => document.id === resolution.confirmedDocumentId,
      ) ?? null,
  };
}

/**
 * 연결 해제 확인창 (기회-4 재수정).
 *
 * 확정 문서를 뗄 때는 **금액이 얼마로 바뀌는지 미리 알린다** — 거래처 담당자를 지울 때
 * "삭제 후에는 OO 님이 대표가 됩니다" 를 먼저 말해 주는 것과 같은 이유다. 되돌릴 수 없는
 * 결과를 확인 뒤에 알리면 사용자는 이미 벌어진 일을 수습해야 한다.
 */
function UnlinkConfirmDialog({
  target,
  documents,
  isConfirmed,
  isSaving,
  onCancel,
  onConfirm,
}: {
  target: OpportunityDocument;
  documents: OpportunityDocument[];
  /** 이 문서가 지금 예상 금액의 근거인지 */
  isConfirmed: boolean;
  isSaving: boolean;
  onCancel: () => void;
  onConfirm: () => void;
}) {
  const preview = isConfirmed ? previewAfterUnlink(documents, target.id) : null;

  return (
    <AlertDialog
      open
      onOpenChange={(open) => {
        if (!open && !isSaving) onCancel();
      }}
    >
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>
            “{target.title}” 의 연결을 해제할까요?
          </AlertDialogTitle>
          <AlertDialogDescription>
            이 기회에서만 떼어냅니다. 문서는 삭제되지 않고 보관함에 그대로 남아
            다른 기회에 다시 연결하실 수 있습니다.
          </AlertDialogDescription>
        </AlertDialogHeader>

        {preview ? (
          <div className="rounded-md border border-amber-300 bg-amber-50 p-3 text-sm text-amber-900 dark:border-amber-500/40 dark:bg-amber-500/10 dark:text-amber-200">
            이 문서가 예상 금액의 기준입니다. 해제하시면 예상 금액이{" "}
            <span className="font-semibold tabular-nums">
              {formatKRW(target.amount)}
            </span>{" "}
            에서{" "}
            <span className="font-semibold tabular-nums">
              {formatKRW(preview.amount)}
            </span>{" "}
            {preview.document
              ? `으로 바뀝니다 — “${preview.document.title}” 기준이 됩니다.`
              : "이 됩니다. 남은 문서가 없어 확정 문서 없음 상태가 됩니다."}
          </div>
        ) : null}

        <AlertDialogFooter>
          <AlertDialogCancel disabled={isSaving}>취소</AlertDialogCancel>
          <AlertDialogAction
            disabled={isSaving}
            onClick={(event) => {
              // 확인창을 곧바로 닫지 않고 저장이 끝난 뒤 닫는다 (진행 상태를 보여준다)
              event.preventDefault();
              onConfirm();
            }}
          >
            {isSaving ? "해제 중…" : "연결 해제"}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}

export function OpportunityDocuments({
  opportunityId,
  documents,
  confirmedDocumentId,
}: {
  opportunityId: string;
  documents: OpportunityDocument[];
  /** 예상 금액의 근거가 된 문서 (없으면 null) */
  confirmedDocumentId: string | null;
}) {
  const router = useRouter();
  const { pin, notify, isSaving } = useConfirmedDocument(opportunityId);
  const [isLinking, setIsLinking] = useState(false);
  const [preview, setPreview] = useState<OpportunityDocument | null>(null);
  const [unlinkTarget, setUnlinkTarget] = useState<OpportunityDocument | null>(
    null,
  );
  const [isUnlinking, setIsUnlinking] = useState(false);

  const newDocumentHref = `/generator?opportunityId=${encodeURIComponent(opportunityId)}`;

  const handleLinked = (sync: AmountSync | null) => {
    // 연결로 확정 문서가 바뀌면 금액이 달라진다 — 자동 판정 결과이므로 되돌릴 길을 준다.
    notify(sync, { allowUndo: true, onDone: () => router.refresh() });
    router.refresh();
  };

  const handlePin = async (document: OpportunityDocument) => {
    const sync = await pin(document.id);
    if (!sync) return;
    toast.success(
      `"${document.title}" 을(를) 예상 금액의 기준으로 지정했습니다.`,
    );
    router.refresh();
  };

  /**
   * 이 기회에서 문서를 떼어낸다 — **삭제가 아니다** (기회-4 재수정).
   *
   * 문서의 연결을 바꾸는 경로는 `PATCH /api/documents/:id/opportunity` 하나뿐이라
   * 여기서도 그 길을 쓴다. 서버가 같은 트랜잭션에서 확정 문서를 재판정하므로
   * 문서를 떼는 것과 금액이 다시 잡히는 것 사이에 중간 상태가 노출되지 않는다.
   */
  const handleUnlink = async (document: OpportunityDocument) => {
    setIsUnlinking(true);
    const failureMessage = "문서 연결을 해제하지 못했습니다.";
    try {
      const res = await fetch(`/api/documents/${document.id}/opportunity`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ opportunityId: null }),
      });
      const json = await res.json().catch(() => null);
      if (!res.ok) {
        toast.error(json?.error ?? failureMessage);
        return;
      }
      setUnlinkTarget(null);
      toast.success(
        `"${document.title}" 의 연결을 해제했습니다. 문서는 보관함에 남아 있습니다.`,
      );
      /*
       * 확정 문서를 뗐다면 예상 금액이 다른 문서 기준으로 다시 잡힌다 — 무엇이 기준이
       * 되었는지 알린다. **되돌리기는 붙이지 않는다**: 되돌리기는 이전 확정 문서로 수동
       * 고정하는 동작인데, 그 문서는 방금 이 기회에서 떨어져 나가 고정할 대상이 없다.
       */
      notify((json.data?.amountSync as AmountSync | null) ?? null);
      router.refresh();
    } catch {
      toast.error(failureMessage);
    } finally {
      setIsUnlinking(false);
    }
  };

  return (
    <div className="space-y-3">
      {/* 문서를 붙이는 두 갈래를 나란히 둔다 (기회-5) */}
      <div className="flex flex-wrap gap-2">
        <Button variant="outline" size="sm" asChild>
          <Link href={newDocumentHref}>
            <FilePlus2 className="size-4" aria-hidden="true" />새 문서 생성
          </Link>
        </Button>
        <Button variant="outline" size="sm" onClick={() => setIsLinking(true)}>
          <Link2 className="size-4" aria-hidden="true" />
          기존 문서 연결
        </Button>
      </div>

      {documents.length === 0 ? (
        <div className="rounded-md border border-dashed p-8 text-center">
          <p className="text-sm text-muted-foreground">
            이 기회에 연결된 문서가 아직 없습니다. 문서를 연결하시면 그 금액이
            예상 금액이 되고, 발송하시면 단계도 함께 옮겨집니다.
          </p>
        </div>
      ) : (
        <ul className="divide-y rounded-md border">
          {documents.map((document) => {
            const isConfirmed = document.id === confirmedDocumentId;
            return (
              <li
                key={document.id}
                className={cn("p-4", isConfirmed && "bg-muted/40")}
              >
                <div className="flex items-start justify-between gap-4">
                  <div className="min-w-0">
                    <div className="flex items-center gap-2">
                      <FileText
                        className="size-4 shrink-0 text-muted-foreground"
                        aria-hidden="true"
                      />
                      <Link
                        href={`/editor/${document.id}`}
                        className="truncate font-medium transition-colors hover:text-primary hover:underline"
                      >
                        {document.title}
                      </Link>
                    </div>
                    <p className="mt-0.5 text-xs text-muted-foreground">
                      {formatDate(document.createdAt)} 생성
                      {isConfirmed ? " · 이 문서가 예상 금액의 기준입니다" : ""}
                    </p>
                  </div>
                  <div className="flex shrink-0 items-center gap-2">
                    <span className="text-sm font-medium tabular-nums">
                      {formatKRW(document.amount)}
                    </span>
                    <DocTypeBadge type={document.type} />
                    <StatusBadge status={document.status} />
                  </div>
                </div>

                <div className="mt-3 flex flex-wrap items-center gap-2">
                  {isConfirmed ? (
                    <span className="inline-flex items-center gap-1 rounded-full bg-emerald-100 px-2 py-0.5 text-xs font-medium text-emerald-800 dark:bg-emerald-500/20 dark:text-emerald-300">
                      <CircleCheckBig className="size-3" aria-hidden="true" />
                      확정 문서
                    </span>
                  ) : (
                    <Button
                      variant="ghost"
                      size="sm"
                      disabled={isSaving}
                      onClick={() => handlePin(document)}
                    >
                      <CircleCheckBig className="size-4" aria-hidden="true" />
                      확정 문서로 지정
                    </Button>
                  )}
                  {/* 편집 화면까지 들어가지 않고 내용을 확인한다 (기회-19) */}
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => setPreview(document)}
                  >
                    <Eye className="size-4" aria-hidden="true" />
                    미리보기
                  </Button>
                  {/* 붙이는 길이 있으면 푸는 길도 있어야 한다 — 문서 삭제가 아니다 */}
                  <Button
                    variant="ghost"
                    size="sm"
                    disabled={isUnlinking}
                    onClick={() => setUnlinkTarget(document)}
                  >
                    <Unlink className="size-4" aria-hidden="true" />
                    연결 해제
                  </Button>
                </div>
              </li>
            );
          })}
        </ul>
      )}

      {isLinking ? (
        <LinkDocumentDialog
          opportunityId={opportunityId}
          onLinked={handleLinked}
          onClose={() => setIsLinking(false)}
        />
      ) : null}

      {unlinkTarget ? (
        <UnlinkConfirmDialog
          target={unlinkTarget}
          documents={documents}
          isConfirmed={unlinkTarget.id === confirmedDocumentId}
          isSaving={isUnlinking}
          onCancel={() => setUnlinkTarget(null)}
          onConfirm={() => handleUnlink(unlinkTarget)}
        />
      ) : null}

      {preview ? (
        <DocumentPreviewDialog
          documentId={preview.id}
          title={preview.title}
          open
          onOpenChange={(open) => {
            if (!open) setPreview(null);
          }}
        />
      ) : null}
    </div>
  );
}
