"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { CircleCheckBig, Eye, FilePlus2, FileText, Link2 } from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { formatDate, formatKRW } from "@/lib/format";
import { Button } from "@/components/ui/button";
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
