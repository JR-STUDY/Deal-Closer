import "server-only";
import ExcelJS from "exceljs";
import {
  attachmentKind,
  isAcceptedAttachment,
  MAX_ATTACHMENTS,
  MAX_ATTACHMENT_SIZE,
  MAX_ATTACHMENTS_TOTAL_SIZE,
  type AttachmentKind,
} from "@/lib/constants";
import { unsupportedSourceMessage } from "@/lib/ai/content";

/**
 * AI 문서 생성 첨부 파일 처리 (서버 전용).
 *
 * MVP 단계에서는 파일 내용을 LLM 으로 해석하지 않는다. 다만 엑셀/CSV 는
 * 표 데이터를 텍스트로 추출해 보관한다 (추후 실제 LLM 연동 시 프롬프트에
 * 함께 넣을 수 있도록 준비). PDF/이미지는 원본 바이트만 저장한다.
 */

/** 추출 텍스트 최대 길이 (SQLite TEXT 비대 방지) */
const MAX_EXTRACTED_LENGTH = 50_000;

function clampText(text: string): string {
  const trimmed = text.trim();
  return trimmed.length > MAX_EXTRACTED_LENGTH
    ? `${trimmed.slice(0, MAX_EXTRACTED_LENGTH)}\n…(생략됨)`
    : trimmed;
}

/** 셀 값을 사람이 읽을 수 있는 문자열로 변환 */
function cellToText(value: ExcelJS.CellValue): string {
  if (value === null || value === undefined) return "";
  if (value instanceof Date) return value.toISOString();
  if (typeof value === "object") {
    // 하이퍼링크/리치텍스트/수식 등
    if ("text" in value && typeof value.text === "string") return value.text;
    if ("result" in value) return String(value.result ?? "");
    if ("richText" in value && Array.isArray(value.richText)) {
      return value.richText.map((r) => r.text).join("");
    }
    return "";
  }
  return String(value);
}

/** XLSX 바이트를 시트별 TSV 텍스트로 추출 */
async function extractXlsx(bytes: Uint8Array): Promise<string> {
  const workbook = new ExcelJS.Workbook();
  // exceljs 는 Buffer/ArrayBuffer 를 받는다
  await workbook.xlsx.load(
    bytes.buffer.slice(
      bytes.byteOffset,
      bytes.byteOffset + bytes.byteLength,
    ) as ArrayBuffer,
  );

  const parts: string[] = [];
  workbook.eachSheet((sheet) => {
    const lines: string[] = [];
    sheet.eachRow({ includeEmpty: false }, (row) => {
      const values = Array.isArray(row.values) ? row.values.slice(1) : [];
      lines.push(values.map((v) => cellToText(v as ExcelJS.CellValue)).join("\t"));
    });
    if (lines.length > 0) {
      parts.push(`# 시트: ${sheet.name}\n${lines.join("\n")}`);
    }
  });
  return parts.join("\n\n");
}

/** CSV 바이트를 UTF-8 텍스트로 디코드 */
function extractCsv(bytes: Uint8Array): string {
  return new TextDecoder("utf-8").decode(bytes);
}

/**
 * 파일 종류에 따라 텍스트를 추출한다.
 * 엑셀/CSV 만 추출하며, 그 외(PDF·이미지)는 null 을 반환한다.
 * 추출 실패 시에도 저장은 계속되도록 null 을 반환한다.
 */
export async function extractAttachmentText(
  kind: AttachmentKind,
  bytes: Uint8Array,
): Promise<string | null> {
  try {
    if (kind === "excel") return clampText(await extractXlsx(bytes));
    if (kind === "csv") return clampText(extractCsv(bytes));
    return null;
  } catch {
    // 손상/암호화 파일 등 추출 실패는 치명적이지 않다 — 원본은 그대로 저장한다.
    return null;
  }
}

/** 바이트 크기를 사람이 읽는 형태로 (에러 메시지용) */
export function formatSize(bytes: number): string {
  return `${(bytes / 1024 / 1024).toFixed(1)}MB`;
}

/**
 * 업로드 파일 목록을 검증한다 (정책 VAL_*).
 * 문제가 있으면 사용자에게 보여줄 메시지와 HTTP 상태를, 없으면 null 을 반환한다.
 * docx·hwp 처럼 변환기가 없는 형식은 대안(PDF 내보내기)을 안내한다.
 */
export function validateUploadFiles(
  files: File[],
  opts: { maxCount?: number } = {},
): { message: string; status: number } | null {
  const maxCount = opts.maxCount ?? MAX_ATTACHMENTS;
  if (files.length > maxCount) {
    return { message: `파일은 최대 ${maxCount}개까지 가능합니다.`, status: 400 };
  }

  let totalSize = 0;
  for (const file of files) {
    const unsupported = unsupportedSourceMessage(file.name);
    if (unsupported) return { message: unsupported, status: 415 };
    if (!isAcceptedAttachment(file.name, file.type)) {
      return {
        message: `지원하지 않는 파일 형식입니다: ${file.name} (PDF·이미지·엑셀·CSV만 가능)`,
        status: 415,
      };
    }
    if (file.size > MAX_ATTACHMENT_SIZE) {
      return {
        message: `파일이 너무 큽니다: ${file.name} (최대 ${formatSize(MAX_ATTACHMENT_SIZE)})`,
        status: 413,
      };
    }
    totalSize += file.size;
  }
  if (totalSize > MAX_ATTACHMENTS_TOTAL_SIZE) {
    return {
      message: `파일 합계가 너무 큽니다. (최대 ${formatSize(MAX_ATTACHMENTS_TOTAL_SIZE)})`,
      status: 413,
    };
  }
  return null;
}

/** 업로드된 File 을 DB 저장용 레코드로 변환 (검증은 호출부에서 수행) */
export async function toAttachmentRecord(file: File): Promise<{
  fileName: string;
  mimeType: string;
  size: number;
  data: Uint8Array<ArrayBuffer>;
  extractedText: string | null;
}> {
  const bytes = new Uint8Array(await file.arrayBuffer());
  const kind = attachmentKind(file.name, file.type);
  const extractedText = kind
    ? await extractAttachmentText(kind, bytes)
    : null;
  return {
    fileName: file.name,
    mimeType: file.type || "application/octet-stream",
    size: bytes.byteLength,
    data: bytes,
    extractedText,
  };
}
