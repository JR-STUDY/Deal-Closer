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
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
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
} from "@/lib/constants";
import { DocumentPicker, type LibraryDoc } from "./document-picker";

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

/** AI 대화형 문서 생성기 입력 폼 (클라이언트 전용 상태) */
export function GeneratorForm({
  libraryDocuments,
}: {
  libraryDocuments: LibraryDoc[];
}) {
  const router = useRouter();
  const [prompt, setPrompt] = useState("");
  const [files, setFiles] = useState<File[]>([]);
  const [folderAttach, setFolderAttach] = useState<{
    name: string;
    fileNames: string[];
  } | null>(null);
  const [refIds, setRefIds] = useState<string[]>([]);
  const [saveAsCommon, setSaveAsCommon] = useState(false);
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
          saveAsCommon,
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
    if (saveAsCommon) {
      formData.append("saveAsCommon", "true");
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

          {/* 저장 위치 토글 — on/off 에 따라 내 문서함 ↔ 공용문서함 실시간 전환 */}
          <div className="flex items-center gap-2.5 rounded-md border bg-muted/20 px-3 py-2.5">
            <Switch
              id="save-as-common"
              checked={saveAsCommon}
              onCheckedChange={setSaveAsCommon}
              disabled={isSubmitting}
            />
            <Label
              htmlFor="save-as-common"
              className="cursor-pointer text-sm font-normal leading-snug"
            >
              <span className="font-medium">
                {(saveAsCommon ? "공용문서함" : "내 문서함") + "에 저장"}
              </span>{" "}
              <span className="text-muted-foreground">
                —{" "}
                {saveAsCommon
                  ? "팀이 함께 쓰는 공용문서함에 보관합니다"
                  : "내 문서함에 보관합니다"}
              </span>
            </Label>
          </div>

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
