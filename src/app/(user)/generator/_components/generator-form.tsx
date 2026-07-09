"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import {
  Sparkles,
  MessageSquareText,
  Paperclip,
  X,
  FileText,
  FolderOpen,
  Loader2,
} from "lucide-react";
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
import { DocTypeBadge } from "@/components/status-badge";
import {
  MAX_ATTACHMENTS,
  MAX_ATTACHMENT_SIZE,
  MAX_ATTACHMENTS_TOTAL_SIZE,
  ATTACHMENT_ACCEPT,
  isAcceptedAttachment,
} from "@/lib/constants";
import { DocumentPicker, type LibraryDoc } from "./document-picker";

const MAX_LENGTH = 2000;

const EXAMPLES = [
  "A사에 서버 인스턴스 5대와 유지보수 1년 포함한 견적서",
  "B사 신규 프로젝트를 위한 표준 비밀유지계약서(NDA)",
  "협력사 견적서 기준으로 마진 20%를 붙인 견적서 (파일 첨부)",
];

/** 바이트 크기를 사람이 읽는 형태로 */
function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes}B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)}KB`;
  return `${(bytes / 1024 / 1024).toFixed(1)}MB`;
}

/** AI 대화형 문서 생성기 입력 폼 (클라이언트 전용 상태) */
export function GeneratorForm({
  libraryDocuments,
}: {
  libraryDocuments: LibraryDoc[];
}) {
  const router = useRouter();
  const [prompt, setPrompt] = useState("");
  const [files, setFiles] = useState<File[]>([]);
  const [refIds, setRefIds] = useState<string[]>([]);
  const [isDragging, setIsDragging] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // 선택된 참고 문서 (id → 원본 메타)
  const selectedRefs = refIds
    .map((id) => libraryDocuments.find((d) => d.id === id))
    .filter((d): d is LibraryDoc => Boolean(d));

  /** 선택/드롭한 파일을 검증 후 상태에 병합 (클라이언트 1차 검증, 서버 재검증) */
  const addFiles = (incoming: FileList | File[]) => {
    const next = [...files];
    for (const file of Array.from(incoming)) {
      if (next.some((f) => f.name === file.name && f.size === file.size)) {
        continue; // 중복 무시
      }
      if (!isAcceptedAttachment(file.name, file.type)) {
        toast.error(`지원하지 않는 형식입니다: ${file.name}`);
        continue;
      }
      if (file.size > MAX_ATTACHMENT_SIZE) {
        toast.error(
          `파일이 너무 큽니다: ${file.name} (최대 ${formatBytes(MAX_ATTACHMENT_SIZE)})`,
        );
        continue;
      }
      if (next.length >= MAX_ATTACHMENTS) {
        toast.error(`첨부 파일은 최대 ${MAX_ATTACHMENTS}개까지 가능합니다.`);
        break;
      }
      next.push(file);
    }

    const total = next.reduce((sum, f) => sum + f.size, 0);
    if (total > MAX_ATTACHMENTS_TOTAL_SIZE) {
      toast.error(
        `첨부 합계가 너무 큽니다. (최대 ${formatBytes(MAX_ATTACHMENTS_TOTAL_SIZE)})`,
      );
      return;
    }
    setFiles(next);
  };

  const removeFile = (name: string, size: number) => {
    setFiles((prev) => prev.filter((f) => !(f.name === name && f.size === size)));
  };

  const openFilePicker = () => fileInputRef.current?.click();

  const handleGenerate = async () => {
    if (!prompt.trim() || isSubmitting) return;
    setIsSubmitting(true);

    const formData = new FormData();
    formData.append("prompt", prompt.trim());
    for (const file of files) {
      formData.append("files", file);
    }
    for (const id of refIds) {
      formData.append("referenceIds", id);
    }

    try {
      const res = await fetch("/api/generate", {
        method: "POST",
        body: formData,
      });
      const json = await res.json().catch(() => null);

      if (!res.ok) {
        toast.error(json?.error ?? "문서 생성에 실패했습니다.");
        setIsSubmitting(false);
        return;
      }

      const documentId: string | undefined = json?.data?.document?.id;
      if (!documentId) {
        toast.error("생성된 문서를 찾을 수 없습니다.");
        setIsSubmitting(false);
        return;
      }

      toast.success("AI 초안을 생성했습니다.");
      router.push(`/editor/${documentId}`);
      // 성공 시 페이지 이동하므로 isSubmitting 을 유지해 중복 제출을 막는다.
    } catch {
      toast.error("네트워크 오류로 생성에 실패했습니다.");
      setIsSubmitting(false);
    }
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
            disabled={isSubmitting}
            placeholder="예: 협력사에게 받은 견적서에 마진 20%를 붙여서 견적서를 만들어줘"
            className="min-h-40 resize-none text-base"
          />

          {/* 파일 첨부 (정책 VAL_*·ACC_*) */}
          <div
            role="button"
            tabIndex={0}
            aria-label="파일 첨부. 클릭하거나 파일을 끌어다 놓으세요."
            onClick={openFilePicker}
            onKeyDown={(e) => {
              if (e.key === "Enter" || e.key === " ") {
                e.preventDefault();
                openFilePicker();
              }
            }}
            onDragOver={(e) => {
              e.preventDefault();
              setIsDragging(true);
            }}
            onDragLeave={() => setIsDragging(false)}
            onDrop={(e) => {
              e.preventDefault();
              setIsDragging(false);
              if (e.dataTransfer.files.length) addFiles(e.dataTransfer.files);
            }}
            className={`flex min-h-11 cursor-pointer flex-col items-center justify-center gap-1 rounded-md border border-dashed px-4 py-4 text-center text-sm transition-colors ${
              isDragging
                ? "border-primary bg-primary/5"
                : "border-input hover:bg-muted/50"
            }`}
          >
            <span className="flex items-center gap-1.5 font-medium text-muted-foreground">
              <Paperclip className="size-4" />
              파일 첨부 (선택)
            </span>
            <span className="text-xs text-muted-foreground">
              PDF · 이미지 · 엑셀 · CSV · 최대 {MAX_ATTACHMENTS}개
            </span>
            <input
              ref={fileInputRef}
              type="file"
              multiple
              accept={ATTACHMENT_ACCEPT}
              className="sr-only"
              aria-hidden="true"
              tabIndex={-1}
              onChange={(e) => {
                if (e.target.files?.length) addFiles(e.target.files);
                e.target.value = ""; // 같은 파일 재선택 허용
              }}
            />
          </div>

          {files.length > 0 && (
            <ul className="space-y-1.5">
              {files.map((file) => (
                <li
                  key={`${file.name}-${file.size}`}
                  className="flex min-h-11 items-center gap-2 rounded-md border bg-muted/30 px-3 py-1.5 text-sm"
                >
                  <FileText className="size-4 shrink-0 text-muted-foreground" />
                  <span className="flex-1 truncate" title={file.name}>
                    {file.name}
                  </span>
                  <span className="shrink-0 text-xs tabular-nums text-muted-foreground">
                    {formatBytes(file.size)}
                  </span>
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    className="size-9 shrink-0"
                    disabled={isSubmitting}
                    aria-label={`${file.name} 첨부 제거`}
                    onClick={() => removeFile(file.name, file.size)}
                  >
                    <X className="size-4" />
                  </Button>
                </li>
              ))}
            </ul>
          )}

          {/* 문서 보관함 참고 문서 (기존 견적서 등) */}
          <DocumentPicker
            documents={libraryDocuments}
            selectedIds={refIds}
            onConfirm={setRefIds}
            disabled={isSubmitting}
          />

          {selectedRefs.length > 0 && (
            <ul className="space-y-1.5">
              {selectedRefs.map((doc) => (
                <li
                  key={doc.id}
                  className="flex min-h-11 items-center gap-2 rounded-md border bg-muted/30 px-3 py-1.5 text-sm"
                >
                  <FolderOpen className="size-4 shrink-0 text-muted-foreground" />
                  <span className="flex-1 truncate" title={doc.title}>
                    {doc.title}
                  </span>
                  <DocTypeBadge type={doc.type} />
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    className="size-9 shrink-0"
                    disabled={isSubmitting}
                    aria-label={`${doc.title} 참고 해제`}
                    onClick={() =>
                      setRefIds((prev) => prev.filter((x) => x !== doc.id))
                    }
                  >
                    <X className="size-4" />
                  </Button>
                </li>
              ))}
            </ul>
          )}

          <div className="flex items-center justify-between gap-3">
            <span className="text-xs tabular-nums text-muted-foreground">
              {prompt.length.toLocaleString("ko-KR")} /{" "}
              {MAX_LENGTH.toLocaleString("ko-KR")}
            </span>
            <Button
              onClick={handleGenerate}
              disabled={!prompt.trim() || isSubmitting}
            >
              {isSubmitting ? (
                <Loader2 className="size-4 animate-spin" />
              ) : (
                <Sparkles className="size-4" />
              )}
              {isSubmitting ? "생성 중…" : "AI 초안 생성 시작"}
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
