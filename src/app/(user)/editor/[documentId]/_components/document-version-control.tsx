"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { CheckCircle2, History, Loader2, Plus } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { formatDateTime, formatKRW } from "@/lib/format";
import { DOCUMENT_STATUS_LABELS, type DocumentStatus } from "@/lib/constants";

type VersionRow = {
  id: string;
  title: string;
  status: string;
  version: number;
  isConfirmed: boolean;
  amount: number;
  updatedAt: string;
  author: { id: string; name: string } | null;
};

type Props = {
  documentId: string;
  version: number;
  isConfirmed: boolean;
  /** 편집 중인 현재 본문 — "새 버전으로 저장" 에 사용 */
  getContentJson: () => string;
  /** 다른 버전으로 이동하기 전에 부모가 dirty 를 해제하도록 */
  onNavigate: (documentId: string) => void;
};

/**
 * 문서 버전 이력 + 확정본 지정 (PRD F-214).
 * 확정본은 버전별 독립 플래그이므로 여러 버전을 동시에 켤 수 있다.
 */
export function DocumentVersionControl({
  documentId,
  version,
  isConfirmed,
  getContentJson,
  onNavigate,
}: Props) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [versions, setVersions] = useState<VersionRow[] | null>(null);
  const [confirmedNow, setConfirmedNow] = useState(isConfirmed);

  /** 다이얼로그를 열 때 목록을 불러온다 (마운트 시 fetch 하지 않는다) */
  const handleOpenChange = async (next: boolean) => {
    setOpen(next);
    if (!next) return;

    setLoading(true);
    try {
      const res = await fetch(`/api/documents/${documentId}/versions`);
      const json = await res.json().catch(() => null);
      if (!res.ok) {
        toast.error(json?.error ?? "버전 이력을 불러오지 못했습니다.");
        return;
      }
      setVersions(json?.data?.versions ?? []);
    } catch {
      toast.error("네트워크 오류로 버전 이력을 불러오지 못했습니다.");
    } finally {
      setLoading(false);
    }
  };

  /** 확정본 토글 — 다른 버전의 플래그는 건드리지 않는다 */
  const toggleConfirmed = async (row: VersionRow, next: boolean) => {
    setVersions(
      (prev) =>
        prev?.map((v) => (v.id === row.id ? { ...v, isConfirmed: next } : v)) ?? prev,
    );
    if (row.id === documentId) setConfirmedNow(next);

    try {
      const res = await fetch(`/api/documents/${row.id}`, {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ isConfirmed: next }),
      });
      if (!res.ok) throw new Error("failed");
      toast.success(
        next ? `v${row.version} 을 확정본으로 지정했습니다.` : `v${row.version} 확정본을 해제했습니다.`,
      );
      router.refresh();
    } catch {
      // 실패 시 낙관적 업데이트를 되돌린다
      setVersions(
        (prev) =>
          prev?.map((v) => (v.id === row.id ? { ...v, isConfirmed: !next } : v)) ??
          prev,
      );
      if (row.id === documentId) setConfirmedNow(!next);
      toast.error("확정본 설정에 실패했습니다.");
    }
  };

  /** 현재 편집 내용을 새 버전으로 저장 */
  const createVersion = async () => {
    if (saving) return;
    setSaving(true);
    try {
      const res = await fetch(`/api/documents/${documentId}/versions`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ contentJson: getContentJson() }),
      });
      const json = await res.json().catch(() => null);
      if (!res.ok) {
        toast.error(json?.error ?? "새 버전 저장에 실패했습니다.");
        return;
      }
      const newId: string | undefined = json?.data?.document?.id;
      const newVersion: number | undefined = json?.data?.document?.version;
      if (!newId) {
        toast.error("새 버전을 찾을 수 없습니다.");
        return;
      }
      toast.success(`v${newVersion} 으로 저장했습니다.`);
      setOpen(false);
      onNavigate(newId);
    } catch {
      toast.error("네트워크 오류로 새 버전 저장에 실패했습니다.");
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogTrigger asChild>
        <Button variant="outline" size="sm" className="shrink-0 gap-1.5">
          <History className="size-4" />
          <span className="tabular-nums">v{version}</span>
          {confirmedNow ? (
            <CheckCircle2 className="size-3.5 text-emerald-600" aria-label="확정본" />
          ) : null}
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>버전 이력</DialogTitle>
          <DialogDescription>
            AI 수정·수동 저장으로 만든 버전이 쌓입니다. 확정본은 여러 버전을 동시에
            지정할 수 있고, 계약서를 만들 때 소스로 고를 수 있습니다.
          </DialogDescription>
        </DialogHeader>

        {loading ? (
          <div className="flex items-center justify-center gap-2 py-10 text-sm text-muted-foreground">
            <Loader2 className="size-4 animate-spin" />
            버전 이력을 불러오는 중입니다…
          </div>
        ) : (
          <ul className="max-h-80 space-y-2 overflow-auto">
            {(versions ?? []).map((row) => {
              const isCurrent = row.id === documentId;
              return (
                <li
                  key={row.id}
                  className={`flex items-center gap-3 rounded-md border px-3 py-2.5 text-sm ${
                    isCurrent ? "border-primary/50 bg-primary/5" : ""
                  }`}
                >
                  <span className="min-w-10 shrink-0 font-medium tabular-nums">
                    v{row.version}
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className="truncate">
                      {row.title}
                      {isCurrent ? (
                        <Badge variant="secondary" className="ml-2">
                          현재 보는 버전
                        </Badge>
                      ) : null}
                    </p>
                    <p className="text-xs text-muted-foreground">
                      {DOCUMENT_STATUS_LABELS[row.status as DocumentStatus] ?? row.status}
                      {" · "}
                      {formatKRW(row.amount)}
                      {" · "}
                      {formatDateTime(row.updatedAt)}
                      {row.author ? ` · ${row.author.name}` : ""}
                    </p>
                  </div>
                  <label className="flex shrink-0 items-center gap-2 text-xs">
                    <Switch
                      checked={row.isConfirmed}
                      onCheckedChange={(next) => toggleConfirmed(row, next)}
                      aria-label={`v${row.version} 확정본 지정`}
                    />
                    확정본
                  </label>
                  {isCurrent ? null : (
                    <Button
                      variant="ghost"
                      size="sm"
                      className="shrink-0"
                      onClick={() => {
                        setOpen(false);
                        onNavigate(row.id);
                      }}
                    >
                      열기
                    </Button>
                  )}
                </li>
              );
            })}
            {!loading && (versions?.length ?? 0) === 0 ? (
              <li className="py-8 text-center text-sm text-muted-foreground">
                버전 이력이 없습니다.
              </li>
            ) : null}
          </ul>
        )}

        <div className="flex justify-end">
          <Button variant="outline" onClick={createVersion} disabled={saving}>
            {saving ? (
              <Loader2 className="size-4 animate-spin" />
            ) : (
              <Plus className="size-4" />
            )}
            현재 내용을 새 버전으로 저장
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
