"use client";

import { useState } from "react";
import { ChevronDown, Save, LayoutTemplate } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  applyTemplateVariables,
  type EmailTemplateDTO,
  type TemplateContext,
} from "@/lib/email-template";
import { TemplateFormDialog } from "@/components/email-template/template-form-dialog";

type EmailTemplateToolbarProps = {
  initialTemplates: EmailTemplateDTO[];
  /** 치환 변수 값 (현재 문서 기준) */
  context: TemplateContext;
  /** "현재 내용을 템플릿으로 저장" 시 채울 현재 제목·본문 */
  currentSubject: string;
  currentBody: string;
  /** 템플릿을 불러오면 치환된 제목·본문을 발송 폼에 반영 */
  onApply: (subject: string, body: string) => void;
};

/**
 * 발송 화면의 메일 템플릿 툴바 — 저장된 템플릿 불러오기 + 현재 내용 저장.
 * 불러올 때 제목·본문의 {{변수}} 를 현재 문서 값으로 치환한다.
 */
export function EmailTemplateToolbar({
  initialTemplates,
  context,
  currentSubject,
  currentBody,
  onApply,
}: EmailTemplateToolbarProps) {
  const [templates, setTemplates] = useState(initialTemplates);
  const [saveOpen, setSaveOpen] = useState(false);

  const teamTemplates = templates.filter((t) => t.scope === "team");
  const personalTemplates = templates.filter((t) => t.scope === "personal");

  const handleLoad = (template: EmailTemplateDTO) => {
    onApply(
      applyTemplateVariables(template.subject, context),
      applyTemplateVariables(template.body, context),
    );
    toast.success(`"${template.name}" 템플릿을 불러왔습니다.`);
  };

  return (
    <div className="flex flex-wrap items-center justify-between gap-3 rounded-lg border bg-muted/40 px-4 py-3">
      <div className="flex items-center gap-2 text-sm">
        <LayoutTemplate className="size-4 text-muted-foreground" />
        <span className="font-medium">메일 템플릿</span>
        <span className="text-muted-foreground">
          저장된 문구를 불러와 빠르게 작성하세요.
        </span>
      </div>

      <div className="flex items-center gap-2">
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="outline" size="sm" disabled={templates.length === 0}>
              {templates.length === 0 ? "저장된 템플릿 없음" : "템플릿 불러오기"}
              <ChevronDown className="size-3.5" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-64">
            {teamTemplates.length > 0 ? (
              <DropdownMenuGroup>
                <DropdownMenuLabel>팀 공용</DropdownMenuLabel>
                {teamTemplates.map((template) => (
                  <DropdownMenuItem
                    key={template.id}
                    onSelect={() => handleLoad(template)}
                  >
                    <span className="truncate">{template.name}</span>
                  </DropdownMenuItem>
                ))}
              </DropdownMenuGroup>
            ) : null}

            {teamTemplates.length > 0 && personalTemplates.length > 0 ? (
              <DropdownMenuSeparator />
            ) : null}

            {personalTemplates.length > 0 ? (
              <DropdownMenuGroup>
                <DropdownMenuLabel>개인</DropdownMenuLabel>
                {personalTemplates.map((template) => (
                  <DropdownMenuItem
                    key={template.id}
                    onSelect={() => handleLoad(template)}
                  >
                    <span className="truncate">{template.name}</span>
                  </DropdownMenuItem>
                ))}
              </DropdownMenuGroup>
            ) : null}
          </DropdownMenuContent>
        </DropdownMenu>

        <Button variant="outline" size="sm" onClick={() => setSaveOpen(true)}>
          <Save className="size-3.5" />
          현재 내용 저장
        </Button>
      </div>

      {saveOpen ? (
        <TemplateFormDialog
          title="현재 내용을 템플릿으로 저장"
          description="지금 작성한 제목·본문을 템플릿으로 저장합니다. 변수를 그대로 두면 다음 발송 때 문서 값으로 치환됩니다."
          initial={{
            name: "",
            subject: currentSubject,
            body: currentBody,
            shared: false,
          }}
          onSaved={(saved) => setTemplates((prev) => [...prev, saved])}
          onClose={() => setSaveOpen(false)}
        />
      ) : null}
    </div>
  );
}
