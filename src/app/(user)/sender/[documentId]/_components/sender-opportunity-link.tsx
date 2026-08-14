"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { toast } from "sonner";
import { OPPORTUNITY_STAGE_LABELS, isDocumentType } from "@/lib/constants";
import { stageForSentDocument } from "@/lib/opportunity-transition";
// 타입만 가져온다 — `@/lib/opportunity-recipient` 는 server-only 지만 `import type` 은
// 컴파일 단계에서 통째로 지워지므로 클라이언트 번들에 들어가지 않는다.
import type { LinkedOpportunity } from "@/lib/opportunity-recipient";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import {
  OpportunityCombobox,
  type OpportunitySuggestion,
} from "./opportunity-combobox";

/**
 * 발송 화면의 영업 기회 연결 (F-113 · F-114 · 발송-11).
 *
 * 연결 UI 를 **발송 화면**에 둔 이유: 단계 자동 전이가 일어나는 지점이 바로 이 화면의
 * 발송 버튼이다. 여기서 고르면 "무엇을 연결했는지 → 발송하면 어떤 단계가 되는지" 가
 * 한 화면에 붙어 있어, 담당자가 결과를 예측한 채로 보낼 수 있다.
 *
 * 연결/해제는 즉시 저장한다(PATCH). 발송 버튼과 묶으면 연결만 하고 나중에 보내는 흐름이 막힌다.
 * 저장 결과(연결된 기회 + 그 거래처의 대표 담당자)는 상위(`SenderClient`)로 올린다 —
 * 받는 사람 자동 채움(발송-12)과 발송 후 이동(발송-13)이 같은 값을 봐야 하기 때문이다.
 */
export function SenderOpportunityLink({
  documentId,
  documentType,
  value,
  onChange,
}: {
  documentId: string;
  documentType: string;
  /** 현재 연결된 기회 (없으면 null) — 값은 상위가 소유한다 */
  value: LinkedOpportunity | null;
  /** 저장 성공 시 상위에 알린다 (해제면 null) */
  onChange: (linked: LinkedOpportunity | null) => void;
}) {
  const router = useRouter();
  const [isSaving, setIsSaving] = useState(false);

  const targetStage = isDocumentType(documentType)
    ? stageForSentDocument(documentType)
    : null;

  const save = async (next: OpportunitySuggestion | null) => {
    if (isSaving || (next?.id ?? null) === (value?.id ?? null)) return;
    setIsSaving(true);
    try {
      const res = await fetch(`/api/documents/${documentId}/opportunity`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ opportunityId: next?.id ?? null }),
      });
      const json = await res.json().catch(() => null);
      if (!res.ok) throw new Error(json?.error ?? "저장에 실패했습니다.");
      toast.success(
        next ? "영업 기회를 연결했습니다." : "영업 기회 연결을 해제했습니다.",
      );
      // 대표 담당자까지 담긴 서버 판정 결과를 그대로 올린다 (자동완성 후보에는 담당자가 없다).
      onChange((json?.data?.opportunity as LinkedOpportunity | null) ?? null);
      router.refresh();
    } catch (error) {
      // 값을 상위가 쥐고 있으므로 실패하면 아무것도 바뀌지 않는다 — 입력 글자도 원래 값으로 돌아간다.
      toast.error(
        error instanceof Error ? error.message : "저장에 실패했습니다.",
      );
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">영업 기회 연결</CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        <div className="space-y-1.5">
          <Label htmlFor="opportunity">연결할 기회</Label>
          <OpportunityCombobox
            id="opportunity"
            value={value}
            disabled={isSaving}
            aria-describedby="opportunity-hint"
            onSelect={save}
            onClear={() => save(null)}
          />
        </div>

        <p id="opportunity-hint" className="text-xs text-muted-foreground">
          {value ? (
            targetStage ? (
              `발송하시면 ‘${value.name}’ 의 단계가 ‘${OPPORTUNITY_STAGE_LABELS[targetStage]}’ 로 이동하고, 발송 후 그 기회 상세로 이동합니다. 이미 그 단계를 지났다면 단계는 그대로 유지됩니다.`
            ) : (
              "이 문서 종류는 발송해도 단계가 바뀌지 않습니다. 발송 기록만 기회 이력에 쌓이고, 발송 후 그 기회 상세로 이동합니다."
            )
          ) : (
            <>
              기회를 연결하시면 발송 기록이 그 기회의 이력에 쌓이고, 단계도
              자동으로 이동합니다. 찾는 기회가 없으면{" "}
              <Link
                href="/opportunities"
                className="font-medium text-primary hover:underline"
              >
                영업 기회
              </Link>{" "}
              에서 먼저 등록해 주세요.
            </>
          )}
        </p>
      </CardContent>
    </Card>
  );
}
