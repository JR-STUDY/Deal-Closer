"use client";

import { useState } from "react";
import { Loader2, Wand2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";

const MAX_LENGTH = 1000;

/** 자주 쓰는 수정 지시 예시 (클릭하면 입력창에 채운다) */
const EXAMPLES = [
  "결제조건을 30일로 변경해주세요",
  "유지보수 기간을 2년으로 늘려주세요",
  "전체 단가에 10% 할인을 적용해주세요",
  "부가세를 별도로 표기하는 요약행을 추가해주세요",
];

type Props = {
  documentId: string;
  /** 편집 중인 현재 본문 (저장 전 상태를 기준으로 수정하기 위해) */
  getContentJson: () => string;
  /** 새 버전이 만들어졌을 때 — 부모가 dirty 를 해제하고 새 버전으로 이동한다 */
  onRevised: (documentId: string) => void;
};

/**
 * AI 부분 재작성 (PRD F-215).
 * 결과는 새 버전 문서로 저장되며(F-214) 성공 시 그 버전으로 이동한다.
 */
export function AiReviseDialog({ documentId, getContentJson, onRevised }: Props) {
  const [open, setOpen] = useState(false);
  const [instruction, setInstruction] = useState("");
  const [submitting, setSubmitting] = useState(false);

  const handleSubmit = async () => {
    const value = instruction.trim();
    if (!value || submitting) return;

    setSubmitting(true);
    try {
      const res = await fetch(`/api/documents/${documentId}/revise`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ instruction: value, contentJson: getContentJson() }),
      });
      const json = await res.json().catch(() => null);

      if (!res.ok) {
        toast.error(json?.error ?? "AI 재작성에 실패했습니다.");
        return;
      }

      // 반영할 변경을 찾지 못한 경우 — 새 버전을 만들지 않는다
      if (json?.data?.changed === false) {
        toast.info(json?.data?.summary ?? "바꿀 부분을 찾지 못했습니다.");
        return;
      }

      const newId: string | undefined = json?.data?.document?.id;
      const version: number | undefined = json?.data?.document?.version;
      if (!newId) {
        toast.error("수정된 문서를 찾을 수 없습니다.");
        return;
      }

      toast.success(
        json?.data?.summary
          ? `v${version} 로 저장했습니다. ${json.data.summary}`
          : `v${version} 로 저장했습니다.`,
      );
      setOpen(false);
      setInstruction("");
      onRevised(newId);
    } catch {
      toast.error("네트워크 오류로 재작성에 실패했습니다.");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="outline" className="shrink-0">
          <Wand2 className="size-4" />
          AI 수정
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>AI 로 일부만 수정하기</DialogTitle>
          <DialogDescription>
            바꾸고 싶은 부분만 자연어로 알려주세요. 지시한 부분만 고쳐서
            <strong className="font-medium"> 새 버전</strong>으로 저장합니다.
            지금 편집 중인 내용이 그대로 반영됩니다.
          </DialogDescription>
        </DialogHeader>

        <Textarea
          value={instruction}
          onChange={(e) => setInstruction(e.target.value.slice(0, MAX_LENGTH))}
          maxLength={MAX_LENGTH}
          disabled={submitting}
          placeholder="예: 결제조건을 30일로 변경해주세요"
          className="min-h-28 resize-none"
        />

        <div className="flex flex-wrap gap-1.5">
          {EXAMPLES.map((example) => (
            <Button
              key={example}
              type="button"
              variant="secondary"
              size="sm"
              className="h-auto py-1 text-xs font-normal"
              disabled={submitting}
              onClick={() => setInstruction(example)}
            >
              {example}
            </Button>
          ))}
        </div>

        <DialogFooter>
          <span className="mr-auto self-center text-xs tabular-nums text-muted-foreground">
            {instruction.length.toLocaleString("ko-KR")} /{" "}
            {MAX_LENGTH.toLocaleString("ko-KR")}
          </span>
          <Button
            onClick={handleSubmit}
            disabled={!instruction.trim() || submitting}
          >
            {submitting ? (
              <Loader2 className="size-4 animate-spin" />
            ) : (
              <Wand2 className="size-4" />
            )}
            {submitting ? "수정 중…" : "수정 요청"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
