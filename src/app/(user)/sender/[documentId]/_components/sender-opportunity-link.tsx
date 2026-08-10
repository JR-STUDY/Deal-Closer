"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { toast } from "sonner";
import {
  OPPORTUNITY_STAGE_LABELS,
  isDocumentType,
  type OpportunityStage,
} from "@/lib/constants";
import { stageForSentDocument } from "@/lib/opportunity-transition";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

/** Radix Select 는 빈 문자열 value 를 허용하지 않아 "연결 안 함" 을 표현할 표식이 필요하다 */
const NONE = "NONE";

export type SenderOpportunityOption = {
  id: string;
  name: string;
  accountName: string;
  stage: OpportunityStage;
};

/**
 * 발송 화면의 영업 기회 연결 (F-113 · F-114).
 *
 * 연결 UI 를 **발송 화면**에 둔 이유: 단계 자동 전이가 일어나는 지점이 바로 이 화면의
 * 발송 버튼이다. 여기서 고르면 "무엇을 연결했는지 → 발송하면 어떤 단계가 되는지" 가
 * 한 화면에 붙어 있어, 담당자가 결과를 예측한 채로 보낼 수 있다.
 *
 * 연결/해제는 즉시 저장한다(PATCH). 발송 버튼과 묶으면 연결만 하고 나중에 보내는 흐름이 막힌다.
 */
export function SenderOpportunityLink({
  documentId,
  documentType,
  currentOpportunityId,
  options,
}: {
  documentId: string;
  documentType: string;
  currentOpportunityId: string | null;
  options: SenderOpportunityOption[];
}) {
  const router = useRouter();
  const [selected, setSelected] = useState<string>(
    currentOpportunityId ?? NONE,
  );
  const [isSaving, setIsSaving] = useState(false);

  const linked = options.find((option) => option.id === selected) ?? null;
  const targetStage = isDocumentType(documentType)
    ? stageForSentDocument(documentType)
    : null;

  const change = async (value: string) => {
    if (value === selected || isSaving) return;
    const previous = selected;
    setSelected(value); // 낙관적 업데이트
    setIsSaving(true);
    try {
      const res = await fetch(`/api/documents/${documentId}/opportunity`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          opportunityId: value === NONE ? null : value,
        }),
      });
      const json = await res.json().catch(() => null);
      if (!res.ok) throw new Error(json?.error ?? "저장에 실패했습니다.");
      toast.success(
        value === NONE
          ? "영업 기회 연결을 해제했습니다."
          : "영업 기회를 연결했습니다.",
      );
      router.refresh();
    } catch (error) {
      setSelected(previous); // 실패 시 원복
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
          <Select
            value={selected}
            onValueChange={change}
            disabled={isSaving || options.length === 0}
          >
            <SelectTrigger id="opportunity" className="w-full">
              <SelectValue placeholder="연결할 영업 기회를 선택하세요" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={NONE}>연결 안 함</SelectItem>
              {options.map((option) => (
                <SelectItem key={option.id} value={option.id}>
                  {option.name} · {option.accountName} (
                  {OPPORTUNITY_STAGE_LABELS[option.stage]})
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        {options.length === 0 ? (
          <p className="text-xs text-muted-foreground">
            등록된 영업 기회가 없습니다.{" "}
            <Link
              href="/opportunities"
              className="font-medium text-primary hover:underline"
            >
              영업 기회
            </Link>{" "}
            에서 먼저 기회를 등록해 주세요.
          </p>
        ) : linked ? (
          <p className="text-xs text-muted-foreground">
            {targetStage
              ? `발송하시면 ‘${linked.name}’ 의 단계가 ‘${OPPORTUNITY_STAGE_LABELS[targetStage]}’ 로 이동합니다. 이미 그 단계를 지났다면 그대로 유지됩니다.`
              : "이 문서 종류는 발송해도 단계가 바뀌지 않습니다. 발송 이력만 기회 타임라인에 쌓입니다."}
          </p>
        ) : (
          <p className="text-xs text-muted-foreground">
            기회를 연결하시면 발송 이력이 그 기회의 타임라인에 쌓이고, 단계도 자동으로
            이동합니다.
          </p>
        )}
      </CardContent>
    </Card>
  );
}
