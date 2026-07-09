"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import {
  FileText,
  Loader2,
  CheckCircle2,
  FolderOpen,
  ExternalLink,
} from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  DOCUMENT_STATUSES,
  DOCUMENT_STATUS_LABELS,
  type DocumentStatus,
} from "@/lib/constants";

type ItemStatus = "pending" | "working" | "done";
type BatchItem = {
  fileName: string;
  status: ItemStatus;
  progress: number;
  docId?: string;
  docTitle?: string;
};

const PROGRESS_STEPS = [30, 62, 100];
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/**
 * 폴더 업로드 데모 변환 패널 (전용 페이지).
 * 마운트 시 배치 API 로 폴더+데모 문서를 생성하고, 항목별로 업로드/변환
 * 프로그레스를 연출한다. 완료 항목을 클릭하면 편집 팝업이 열린다. (화면 시연용)
 */
export function FolderBatchPanel({
  folderName,
  fileNames,
  saveAsCommon,
  onRestart,
}: {
  folderName: string;
  fileNames: string[];
  saveAsCommon: boolean;
  onRestart: () => void;
}) {
  const [items, setItems] = useState<BatchItem[]>(() =>
    fileNames.map((fileName) => ({
      fileName,
      status: "pending" as const,
      progress: 0,
    })),
  );
  const [folderInfo, setFolderInfo] = useState<{
    id: string;
    isCommon: boolean;
  } | null>(null);
  const [failed, setFailed] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const startedRef = useRef(false);

  const doneCount = items.filter((it) => it.status === "done").length;
  const allDone = items.length > 0 && doneCount === items.length;
  const overall = items.length
    ? Math.round(items.reduce((s, it) => s + it.progress, 0) / items.length)
    : 0;

  useEffect(() => {
    if (startedRef.current) return; // StrictMode/재마운트 중복 실행(중복 생성) 방지
    startedRef.current = true;

    // 항목이 많아도 전체 연출이 6초 안팎이 되도록 항목당 시간을 자동 조절
    const perItem = Math.max(
      45,
      Math.min(600, Math.round(6000 / Math.max(1, fileNames.length))),
    );
    const stepSleep = Math.max(15, Math.round(perItem / PROGRESS_STEPS.length));

    const run = async () => {
      let docs: { id: string; title: string }[] = [];
      try {
        const res = await fetch("/api/generate/batch", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ folderName, fileNames, saveAsCommon }),
        });
        const json = await res.json().catch(() => null);
        if (!res.ok) {
          toast.error(json?.error ?? "변환에 실패했습니다.");
          setFailed(true);
          return;
        }
        docs = json?.data?.documents ?? [];
        if (json?.data?.folder) {
          setFolderInfo({
            id: json.data.folder.id,
            isCommon: json.data.folder.isCommon,
          });
        }
      } catch {
        toast.error("네트워크 오류로 변환에 실패했습니다.");
        setFailed(true);
        return;
      }

      // 항목별 업로드/변환 프로그레스 연출
      for (let i = 0; i < fileNames.length; i++) {
        setItems((prev) =>
          prev.map((it, idx) => (idx === i ? { ...it, status: "working" } : it)),
        );
        for (const p of PROGRESS_STEPS) {
          await sleep(stepSleep);
          setItems((prev) =>
            prev.map((it, idx) => (idx === i ? { ...it, progress: p } : it)),
          );
        }
        const doc = docs[i];
        setItems((prev) =>
          prev.map((it, idx) =>
            idx === i
              ? {
                  ...it,
                  status: "done",
                  progress: 100,
                  docId: doc?.id,
                  docTitle: doc?.title,
                }
              : it,
          ),
        );
      }
    };
    void run();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const libraryHref = folderInfo
    ? folderInfo.isCommon
      ? `/library/common?folder=${folderInfo.id}`
      : `/library?folder=${folderInfo.id}`
    : saveAsCommon
      ? "/library/common"
      : "/library";

  return (
    <div className="mx-auto flex w-full max-w-2xl flex-col gap-4">
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-lg">
            <FolderOpen className="size-5 text-primary" />
            {folderName}
          </CardTitle>
          <p className="text-sm text-muted-foreground">
            폴더의 {items.length}개 양식을 업로드해 문서로 변환하고 있어요.
          </p>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-1.5">
            <div className="flex items-center justify-between text-sm">
              <span className="text-muted-foreground">
                {failed ? "변환 실패" : allDone ? "변환 완료" : "변환 중…"}
              </span>
              <span className="font-medium tabular-nums">
                {doneCount} / {items.length}
              </span>
            </div>
            <Progress value={overall} />
          </div>

          <ul className="space-y-2">
            {items.map((it) => (
              <li key={it.fileName}>
                <button
                  type="button"
                  disabled={it.status !== "done"}
                  onClick={() => it.docId && setEditingId(it.docId)}
                  className={`w-full rounded-md border px-3 py-2.5 text-left transition-colors ${
                    it.status === "done"
                      ? "cursor-pointer hover:bg-muted/50"
                      : "cursor-default"
                  }`}
                >
                  <div className="flex items-center gap-3 text-sm">
                    <FileText className="size-4 shrink-0 text-muted-foreground" />
                    <span className="flex-1 truncate" title={it.fileName}>
                      {it.docTitle ?? it.fileName}
                    </span>
                    {it.status === "pending" && (
                      <span className="shrink-0 text-xs text-muted-foreground">
                        대기
                      </span>
                    )}
                    {it.status === "working" && (
                      <span className="flex shrink-0 items-center gap-1 text-xs text-primary tabular-nums">
                        <Loader2 className="size-3.5 animate-spin" />
                        {it.progress}%
                      </span>
                    )}
                    {it.status === "done" && (
                      <span className="flex shrink-0 items-center gap-1 text-xs font-medium text-emerald-600 dark:text-emerald-400">
                        <CheckCircle2 className="size-4" />
                        완료
                      </span>
                    )}
                  </div>
                  {it.status !== "done" && (
                    <div className="mt-2 h-1 overflow-hidden rounded-full bg-muted">
                      <div
                        className="h-full rounded-full bg-primary transition-all duration-200"
                        style={{ width: `${it.progress}%` }}
                      />
                    </div>
                  )}
                </button>
              </li>
            ))}
          </ul>

          {allDone && (
            <p className="text-center text-xs text-muted-foreground">
              완료된 항목을 클릭하면 편집 팝업이 열립니다.
            </p>
          )}
        </CardContent>
      </Card>

      <div className="flex items-center justify-between gap-3">
        <Button variant="outline" onClick={onRestart}>
          {failed ? "돌아가기" : "새 변환"}
        </Button>
        {allDone && (
          <Button asChild>
            <Link href={libraryHref}>
              <FolderOpen className="size-4" />
              문서함에서 보기
            </Link>
          </Button>
        )}
      </div>

      <DocEditDialog
        docId={editingId}
        onOpenChange={(open) => {
          if (!open) setEditingId(null);
        }}
      />
    </div>
  );
}

/** 완료 항목 편집 팝업 — 제목·거래처·상태 빠른 수정 + 전체 편집기 링크 */
function DocEditDialog({
  docId,
  onOpenChange,
}: {
  docId: string | null;
  onOpenChange: (open: boolean) => void;
}) {
  const [title, setTitle] = useState("");
  const [clientName, setClientName] = useState("");
  const [status, setStatus] = useState<DocumentStatus>("DRAFT");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!docId) return;
    let cancelled = false;
    const load = async () => {
      try {
        const res = await fetch(`/api/documents/${docId}`);
        const json = await res.json().catch(() => null);
        if (cancelled || !json?.data) return;
        setTitle(json.data.title ?? "");
        setClientName(json.data.clientName ?? "");
        setStatus((json.data.status as DocumentStatus) ?? "DRAFT");
      } catch {
        /* 무시 — 기본값 유지 */
      }
    };
    void load();
    return () => {
      cancelled = true;
    };
  }, [docId]);

  async function save() {
    if (!docId) return;
    setSaving(true);
    try {
      const res = await fetch(`/api/documents/${docId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ title: title.trim(), clientName, status }),
      });
      if (!res.ok) {
        const json = await res.json().catch(() => null);
        toast.error(json?.error ?? "저장에 실패했습니다.");
        setSaving(false);
        return;
      }
      toast.success("문서를 저장했습니다.");
      onOpenChange(false);
    } catch {
      toast.error("네트워크 오류로 저장에 실패했습니다.");
      setSaving(false);
    }
  }

  return (
    <Dialog open={Boolean(docId)} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>문서 편집</DialogTitle>
          <DialogDescription>
            제목·거래처·상태를 빠르게 고치거나, 전체 편집기를 열어 자세히 편집하세요.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-3">
          <div className="space-y-1.5">
            <Label htmlFor="ed-title">제목</Label>
            <Input
              id="ed-title"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="ed-client">거래처</Label>
            <Input
              id="ed-client"
              value={clientName}
              onChange={(e) => setClientName(e.target.value)}
              placeholder="거래처명"
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="ed-status">상태</Label>
            <Select
              value={status}
              onValueChange={(v) => setStatus(v as DocumentStatus)}
            >
              <SelectTrigger id="ed-status" className="w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {DOCUMENT_STATUSES.map((s) => (
                  <SelectItem key={s} value={s}>
                    {DOCUMENT_STATUS_LABELS[s]}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>

        <DialogFooter className="gap-2 sm:justify-between">
          {docId && (
            <Button asChild variant="ghost">
              <a
                href={`/editor/${docId}`}
                target="_blank"
                rel="noopener noreferrer"
              >
                <ExternalLink className="size-4" />
                전체 편집기
              </a>
            </Button>
          )}
          <div className="flex gap-2">
            <Button
              variant="outline"
              onClick={() => onOpenChange(false)}
              disabled={saving}
            >
              취소
            </Button>
            <Button onClick={save} disabled={saving}>
              저장
            </Button>
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
