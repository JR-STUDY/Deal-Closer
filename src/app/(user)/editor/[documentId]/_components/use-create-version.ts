"use client";

import { useCallback, useState } from "react";
import { toast } from "sonner";

/**
 * 현재 편집 내용을 **새 버전으로 저장**하고 그 버전으로 이동한다 (F-214).
 *
 * 두 곳이 같은 동작을 쓴다 — 버전 이력 다이얼로그의 "현재 내용을 새 버전으로 저장",
 * 그리고 잠긴 문서(발송·확정본)의 "이 내용으로 새 버전 만들어 편집"(진단 3).
 * 잠긴 문서를 고치는 **유일한 길**이므로 두 곳의 동작·문구가 갈라지면 안 된다.
 */
export function useCreateVersion(options: {
  documentId: string;
  /** 새 버전에 담을 본문 (편집 중인 현재 내용) */
  getContentJson: () => string;
  /** 새 버전이 생겼을 때 이동 처리 — 부모가 dirty 를 해제한 뒤 이동한다 */
  onNavigate: (documentId: string) => void;
}) {
  const { documentId, getContentJson, onNavigate } = options;
  const [saving, setSaving] = useState(false);

  const createVersion = useCallback(async () => {
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
      onNavigate(newId);
    } catch {
      toast.error("네트워크 오류로 새 버전 저장에 실패했습니다.");
    } finally {
      setSaving(false);
    }
  }, [documentId, getContentJson, onNavigate, saving]);

  return { createVersion, saving };
}
