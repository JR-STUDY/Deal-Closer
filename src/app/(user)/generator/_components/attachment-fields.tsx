"use client";

import { useRef, useState } from "react";
import { FileText, FolderOpen, Paperclip, X } from "lucide-react";
import { toast } from "sonner";
import {
  ATTACHMENT_ACCEPT,
  isAcceptedAttachment,
  MAX_ATTACHMENTS,
  MAX_ATTACHMENTS_TOTAL_SIZE,
  MAX_ATTACHMENT_SIZE,
} from "@/lib/constants";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { formatBytes, type FolderAttach } from "./types";

/**
 * 파일·폴더 첨부 영역.
 *
 * 값(files·folderAttach)은 부모가 들고 있는다 — 생성 요청을 만들 때 필요하고,
 * 폴더 첨부는 데모 일괄 변환 분기 판정에도 쓰이기 때문이다.
 * 여기서는 드래그·시스템 창·검증 같은 **입력 처리**만 맡는다.
 */
export function AttachmentFields({
  files,
  setFiles,
  folderAttach,
  setFolderAttach,
  isSubmitting,
}: {
  files: File[];
  setFiles: (files: File[]) => void;
  folderAttach: FolderAttach | null;
  setFolderAttach: (folder: FolderAttach | null) => void;
  isSubmitting?: boolean;
}) {
  const [isDragging, setIsDragging] = useState(false);
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
    setFiles(files.filter((f) => !(f.name === name && f.size === size)));
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

  return (
    <>
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
    </>
  );
}
