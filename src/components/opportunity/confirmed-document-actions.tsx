"use client";

import { useState } from "react";
import { toast } from "sonner";
import { formatKRW } from "@/lib/format";

/**
 * 확정 문서 변경 — 요청·알림을 한곳에 모은 클라이언트 훅 (기회-6 ②·③).
 *
 * 확정 문서가 바뀌면 **예상 금액이 소리 없이 달라진다.** 그래서 바뀔 때마다 알리고
 * 되돌릴 길을 준다. 알림은 **모달이 아니라 toast** 다 — 문서를 붙이거나 상태를 바꾸는
 * 흐름 한가운데서 확인 버튼을 누르게 만들면 하던 일이 끊긴다.
 *
 * [되돌리기]는 "이전 확정 문서로 **수동 고정**" 이다(잠금과 같은 경로). 자동 판정을 되돌린
 * 것이므로 다시 자동으로 뽑히지 않게 잠가야 사용자의 결정이 유지된다.
 *
 * 문서 연결·확정 지정·잠금 해제 세 동작이 같은 알림을 쓰도록 여기 모은다 —
 * 화면마다 문구가 달라지면 같은 일이 다르게 읽힌다.
 */

/** `@/lib/opportunity-amount` 의 `AmountSyncResult` 중 화면이 쓰는 부분 (직렬화된 형태) */
export type AmountSync = {
  status: "synced" | "not-found";
  amount: number;
  confirmed: { id: string; title: string } | null;
  isPinned: boolean;
  documentChanged: boolean;
  amountChanged: boolean;
  previousDocumentId: string | null;
  previousAmount: number;
};

/** 확정 문서가 바뀌었을 때의 안내 문구 (없으면 알릴 것이 없다) */
function changeMessage(sync: AmountSync): string | null {
  if (sync.status !== "synced") return null;
  if (!sync.documentChanged && !sync.amountChanged) return null;

  if (!sync.confirmed) {
    return "확정 문서가 없어 예상 금액이 ₩0 이 되었습니다.";
  }
  return `예상 금액이 ${formatKRW(sync.amount)} 으로 바뀌었습니다 — ${sync.confirmed.title} 기준`;
}

export function useConfirmedDocument(opportunityId: string) {
  const [isSaving, setIsSaving] = useState(false);

  async function request(
    method: "PUT" | "DELETE",
    body?: string,
  ): Promise<AmountSync | null> {
    setIsSaving(true);
    try {
      const res = await fetch(
        `/api/opportunities/${opportunityId}/confirmed-document`,
        {
          method,
          ...(body
            ? { headers: { "Content-Type": "application/json" }, body }
            : {}),
        },
      );
      const json = await res.json().catch(() => null);
      if (!res.ok) {
        toast.error(json?.error ?? "예상 금액의 기준을 바꾸지 못했습니다.");
        return null;
      }
      return json.data as AmountSync;
    } catch {
      toast.error("예상 금액의 기준을 바꾸지 못했습니다.");
      return null;
    } finally {
      setIsSaving(false);
    }
  }

  /** 확정 문서로 지정한다(잠금). 성공하면 재판정 결과를 돌려준다. */
  const pin = (documentId: string): Promise<AmountSync | null> =>
    request("PUT", JSON.stringify({ documentId }));

  /** 잠금을 풀고 자동 판정으로 되돌린다 */
  const unpin = (): Promise<AmountSync | null> => request("DELETE");

  /**
   * 재판정 결과를 화면에 알린다 (기회-6 ②).
   *
   * `allowUndo` 는 **자동 판정으로 바뀐 경우에만** 켠다 — 사용자가 직접 고른 결과까지
   * 되돌리기를 붙이면 방금 누른 것을 물리라는 말이 되어 어리둥절하다.
   */
  const notify = (
    sync: AmountSync | null,
    options: { allowUndo?: boolean; onDone?: () => void } = {},
  ) => {
    if (!sync) return;
    const message = changeMessage(sync);
    if (!message) return;

    const undoTarget = sync.previousDocumentId;
    const canUndo =
      options.allowUndo === true && sync.documentChanged && Boolean(undoTarget);

    toast.info(message, {
      action:
        canUndo && undoTarget
          ? {
              label: "되돌리기",
              onClick: async () => {
                // 되돌린다 = 이전 문서로 수동 고정한다. 다시 자동으로 뽑히면 되돌린 의미가 없다.
                const restored = await pin(undoTarget);
                if (restored) {
                  toast.success(
                    `예상 금액을 ${formatKRW(restored.amount)} 으로 되돌렸습니다.`,
                  );
                  options.onDone?.();
                }
              },
            }
          : undefined,
    });
  };

  return { pin, unpin, notify, isSaving };
}
