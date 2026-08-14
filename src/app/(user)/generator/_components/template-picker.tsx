"use client";

import { useMemo, useState } from "react";
import { FileStack, Search } from "lucide-react";
import {
  DOCUMENT_TYPE_LABELS,
  TEMPLATE_SCOPE_LABELS,
  type DocumentType,
  type TemplateScope,
} from "@/lib/constants";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import type { TemplateChoice } from "./types";

/**
 * 표준 양식 선택기 (F-211).
 *
 * 드롭다운 대신 보관함 피커(DocumentPicker)와 같은 형태로 맞춘다 — 양식은
 * 종류·범위·변수 목록까지 봐야 고를 수 있는데 한 줄 드롭다운으로는 그게 안 보인다.
 * 단일 선택이므로 고르면 바로 닫힌다.
 */
export function TemplatePicker({
  templates,
  value,
  onChange,
  disabled,
}: {
  templates: TemplateChoice[];
  /** 선택된 양식 id. 없으면 null */
  value: string | null;
  onChange: (templateId: string) => void;
  disabled?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return templates;
    return templates.filter((t) => t.name.toLowerCase().includes(q));
  }, [templates, query]);

  const selected = templates.find((t) => t.id === value) ?? null;

  const pick = (id: string) => {
    onChange(id);
    setOpen(false);
    setQuery("");
  };

  return (
    <div className="space-y-2">
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogTrigger asChild>
          <Button
            type="button"
            variant="outline"
            className="w-full justify-start"
            disabled={disabled || templates.length === 0}
          >
            <FileStack className="size-4" />
            {selected ? "다른 양식 선택" : "표준 양식 불러오기"}
          </Button>
        </DialogTrigger>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>표준 양식 선택</DialogTitle>
            <DialogDescription>
              양식의 레이아웃·문구·공급자 정보는 그대로 두고 값만 채웁니다.
              문서 종류도 양식을 따릅니다.
            </DialogDescription>
          </DialogHeader>

          <div className="relative">
            <Search className="pointer-events-none absolute top-1/2 left-2.5 size-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="양식 이름 검색"
              className="pl-8"
              aria-label="표준 양식 검색"
            />
          </div>

          <ul className="max-h-72 space-y-1.5 overflow-y-auto">
            {filtered.length === 0 ? (
              <li className="py-8 text-center text-sm text-muted-foreground">
                표준 양식이 없습니다.
              </li>
            ) : (
              filtered.map((template) => {
                const checked = template.id === value;
                const required = template.variables.filter((v) => v.required);
                return (
                  <li key={template.id}>
                    <button
                      type="button"
                      onClick={() => pick(template.id)}
                      aria-pressed={checked}
                      className={`w-full space-y-1 rounded-md border px-3 py-2 text-left transition-colors ${
                        checked
                          ? "border-primary bg-primary/5"
                          : "hover:bg-muted/50"
                      }`}
                    >
                      <div className="flex items-center gap-2">
                        <span className="flex-1 truncate font-medium">
                          {template.name}
                        </span>
                        <Badge variant="secondary">
                          {DOCUMENT_TYPE_LABELS[template.type as DocumentType] ??
                            template.type}
                        </Badge>
                      </div>
                      <p className="text-xs text-muted-foreground">
                        {TEMPLATE_SCOPE_LABELS[template.scope as TemplateScope] ??
                          template.scope}
                        {required.length > 0
                          ? ` · 채울 항목 ${required.map((v) => v.label).join(", ")}`
                          : " · 필수 항목 없음"}
                      </p>
                    </button>
                  </li>
                );
              })
            )}
          </ul>
        </DialogContent>
      </Dialog>

      {selected ? (
        <div className="space-y-1 rounded-md border bg-muted/30 px-3 py-2">
          <div className="flex items-center gap-2">
            <FileStack className="size-4 shrink-0 text-muted-foreground" />
            <span className="flex-1 truncate font-medium" title={selected.name}>
              {selected.name}
            </span>
            <Badge variant="secondary">
              {DOCUMENT_TYPE_LABELS[selected.type as DocumentType] ??
                selected.type}
            </Badge>
          </div>
          {selected.variables.some((v) => v.required) && (
            <p className="text-xs text-muted-foreground">
              이 양식의 필수 항목:{" "}
              <span className="font-medium text-foreground">
                {selected.variables
                  .filter((v) => v.required)
                  .map((v) => v.label)
                  .join(", ")}
              </span>{" "}
              — 아래 요청 내용에 포함해주세요.
            </p>
          )}
        </div>
      ) : (
        <p className="text-xs text-muted-foreground">
          {templates.length === 0
            ? "표준 양식이 없습니다. 문서 보관함 › 표준 양식에서 먼저 만들어주세요."
            : "양식을 고르면 문서 종류는 양식을 따릅니다."}
        </p>
      )}
    </div>
  );
}
