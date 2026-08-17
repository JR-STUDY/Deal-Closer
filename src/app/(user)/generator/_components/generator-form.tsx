"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import {
  Sparkles,
  MessageSquareText,
  Paperclip,
  Target,
  X,
  FileText,
  FolderOpen,
  Loader2,
} from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { DocTypeBadge } from "@/components/status-badge";
import {
  MAX_ATTACHMENTS,
  MAX_ATTACHMENT_SIZE,
  MAX_ATTACHMENTS_TOTAL_SIZE,
  ATTACHMENT_ACCEPT,
  isAcceptedAttachment,
  DOCUMENT_TYPES,
  DOCUMENT_TYPE_LABELS,
  TEMPLATE_SCOPE_LABELS,
  type DocumentType,
  type TemplateScope,
} from "@/lib/constants";
import { formatKRW } from "@/lib/format";
import { DocumentPicker, type LibraryDoc } from "./document-picker";
import { AiModelSelect } from "@/components/ai-model-select";
import type { AiModelOption } from "@/lib/ai/models";

/** 불러올 수 있는 표준 양식 (F-211) */
export type TemplateChoice = {
  id: string;
  name: string;
  type: string;
  scope: string;
  variables: { key: string; label: string; sample: string | null; required: boolean }[];
};

/** 계약서의 소스로 고를 수 있는 확정 견적서 (F-213) */
export type ConfirmedQuote = {
  id: string;
  title: string;
  clientName: string | null;
  amount: number;
  version: number;
};

/** 문서 종류 미지정 = AI 가 프롬프트를 보고 판단 */
const AUTO_TYPE = "AUTO";
/** 양식 미선택 = 양식 없이 새로 구성 */
const NO_TEMPLATE = "NONE";

const MAX_LENGTH = 2000;

/** 데모 일괄 변환 시나리오를 트리거하는 예시 프롬프트 (폴더 첨부와 함께 사용) */
const FOLDER_SCENARIO_PROMPT =
  "이전에 쓰던 견적서 양식을 첨부해, 같은 형식으로 새로 만들어줘 (파일 첨부)";

const EXAMPLES = [
  "A사에 서버 인스턴스 5대와 유지보수 1년 포함한 견적서",
  "협력사 견적서 기준으로 마진 20%를 붙인 견적서 (파일 첨부)",
  FOLDER_SCENARIO_PROMPT,
];

/** 바이트 크기를 사람이 읽는 형태로 */
function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes}B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)}KB`;
  return `${(bytes / 1024 / 1024).toFixed(1)}MB`;
}

/** 만든 문서를 붙일 영업 기회 (기회 상세에서 "문서 작성"으로 들어온 경우, 기회-2) */
export type GeneratorOpportunity = {
  id: string;
  name: string;
  accountName: string;
};

/** AI 대화형 문서 생성기 입력 폼 (클라이언트 전용 상태) */
export function GeneratorForm({
  libraryDocuments,
  templates,
  confirmedQuotes,
  initialTemplateId,
  models,
  defaultModel,
  mockProvider,
  opportunity,
}: {
  libraryDocuments: LibraryDoc[];
  templates: TemplateChoice[];
  confirmedQuotes: ConfirmedQuote[];
  /** 표준 양식 화면에서 넘어온 경우 미리 선택할 양식 (?template=) */
  initialTemplateId?: string | null;
  /** 선택 가능한 AI 모델 (키가 설정된 프로바이더만) */
  models: AiModelOption[];
  defaultModel: string;
  /** 목 프로바이더로 동작 중 */
  mockProvider: boolean;
  /** 있으면 생성한 문서를 이 기회에 연결한다. 없으면 평소처럼 보관함에만 담긴다. */
  opportunity: GeneratorOpportunity | null;
}) {
  const router = useRouter();
  const [prompt, setPrompt] = useState("");
  // 문서 설정 (F-211 · F-213)
  const [templateId, setTemplateId] = useState<string>(
    initialTemplateId ?? NO_TEMPLATE,
  );
  const [documentType, setDocumentType] = useState<string>(AUTO_TYPE);
  const [model, setModel] = useState<string>(defaultModel);
  const [sourceQuoteId, setSourceQuoteId] = useState<string>(NO_TEMPLATE);
  const [clientName, setClientName] = useState("");
  const [clientContact, setClientContact] = useState("");
  const [clientEmail, setClientEmail] = useState("");
  const [files, setFiles] = useState<File[]>([]);
  const [folderAttach, setFolderAttach] = useState<{
    name: string;
    fileNames: string[];
  } | null>(null);
  const [refIds, setRefIds] = useState<string[]>([]);
  const [isDragging, setIsDragging] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const folderInputRef = useRef<HTMLInputElement>(null);

  // 폴더 선택 input 은 시스템 창(Finder)이 폴더를 고르도록 webkitdirectory 를 지정
  const setFolderPicker = (el: HTMLInputElement | null) => {
    folderInputRef.current = el;
    if (el) {
      el.setAttribute("webkitdirectory", "");
      el.setAttribute("directory", "");
    }
  };

  // 선택된 참고 문서 (id → 원본 메타)
  const selectedRefs = refIds
    .map((id) => libraryDocuments.find((d) => d.id === id))
    .filter((d): d is LibraryDoc => Boolean(d));

  const selectedTemplate =
    templateId === NO_TEMPLATE
      ? null
      : (templates.find((t) => t.id === templateId) ?? null);

  // 양식을 고르면 그 양식의 문서 종류를 따른다 (수동 선택이 있으면 그 값 우선)
  const effectiveType =
    documentType !== AUTO_TYPE ? documentType : (selectedTemplate?.type ?? AUTO_TYPE);

  // 확정 견적서 소스 선택은 계약서를 만들 때만 의미가 있다 (F-213)
  const showQuoteSource =
    effectiveType === "CONTRACT" && confirmedQuotes.length > 0;

  const requiredVariables = (selectedTemplate?.variables ?? []).filter(
    (v) => v.required,
  );

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
  const openFolderPicker = () => folderInputRef.current?.click();

  /** 끌어다 놓은 폴더의 최상위 파일명을 읽어 "폴더 첨부" 상태로 보관한다 (내용 무관) */
  const readFolderEntry = (dir: FileSystemDirectoryEntry) => {
    const reader = dir.createReader();
    const names: string[] = [];
    const readChunk = () => {
      reader.readEntries(
        (entries) => {
          if (entries.length === 0) {
            const fileNames = names
              .filter((n) => !n.startsWith("."))
              .slice(0, 200);
            if (fileNames.length === 0) {
              toast.error("폴더에 변환할 파일이 없습니다.");
              return;
            }
            setFolderAttach({ name: dir.name || "가져온 양식", fileNames });
            return;
          }
          for (const en of entries) {
            if (en.isFile) names.push(en.name);
          }
          readChunk(); // readEntries 는 청크로 반환 — 빌 때까지 반복
        },
        () => toast.error("폴더를 읽지 못했습니다."),
      );
    };
    readChunk();
  };

  /** 클릭 → 시스템 창에서 고른 폴더를 "폴더 첨부" 로 보관 (webkitdirectory FileList) */
  const handleFolderPick = (list: FileList | null) => {
    if (!list || list.length === 0) return;
    const arr = Array.from(list);
    const rel = arr[0].webkitRelativePath ?? "";
    const folderName = rel.includes("/") ? rel.split("/")[0] : "가져온 양식";
    const fileNames = arr
      .map((f) => f.name)
      .filter((n) => n && !n.startsWith("."))
      .slice(0, 200);
    if (fileNames.length === 0) {
      toast.error("폴더에 변환할 파일이 없습니다.");
      return;
    }
    setFolderAttach({ name: folderName, fileNames });
  };

  /** 폴더명+파일명을 세션에 담고 데모 변환 페이지로 이동 */
  const goToBatch = (folderName: string, fileNames: string[]) => {
    try {
      sessionStorage.setItem(
        "batch-convert",
        JSON.stringify({
          folderName: folderName || "가져온 양식",
          fileNames,
        }),
      );
    } catch {
      /* 세션 저장 실패는 무시 */
    }
    router.push("/generator/batch");
  };

  const handleGenerate = async () => {
    if (!prompt.trim() || isSubmitting) return;

    // 데모 트리거: 폴더가 첨부됐고 프롬프트가 지정 예시면 → 목업 일괄 변환 시나리오
    if (folderAttach && prompt.trim() === FOLDER_SCENARIO_PROMPT) {
      goToBatch(folderAttach.name, folderAttach.fileNames);
      return;
    }

    setIsSubmitting(true);

    const formData = new FormData();
    formData.append("prompt", prompt.trim());
    for (const file of files) {
      formData.append("files", file);
    }
    for (const id of refIds) {
      formData.append("referenceIds", id);
    }
    // 표준 양식 불러오기 (F-211)
    if (templateId !== NO_TEMPLATE) {
      formData.append("templateId", templateId);
    }
    if (effectiveType !== AUTO_TYPE) {
      formData.append("documentType", effectiveType);
    }
    // 확정 견적서를 소스로 계약서 생성 (F-213)
    if (showQuoteSource && sourceQuoteId !== NO_TEMPLATE) {
      formData.append("sourceDocumentId", sourceQuoteId);
    }
    if (model) formData.append("model", model);
    if (clientName.trim()) formData.append("clientName", clientName.trim());
    if (clientContact.trim()) formData.append("clientContact", clientContact.trim());
    if (clientEmail.trim()) formData.append("clientEmail", clientEmail.trim());
    // 기회 상세에서 들어왔다면 만든 문서를 그 기회에 연결한다 (기회-2).
    // 연결 여부·권한은 서버가 orgId 로 다시 확인한다 — 여기 값은 그대로 믿지 않는다.
    if (opportunity) {
      formData.append("opportunityId", opportunity.id);
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

      // 생성 요약(무엇을 어떻게 만들었는지)을 그대로 보여준다.
      // 실제로 연결됐는지는 서버 응답으로 판단한다 — 요청에 실어 보낸 값이 아니라
      // 서버가 확인해 되돌려준 값이라야 "연결됐다"고 말할 수 있다.
      const linkedOpportunityId: string | null =
        json?.data?.opportunityId ?? null;
      const summary: string = json?.data?.summary ?? "AI 초안을 생성했습니다.";
      toast.success(
        linkedOpportunityId && opportunity
          ? `${summary} ‘${opportunity.name}’ 기회에 연결했습니다.`
          : summary,
      );
      router.push(`/editor/${documentId}`);
      // 성공 시 페이지 이동하므로 isSubmitting 을 유지해 중복 제출을 막는다.
    } catch {
      toast.error("네트워크 오류로 생성에 실패했습니다.");
      setIsSubmitting(false);
    }
  };

  return (
    <div className="mx-auto flex max-w-2xl flex-col gap-6">
      {/* 어느 기회에 붙을 문서인지 먼저 알린다 (기회-2) — 만들고 나서야 알게 되면 늦다 */}
      {opportunity ? (
        <div className="flex flex-wrap items-center gap-x-2 gap-y-1 rounded-md border bg-muted/30 px-4 py-3 text-sm">
          <Target className="size-4 shrink-0 text-primary" aria-hidden="true" />
          <span>
            <span className="font-medium">{opportunity.name}</span>
            <span className="text-muted-foreground">
              {" "}
              · {opportunity.accountName}
            </span>
          </span>
          <span className="text-muted-foreground">
            기회에 연결할 문서를 만듭니다.
          </span>
          <Link
            href={`/opportunities/${opportunity.id}`}
            className="ml-auto shrink-0 rounded text-xs text-muted-foreground transition-colors hover:text-primary hover:underline focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
          >
            기회로 돌아가기
          </Link>
        </div>
      ) : null}

      <Card>
        <CardHeader className="items-center text-center">
          <CardTitle className="text-xl">
            어떤 문서를 만들어 드릴까요?
          </CardTitle>
          <CardDescription className="max-w-lg text-pretty">
            입력하신 데이터는 안전하게 보호되며, AI 학습에 사용되지 않습니다.
            <br />
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

          {/* 문서 설정 — AI 모델 · 표준 양식 불러오기(F-211) · 문서 종류 · 거래처 정보 */}
          <div className="space-y-3 rounded-md border bg-muted/20 p-3">
            <AiModelSelect
              models={models}
              value={model}
              onChange={setModel}
              disabled={isSubmitting}
              mock={mockProvider}
            />

            <div className="grid gap-3 sm:grid-cols-2">
              <div className="space-y-1.5">
                <Label htmlFor="template-select" className="text-xs">
                  표준 양식 불러오기
                </Label>
                <Select
                  value={templateId}
                  onValueChange={setTemplateId}
                  disabled={isSubmitting}
                >
                  <SelectTrigger id="template-select" className="w-full">
                    <SelectValue placeholder="양식 없이 생성" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value={NO_TEMPLATE}>양식 없이 생성</SelectItem>
                    {templates.map((template) => (
                      <SelectItem key={template.id} value={template.id}>
                        {template.name} ·{" "}
                        {DOCUMENT_TYPE_LABELS[template.type as DocumentType] ??
                          template.type}
                        {" · "}
                        {TEMPLATE_SCOPE_LABELS[template.scope as TemplateScope] ??
                          template.scope}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="type-select" className="text-xs">
                  문서 종류
                </Label>
                <Select
                  value={documentType}
                  onValueChange={setDocumentType}
                  disabled={isSubmitting}
                >
                  <SelectTrigger id="type-select" className="w-full">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value={AUTO_TYPE}>AI 가 판단</SelectItem>
                    {DOCUMENT_TYPES.map((type) => (
                      <SelectItem key={type} value={type}>
                        {DOCUMENT_TYPE_LABELS[type]}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>

            {/* 계약서: 확정된 견적서를 소스로 지정 (F-213) */}
            {showQuoteSource && (
              <div className="space-y-1.5">
                <Label htmlFor="quote-select" className="text-xs">
                  근거가 되는 확정 견적서
                </Label>
                <Select
                  value={sourceQuoteId}
                  onValueChange={setSourceQuoteId}
                  disabled={isSubmitting}
                >
                  <SelectTrigger id="quote-select" className="w-full">
                    <SelectValue placeholder="선택 안 함" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value={NO_TEMPLATE}>선택 안 함</SelectItem>
                    {confirmedQuotes.map((quote) => (
                      <SelectItem key={quote.id} value={quote.id}>
                        {quote.title} · v{quote.version} · {formatKRW(quote.amount)}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <p className="text-xs text-muted-foreground">
                  선택한 견적서의 품목·금액을 그대로 계약 조건에 반영합니다.
                </p>
              </div>
            )}

            <div className="grid gap-3 sm:grid-cols-3">
              <div className="space-y-1.5">
                <Label htmlFor="client-name" className="text-xs">
                  고객사명
                </Label>
                <Input
                  id="client-name"
                  value={clientName}
                  onChange={(e) => setClientName(e.target.value)}
                  disabled={isSubmitting}
                  placeholder="(주)글로벌커머스"
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="client-contact" className="text-xs">
                  수신 담당자
                </Label>
                <Input
                  id="client-contact"
                  value={clientContact}
                  onChange={(e) => setClientContact(e.target.value)}
                  disabled={isSubmitting}
                  placeholder="김레인 책임"
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="client-email" className="text-xs">
                  담당자 이메일
                </Label>
                <Input
                  id="client-email"
                  type="email"
                  value={clientEmail}
                  onChange={(e) => setClientEmail(e.target.value)}
                  disabled={isSubmitting}
                  placeholder="rain@example.com"
                />
              </div>
            </div>

            {/* 선택한 양식의 필수 변수 안내 (F-204) */}
            {requiredVariables.length > 0 && (
              <p className="text-xs text-muted-foreground">
                이 양식의 필수 항목:{" "}
                <span className="font-medium text-foreground">
                  {requiredVariables.map((v) => v.label).join(", ")}
                </span>{" "}
                — 위 입력값이나 요청 내용에 포함해주세요.
              </p>
            )}
          </div>

          {/* 파일/폴더 첨부 — 클릭 시 [파일 선택 / 폴더 선택] 메뉴, 드롭도 지원 */}
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <div
                role="button"
                tabIndex={0}
                aria-label="파일 또는 폴더 첨부"
                onDragOver={(e) => {
                  e.preventDefault();
                  setIsDragging(true);
                }}
                onDragLeave={() => setIsDragging(false)}
                onDrop={(e) => {
                  e.preventDefault();
                  setIsDragging(false);
                  // 폴더를 끌어다 놓으면 "폴더 첨부"로 보관 (트리거 판정은 생성 버튼에서)
                  for (const item of Array.from(e.dataTransfer.items)) {
                    const entry = item.webkitGetAsEntry?.();
                    if (entry?.isDirectory) {
                      readFolderEntry(entry as FileSystemDirectoryEntry);
                      return;
                    }
                  }
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
              </div>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-48">
              <DropdownMenuItem onClick={openFilePicker}>
                <FileText className="size-4" />
                파일 선택
              </DropdownMenuItem>
              <DropdownMenuItem onClick={openFolderPicker}>
                <FolderOpen className="size-4" />
                폴더 선택
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>

          {/* 숨은 input — 파일(일반) / 폴더(webkitdirectory) 각각 */}
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
              e.target.value = "";
            }}
          />
          <input
            ref={setFolderPicker}
            type="file"
            multiple
            className="sr-only"
            aria-hidden="true"
            tabIndex={-1}
            onChange={(e) => {
              handleFolderPick(e.target.files);
              e.target.value = "";
            }}
          />

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

          {/* 첨부된 폴더 (드롭 시 보관) */}
          {folderAttach && (
            <ul className="space-y-1.5">
              <li className="flex min-h-11 items-center gap-2 rounded-md border bg-muted/30 px-3 py-1.5 text-sm">
                <FolderOpen className="size-4 shrink-0 text-muted-foreground" />
                <span className="flex-1 truncate" title={folderAttach.name}>
                  {folderAttach.name}
                </span>
                <span className="shrink-0 text-xs tabular-nums text-muted-foreground">
                  {folderAttach.fileNames.length}개 파일
                </span>
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  className="size-9 shrink-0"
                  disabled={isSubmitting}
                  aria-label="폴더 첨부 제거"
                  onClick={() => setFolderAttach(null)}
                >
                  <X className="size-4" />
                </Button>
              </li>
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
