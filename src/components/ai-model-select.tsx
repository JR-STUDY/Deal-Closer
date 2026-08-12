"use client";

import { useMemo } from "react";
import { Sparkles } from "lucide-react";
import {
  AI_LIVE_PROVIDERS,
  PROVIDER_LABELS,
  TIER_LABELS,
  type AiLiveProvider,
  type AiModelOption,
} from "@/lib/ai/models";
import { Badge } from "@/components/ui/badge";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectLabel,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

type Props = {
  /** 선택 가능한 모델 (서버가 키 설정된 프로바이더만 내려준다) */
  models: AiModelOption[];
  value: string;
  onChange: (modelId: string) => void;
  disabled?: boolean;
  /** 목 프로바이더로 동작 중 — 실제 호출이 아님을 알린다 */
  mock?: boolean;
  /** 라벨을 숨기고 컴팩트하게 (다이얼로그 안에서) */
  compact?: boolean;
  id?: string;
};

/**
 * AI 모델 선택기 — 문서 생성·양식 세팅·부분 재작성에서 공용으로 쓴다.
 * 프로바이더별로 그룹을 나눠 Claude / GPT / Gemini 를 한눈에 고르게 한다.
 */
export function AiModelSelect({
  models,
  value,
  onChange,
  disabled,
  mock,
  compact,
  id = "ai-model",
}: Props) {
  // 프로바이더별로 묶는다 (카탈로그 순서 = 고급→저가 유지)
  const grouped = useMemo(
    () =>
      AI_LIVE_PROVIDERS.map((provider) => ({
        provider,
        options: models.filter((m) => m.provider === provider),
      })).filter((group) => group.options.length > 0),
    [models],
  );

  const selected = models.find((m) => m.id === value);

  if (models.length === 0) {
    return (
      <p className="text-sm text-muted-foreground">
        사용할 수 있는 AI 모델이 없습니다. 관리자에게 API 키 설정을 요청해주세요.
      </p>
    );
  }

  return (
    <div className={compact ? "space-y-1.5" : "space-y-2"}>
      {!compact && (
        <div className="flex items-center gap-2">
          <Label htmlFor={id}>AI 모델</Label>
          {mock && (
            <Badge variant="outline" className="gap-1 text-xs font-normal">
              <Sparkles className="size-3" />
              목 모드 — 실제 호출 안 함
            </Badge>
          )}
        </div>
      )}

      <Select value={value} onValueChange={onChange} disabled={disabled}>
        <SelectTrigger id={id} className="w-full">
          <SelectValue placeholder="모델을 선택해주세요" />
        </SelectTrigger>
        <SelectContent>
          {grouped.map(({ provider, options }) => (
            <SelectGroup key={provider}>
              <SelectLabel>{PROVIDER_LABELS[provider as AiLiveProvider]}</SelectLabel>
              {options.map((option) => (
                <SelectItem key={option.id} value={option.id}>
                  <span className="flex items-center gap-2">
                    {option.label}
                    <span className="text-xs text-muted-foreground">
                      {TIER_LABELS[option.tier]}
                    </span>
                  </span>
                </SelectItem>
              ))}
            </SelectGroup>
          ))}
        </SelectContent>
      </Select>

      {selected && (
        <p className="text-xs text-muted-foreground">{selected.description}</p>
      )}
    </div>
  );
}
