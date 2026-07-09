"use client";

import { useState } from "react";
import { Sparkles, MessageSquareText } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { CREDITS_PER_GENERATION } from "@/lib/constants";

const MAX_LENGTH = 2000;

const EXAMPLES = [
  "A사에 서버 인스턴스 5대와 유지보수 1년 포함한 견적서",
  "B사 신규 프로젝트를 위한 표준 비밀유지계약서(NDA)",
  "기존 유지보수 계약의 수량 20% 증설에 대한 변경 합의서",
];

/** AI 대화형 문서 생성기 입력 폼 (클라이언트 전용 상태) */
export function GeneratorForm() {
  const [prompt, setPrompt] = useState("");

  const handleGenerate = () => {
    if (!prompt.trim()) return;
    toast.success(
      `AI 초안 생성을 시작합니다 (데모). ${CREDITS_PER_GENERATION} 크레딧이 사용됩니다.`,
    );
  };

  return (
    <div className="mx-auto flex max-w-2xl flex-col gap-6">
      <Card>
        <CardHeader className="items-center text-center">
          <CardTitle className="text-xl">
            어떤 문서를 만들어 드릴까요?
          </CardTitle>
          <CardDescription className="max-w-md">
            입력하신 데이터는 안전하게 보호되며, AI 학습에 사용되지 않습니다.
            자연어로 필요하신 내용을 자유롭게 적어주세요.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          <Textarea
            value={prompt}
            onChange={(e) => setPrompt(e.target.value.slice(0, MAX_LENGTH))}
            maxLength={MAX_LENGTH}
            placeholder="예: A사에 서버 인스턴스 5대와 유지보수 1년 포함한 견적서 작성해줘"
            className="min-h-40 resize-none text-base"
          />
          <div className="flex items-center justify-between gap-3">
            <span className="text-xs tabular-nums text-muted-foreground">
              {prompt.length.toLocaleString("ko-KR")} /{" "}
              {MAX_LENGTH.toLocaleString("ko-KR")}
            </span>
            <Button onClick={handleGenerate} disabled={!prompt.trim()}>
              <Sparkles className="size-4" />
              AI 초안 생성 시작
            </Button>
          </div>
        </CardContent>
      </Card>

      <div>
        <p className="mb-3 flex items-center gap-1.5 text-sm font-medium text-muted-foreground">
          <MessageSquareText className="size-4" />
          이렇게 말해보세요
        </p>
        <div className="grid gap-3 sm:grid-cols-3">
          {EXAMPLES.map((example) => (
            <Card
              key={example}
              role="button"
              tabIndex={0}
              onClick={() => setPrompt(example)}
              onKeyDown={(e) => {
                if (e.key === "Enter" || e.key === " ") {
                  e.preventDefault();
                  setPrompt(example);
                }
              }}
              className="cursor-pointer transition-colors hover:bg-muted/50"
            >
              <CardContent className="text-sm leading-relaxed">
                {example}
              </CardContent>
            </Card>
          ))}
        </div>
      </div>
    </div>
  );
}
