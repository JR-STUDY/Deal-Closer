"use client";

import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import {
  TEMPLATE_BODY_MAX,
  TEMPLATE_NAME_MAX,
  TEMPLATE_SUBJECT_MAX,
  TEMPLATE_VARIABLES,
} from "@/lib/email-template";

type TemplateFieldsProps = {
  name: string;
  subject: string;
  body: string;
  shared: boolean;
  onNameChange: (value: string) => void;
  onSubjectChange: (value: string) => void;
  onBodyChange: (value: string) => void;
  onSharedChange: (value: boolean) => void;
  /** 팀 공용 템플릿 수정 시 공유 스위치를 잠근다 (개인화로 팀 접근 상실 방지) */
  lockShared?: boolean;
  /** 본문 textarea 높이 (전체화면 편집은 더 크게) */
  bodyClassName?: string;
};

/**
 * 메일 템플릿 편집 필드(이름·제목·본문·공유 범위) 공용 프레젠테이션.
 * 값·변경 핸들러를 부모가 소유하는 controlled 컴포넌트 —
 * 발송 화면의 저장 다이얼로그와 전체화면 편집기가 함께 사용한다.
 */
export function TemplateFields({
  name,
  subject,
  body,
  shared,
  onNameChange,
  onSubjectChange,
  onBodyChange,
  onSharedChange,
  lockShared = false,
  bodyClassName = "min-h-40",
}: TemplateFieldsProps) {
  return (
    <div className="space-y-4">
      <div className="space-y-1.5">
        <Label htmlFor="template-name">템플릿 이름</Label>
        <Input
          id="template-name"
          value={name}
          maxLength={TEMPLATE_NAME_MAX}
          placeholder="예: 견적서 안내 (표준)"
          onChange={(e) => onNameChange(e.target.value)}
        />
      </div>

      <div className="space-y-1.5">
        <Label htmlFor="template-subject">메일 제목</Label>
        <Input
          id="template-subject"
          value={subject}
          maxLength={TEMPLATE_SUBJECT_MAX}
          placeholder="[{{문서종류}}] {{거래처}}님께 드리는 {{문서제목}}"
          onChange={(e) => onSubjectChange(e.target.value)}
        />
      </div>

      <div className="space-y-1.5">
        <Label htmlFor="template-body">메일 본문</Label>
        <Textarea
          id="template-body"
          value={body}
          maxLength={TEMPLATE_BODY_MAX}
          className={bodyClassName}
          placeholder="안녕하세요, {{거래처}} 담당자님. …"
          onChange={(e) => onBodyChange(e.target.value)}
        />
        <p className="text-xs text-muted-foreground">
          변수를 넣으면 발송 시 현재 문서 값으로 자동 치환됩니다:{" "}
          {TEMPLATE_VARIABLES.map((v, i) => (
            <span key={v.token}>
              {i > 0 ? " · " : ""}
              <code className="rounded bg-muted px-1 py-0.5 text-foreground">
                {`{{${v.token}}}`}
              </code>
            </span>
          ))}
        </p>
      </div>

      <div className="flex items-center justify-between rounded-lg border p-3">
        <div className="space-y-0.5 pr-4">
          <Label htmlFor="template-shared" className="font-medium">
            팀 공용으로 공유
          </Label>
          <p className="text-xs text-muted-foreground">
            {lockShared
              ? "팀 공용 템플릿입니다. 팀원 전체가 사용 중이라 공유 범위는 변경할 수 없습니다."
              : "켜면 조직의 모든 팀원이 사용·수정할 수 있습니다. 끄면 나만 보는 개인 템플릿입니다."}
          </p>
        </div>
        <Switch
          id="template-shared"
          checked={shared}
          disabled={lockShared}
          onCheckedChange={onSharedChange}
        />
      </div>
    </div>
  );
}
