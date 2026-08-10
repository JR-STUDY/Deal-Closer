"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { FileUp, Loader2, Sparkles, X } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  ATTACHMENT_ACCEPT,
  DOCUMENT_TYPES,
  DOCUMENT_TYPE_LABELS,
  MAX_ATTACHMENT_SIZE,
  TEMPLATE_SCOPES,
  TEMPLATE_SCOPE_LABELS,
  isAcceptedAttachment,
} from "@/lib/constants";

const AUTO_TYPE = "AUTO";
const MAX_PROMPT = 1000;

const DEFAULT_PROMPT =
  "업로드한 양식을 우리 팀 표준 양식으로 세팅해주세요. 거래처마다 달라지는 값은 비워두고, 자사 정보와 고정 안내문은 그대로 살려주세요.";

/**
 * 표준 양식 업로드 + AI 세팅 (PRD F-202 · F-203 · F-204).
 * 파일은 PDF·이미지·엑셀·CSV 만 받는다 (docx·hwp 는 서버가 안내 메시지로 거절).
 */
export function TemplateUploadDialog() {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [name, setName] = useState("");
  const [prompt, setPrompt] = useState(DEFAULT_PROMPT);
  const [type, setType] = useState<string>(AUTO_TYPE);
  const [scope, setScope] = useState<string>("COMMON");
  const [file, setFile] = useState<File | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const pickFile = (picked: File | null) => {
    if (!picked) return;
    if (!isAcceptedAttachment(picked.name, picked.type)) {
      toast.error(
        `지원하지 않는 형식입니다: ${picked.name} — docx·hwp 는 PDF 로 내보낸 뒤 업로드해주세요.`,
      );
      return;
    }
    if (picked.size > MAX_ATTACHMENT_SIZE) {
      toast.error("파일이 너무 큽니다. (최대 10MB)");
      return;
    }
    setFile(picked);
    if (!name.trim()) setName(picked.name.replace(/\.[^.]+$/, ""));
  };

  const handleSubmit = async () => {
    if (!prompt.trim() || submitting) return;

    setSubmitting(true);
    const formData = new FormData();
    formData.append("prompt", prompt.trim());
    if (name.trim()) formData.append("name", name.trim());
    if (type !== AUTO_TYPE) formData.append("type", type);
    formData.append("scope", scope);
    if (file) formData.append("file", file);

    try {
      const res = await fetch("/api/templates", { method: "POST", body: formData });
      const json = await res.json().catch(() => null);
      if (!res.ok) {
        toast.error(json?.error ?? "양식 세팅에 실패했습니다.");
        return;
      }
      const variableCount: number = json?.data?.template?.variables?.length ?? 0;
      toast.success(
        json?.data?.summary
          ? `${json.data.summary} (변수 ${variableCount}개)`
          : `표준 양식을 세팅했습니다. (변수 ${variableCount}개)`,
      );
      setOpen(false);
      setFile(null);
      setName("");
      setPrompt(DEFAULT_PROMPT);
      setType(AUTO_TYPE);
      router.refresh();
    } catch {
      toast.error("네트워크 오류로 양식 세팅에 실패했습니다.");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button>
          <Sparkles className="size-4" />
          양식 업로드 · AI 세팅
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>표준 양식 세팅</DialogTitle>
          <DialogDescription>
            기존에 쓰던 양식 파일을 올리면 AI 가 재사용 가능한 표준 양식으로 정리하고,
            문서마다 채워야 하는 변수 항목까지 뽑아 줍니다.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-3">
          {/* 원본 파일 */}
          <div className="space-y-1.5">
            <Label className="text-xs">기존 양식 파일 (선택)</Label>
            {file ? (
              <div className="flex min-h-11 items-center gap-2 rounded-md border bg-muted/30 px-3 py-1.5 text-sm">
                <FileUp className="size-4 shrink-0 text-muted-foreground" />
                <span className="flex-1 truncate" title={file.name}>
                  {file.name}
                </span>
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  className="size-9 shrink-0"
                  aria-label="파일 제거"
                  disabled={submitting}
                  onClick={() => setFile(null)}
                >
                  <X className="size-4" />
                </Button>
              </div>
            ) : (
              <div
                role="button"
                tabIndex={0}
                aria-label="양식 파일 선택"
                onClick={() => fileInputRef.current?.click()}
                onKeyDown={(e) => {
                  if (e.key === "Enter" || e.key === " ") {
                    e.preventDefault();
                    fileInputRef.current?.click();
                  }
                }}
                className="flex min-h-11 cursor-pointer flex-col items-center justify-center gap-1 rounded-md border border-dashed px-4 py-4 text-center text-sm transition-colors hover:bg-muted/50"
              >
                <span className="flex items-center gap-1.5 font-medium text-muted-foreground">
                  <FileUp className="size-4" />
                  양식 파일 선택
                </span>
                <span className="text-xs text-muted-foreground">
                  PDF · 이미지 · 엑셀 · CSV (docx·hwp 는 PDF 로 내보내 주세요)
                </span>
              </div>
            )}
            <input
              ref={fileInputRef}
              type="file"
              accept={ATTACHMENT_ACCEPT}
              className="sr-only"
              aria-hidden="true"
              tabIndex={-1}
              onChange={(e) => {
                pickFile(e.target.files?.[0] ?? null);
                e.target.value = "";
              }}
            />
          </div>

          <div className="grid gap-3 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label htmlFor="template-name" className="text-xs">
                양식 이름
              </Label>
              <Input
                id="template-name"
                value={name}
                onChange={(e) => setName(e.target.value.slice(0, 80))}
                disabled={submitting}
                placeholder="기본 견적서"
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="template-type" className="text-xs">
                문서 종류
              </Label>
              <Select value={type} onValueChange={setType} disabled={submitting}>
                <SelectTrigger id="template-type" className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value={AUTO_TYPE}>AI 가 판단</SelectItem>
                  {DOCUMENT_TYPES.map((t) => (
                    <SelectItem key={t} value={t}>
                      {DOCUMENT_TYPE_LABELS[t]}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="template-scope" className="text-xs">
              보관 위치
            </Label>
            <Select value={scope} onValueChange={setScope} disabled={submitting}>
              <SelectTrigger id="template-scope" className="w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {TEMPLATE_SCOPES.map((s) => (
                  <SelectItem key={s} value={s}>
                    {TEMPLATE_SCOPE_LABELS[s]}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="template-prompt" className="text-xs">
              AI 에게 남길 지시
            </Label>
            <Textarea
              id="template-prompt"
              value={prompt}
              onChange={(e) => setPrompt(e.target.value.slice(0, MAX_PROMPT))}
              maxLength={MAX_PROMPT}
              disabled={submitting}
              className="min-h-24 resize-none"
            />
          </div>
        </div>

        <DialogFooter>
          <Button onClick={handleSubmit} disabled={!prompt.trim() || submitting}>
            {submitting ? (
              <Loader2 className="size-4 animate-spin" />
            ) : (
              <Sparkles className="size-4" />
            )}
            {submitting ? "세팅 중…" : "AI 세팅 시작"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
