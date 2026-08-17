"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { Dispatch, SetStateAction } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { deriveAmount, type EditorDoc } from "@/lib/editor-schema";
import {
  amountChangeMessage,
  type AmountSync,
} from "@/components/opportunity/confirmed-document-actions";

/**
 * 문서 저장 + 미저장 이탈 흐름 (진단 1·3).
 *
 * 저장은 단순한 PATCH 가 아니다. 세 가지를 함께 지켜야 한다.
 *  ① **금액이 사라지는 저장은 결과를 미리 말한다** — 품목표를 다 지운 채 저장하면 문서
 *     금액이 0 이 되고, 이 문서가 확정 문서라면 기회 예상 금액까지 0 으로 내려간다.
 *     되돌릴 수 없으므로 확인창이 바뀔 금액을 먼저 보여준다.
 *  ② **금액이 소리 없이 달라지지 않게** 저장 응답의 재판정 결과(`amountSync`)를 알린다.
 *     문구는 기회 화면과 같은 `amountChangeMessage` 를 쓴다.
 *  ③ 미저장 상태로 페이지를 떠나지 않게 `beforeunload` 와 앱 내 링크 클릭을 가로챈다.
 *
 * 금액 기준값(`savedAmountRef`)은 화면에 그리지 않고 핸들러에서만 읽으므로 ref 다
 * (rerender-state-only-in-handlers). 확인창에 보여줄 값은 `zeroWarning.from` 으로 복사한다.
 */

export type ZeroAmountWarning = {
  /** 지금 저장된 금액 — 확인창이 "얼마에서 0 으로" 를 말할 수 있게 */
  from: number;
  /** 확인 후 이동할 곳 (이탈 흐름에서 넘어온 경우). 없으면 제자리 */
  then: string | null;
};

export function useDocumentSave(options: {
  documentId: string;
  doc: EditorDoc;
  docTitle: string;
  /** 저장된 Document.amount — 금액이 0 으로 떨어지는지 판단하는 기준 */
  initialAmount: number;
  locked: boolean;
  lockReason: string;
  /** 내용이 잘린 블록 수 — 저장 후 남아 있으면 알린다 (진단 4) */
  clippedCount: number;
  /**
   * 미저장 표시는 **본체가 들고 있다** — 여기 두면 순환이 생긴다.
   * (editDoc → setDirty, 저장 훅 → clippedCount, 잘림 훅 → editDoc)
   */
  dirty: boolean;
  setDirty: Dispatch<SetStateAction<boolean>>;
}) {
  const {
    documentId,
    doc,
    docTitle,
    initialAmount,
    locked,
    lockReason,
    clippedCount,
    dirty,
    setDirty,
  } = options;
  const router = useRouter();

  const [saving, setSaving] = useState(false);
  /** 미저장 상태에서 가려던 앱 내 경로 (확인창을 띄운다) */
  const [navTarget, setNavTarget] = useState<string | null>(null);
  const [zeroWarning, setZeroWarning] = useState<ZeroAmountWarning | null>(null);
  const savedAmountRef = useRef(initialAmount);

  /** 실제 저장. 성공 여부를 돌려준다 (이탈 시 저장→이동 판단에 쓴다). */
  const performSave = useCallback(async (): Promise<boolean> => {
    setSaving(true);
    try {
      const res = await fetch(`/api/documents/${documentId}`, {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          contentJson: JSON.stringify(doc),
          title: docTitle,
        }),
      });
      const json = await res.json().catch(() => null);
      if (!res.ok) throw new Error(json?.error ?? "save failed");
      setDirty(false);
      // 금액 기준은 **서버가 재계산한 값**으로 갱신한다 (정책 VAL: 클라이언트 총액을 신뢰하지 않는다)
      if (typeof json?.data?.amount === "number") {
        savedAmountRef.current = json.data.amount;
      }
      toast.success("저장되었습니다.");
      const sync = (json?.data?.amountSync ?? null) as AmountSync | null;
      const message = sync ? amountChangeMessage(sync) : null;
      if (message) toast.info(message);
      // 잘린 블록이 남아 있으면 알린다 — 그대로 발송하면 PDF 에서도 잘린다 (막지는 않는다)
      if (clippedCount > 0) {
        toast.warning(
          `내용이 잘린 블록이 ${clippedCount}개 있습니다. 발송 전에 확인해 주세요.`,
        );
      }
      return true;
    } catch {
      toast.error("저장에 실패했습니다. 다시 시도해주세요.");
      return false;
    } finally {
      setSaving(false);
    }
  }, [doc, docTitle, documentId, clippedCount, setDirty]);

  /** 이 저장으로 금액이 사라지는가 (품목표가 비어 0 이 되는 경우만 — 근거가 없으면 서버가 보존한다) */
  const wipesAmount = useCallback(
    () => deriveAmount(doc) === 0 && savedAmountRef.current > 0,
    [doc],
  );

  const handleSave = useCallback(async () => {
    if (locked) {
      toast.error(lockReason);
      return;
    }
    if (wipesAmount()) {
      setZeroWarning({ from: savedAmountRef.current, then: null });
      return;
    }
    await performSave();
  }, [performSave, locked, lockReason, wipesAmount]);

  /** 미저장 이탈 확인창의 [저장] — 저장에 성공했을 때만 이동한다 */
  const saveAndGo = useCallback(async () => {
    const target = navTarget;
    setNavTarget(null);
    // 금액이 사라지는 저장이면 확인창으로 넘긴다 — 확인 후 원래 가려던 곳으로 보낸다
    if (wipesAmount()) {
      setZeroWarning({ from: savedAmountRef.current, then: target });
      return;
    }
    if (await performSave()) {
      if (target) router.push(target);
    }
  }, [navTarget, performSave, router, wipesAmount]);

  const discardAndGo = useCallback(() => {
    const target = navTarget;
    setNavTarget(null);
    setDirty(false);
    if (target) router.push(target);
  }, [navTarget, router, setDirty]);

  const confirmZeroSave = useCallback(async () => {
    const target = zeroWarning?.then ?? null;
    setZeroWarning(null);
    if (await performSave()) {
      if (target) router.push(target);
    }
  }, [zeroWarning, performSave, router]);

  /**
   * 다른 버전(또는 새로 만든 버전)으로 이동한다.
   * 새 버전에는 지금 편집 내용이 이미 담겨 있으므로 미저장 경고를 띄우지 않는다.
   */
  const goToVersion = useCallback(
    (nextDocumentId: string) => {
      setDirty(false);
      router.push(`/editor/${nextDocumentId}`);
    },
    [router, setDirty],
  );

  // 미저장 이탈 경고 (정책 STATE_)
  useEffect(() => {
    function onBeforeUnload(e: BeforeUnloadEvent) {
      if (!dirty) return;
      e.preventDefault();
      e.returnValue = "";
    }
    window.addEventListener("beforeunload", onBeforeUnload);
    return () => window.removeEventListener("beforeunload", onBeforeUnload);
  }, [dirty]);

  // 미저장 상태에서 앱 내 링크 이동 시 가로채기 (#7) — 사이드바/발송 링크 포함
  useEffect(() => {
    if (!dirty) return;
    function onClick(e: MouseEvent) {
      if (
        e.defaultPrevented ||
        e.button !== 0 ||
        e.metaKey ||
        e.ctrlKey ||
        e.shiftKey ||
        e.altKey
      ) {
        return;
      }
      const anchor = (e.target as HTMLElement | null)?.closest("a");
      if (!anchor) return;
      const href = anchor.getAttribute("href");
      if (
        !href ||
        !href.startsWith("/") ||
        anchor.target === "_blank" ||
        anchor.hasAttribute("download")
      ) {
        return;
      }
      e.preventDefault();
      setNavTarget(href);
    }
    document.addEventListener("click", onClick, true);
    return () => document.removeEventListener("click", onClick, true);
  }, [dirty]);

  return {
    saving,
    handleSave,
    goToVersion,
    // 미저장 이탈 확인창
    navTarget,
    closeNavPrompt: () => setNavTarget(null),
    saveAndGo,
    discardAndGo,
    // 금액 소멸 확인창
    zeroWarning,
    closeZeroWarning: () => setZeroWarning(null),
    confirmZeroSave,
  };
}
