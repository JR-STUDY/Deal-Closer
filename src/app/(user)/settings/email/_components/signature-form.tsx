"use client";

import { useDeferredValue, useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { MAX_SIGNATURE_LENGTH } from "@/lib/constants";
import { SignaturePreview } from "@/components/signature-preview";

/**
 * 메일 서명 편집 폼 — 저장한 서명은 발송 화면에서 본문 하단에 추가된다.
 * 저장된 값과 비교해 변경이 있을 때만 저장 버튼을 활성화한다.
 */
export function SignatureForm({
  initialSignature,
}: {
  initialSignature: string;
}) {
  const [signature, setSignature] = useState(() => initialSignature);
  const [saved, setSaved] = useState(() => initialSignature);
  const [isSaving, setIsSaving] = useState(false);

  const isDirty = signature !== saved;
  // 미리보기는 지연값으로 렌더 — 큰 HTML 편집 시 키 입력마다 iframe 리로드되는 부담 완화
  const previewSignature = useDeferredValue(signature);

  const handleSave = async () => {
    setIsSaving(true);
    try {
      const res = await fetch("/api/signature", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ signature }),
      });
      const json = await res.json().catch(() => null);
      if (!res.ok || !json) {
        toast.error(json?.error ?? "저장에 실패했습니다.");
        return;
      }
      const next = (json.data?.signature as string) ?? "";
      setSignature(next);
      setSaved(next);
      toast.success("메일 서명을 저장했습니다.");
    } catch {
      toast.error("저장에 실패했습니다.");
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <div className="space-y-3">
      <Label htmlFor="signature" className="sr-only">
        메일 서명
      </Label>
      <Textarea
        id="signature"
        value={signature}
        maxLength={MAX_SIGNATURE_LENGTH}
        className="min-h-32 font-mono text-xs"
        placeholder="일반 텍스트 또는 HTML 서명을 입력·붙여넣으세요.&#10;예) 홍길동 | 영업팀&#10;SpecFlow AI&#10;010-1234-5678"
        onChange={(e) => setSignature(e.target.value)}
      />
      <p className="text-xs text-muted-foreground">
        일반 텍스트와 HTML 서명을 모두 지원합니다. HTML 서명은 아래
        미리보기로 실제 모습을 확인할 수 있습니다.
      </p>

      {previewSignature.trim() ? (
        <div className="space-y-1.5">
          <p className="text-xs font-medium text-muted-foreground">미리보기</p>
          <div className="rounded-lg border bg-muted/30 p-3">
            <SignaturePreview signature={previewSignature} />
          </div>
        </div>
      ) : null}

      <div className="flex items-center justify-end gap-3">
        {isDirty ? (
          <span className="text-xs text-muted-foreground" role="status">
            저장되지 않은 변경사항이 있습니다
          </span>
        ) : null}
        <Button onClick={handleSave} disabled={isSaving || !isDirty}>
          {isSaving ? "저장 중…" : "서명 저장"}
        </Button>
      </div>
    </div>
  );
}
