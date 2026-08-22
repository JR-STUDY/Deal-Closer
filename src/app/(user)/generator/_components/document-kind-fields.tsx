"use client";

import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { DOCUMENT_TYPES, DOCUMENT_TYPE_LABELS } from "@/lib/constants";
import { TemplatePicker } from "./template-picker";
import type { GenerateMode, TemplateChoice } from "./types";

/**
 * ① 무엇을 만드는가 — 생성 방식(새로 작성 / 표준 양식)과 문서 종류.
 *
 * 두 플로우의 입력이 다르므로 **먼저** 고른다. 양식 모드에서는 문서 종류를 따로 묻지 않는다 —
 * 양식이 이미 종류를 갖고 있고, 같은 사실을 두 곳에서 물으면 어느 쪽이 문서에 박히는지 알 수 없다.
 *
 * 규칙(동작)은 이 컴포넌트가 정하지 않는다 — 모드 전환 시 양식 선택을 비우는 판단은
 * 부모의 `onModeChange` 가 그대로 갖고 있다.
 */
export function DocumentKindFields({
  mode,
  onModeChange,
  templates,
  templateId,
  onTemplateChange,
  documentType,
  onDocumentTypeChange,
  autoType,
  disabled,
}: {
  mode: GenerateMode;
  onModeChange: (mode: GenerateMode) => void;
  templates: TemplateChoice[];
  /** 선택된 양식 id (미선택이면 null) */
  templateId: string | null;
  onTemplateChange: (id: string) => void;
  documentType: string;
  onDocumentTypeChange: (type: string) => void;
  /** "AI 가 판단" 을 뜻하는 값 — 폼이 서버로 보내는 규약이라 부모가 준다 */
  autoType: string;
  disabled: boolean;
}) {
  return (
    <>
      <Tabs value={mode} onValueChange={(v) => onModeChange(v as GenerateMode)}>
        <TabsList className="w-full">
          <TabsTrigger value="blank" disabled={disabled} className="flex-1">
            새로 작성
          </TabsTrigger>
          <TabsTrigger
            value="template"
            disabled={disabled || templates.length === 0}
            className="flex-1"
          >
            표준 양식으로
          </TabsTrigger>
        </TabsList>
      </Tabs>

      {mode === "template" ? (
        <TemplatePicker
          templates={templates}
          value={templateId}
          onChange={onTemplateChange}
          disabled={disabled}
        />
      ) : (
        <div className="space-y-1.5">
          <Label htmlFor="type-select" className="text-xs">
            문서 종류
          </Label>
          <Select
            value={documentType}
            onValueChange={onDocumentTypeChange}
            disabled={disabled}
          >
            <SelectTrigger id="type-select" className="w-full">
              <SelectValue placeholder="AI 가 판단" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={autoType}>AI 가 판단</SelectItem>
              {DOCUMENT_TYPES.map((type) => (
                <SelectItem key={type} value={type}>
                  {DOCUMENT_TYPE_LABELS[type]}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      )}
    </>
  );
}
