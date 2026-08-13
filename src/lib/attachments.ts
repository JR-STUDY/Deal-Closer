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

/**
 * 추출 텍스트 최대 길이 (SQLite TEXT 비대 방지).
 *
 * 전역으로 자르면 **뒤쪽 시트가 통째로 사라진다** — 실제로 18시트 견적서에서
 * 목표 시트가 잘려 나가 모델이 엉뚱한 시트로 문서를 만든 사고가 있었다.
 * 그래서 상한을 넉넉히 두고, 자르기는 시트 단위로 한다(아래 MAX_SHEET_LENGTH).
 */
const MAX_EXTRACTED_LENGTH = 400_000;
/** 시트 하나가 가져갈 수 있는 최대 길이 — 한 시트가 예산을 독식하지 못하게 한다 */
const MAX_SHEET_LENGTH = 12_000;

/** Date 를 사람이 읽는 형태로. 엑셀 시간 직렬값(1900년 이전)은 시각만 남긴다 */
function formatCellDate(value: Date): string {
  if (Number.isNaN(value.getTime())) return "";
  if (value.getFullYear() < 1901) {
    return `${String(value.getHours()).padStart(2, "0")}:${String(value.getMinutes()).padStart(2, "0")}`;
  }
  return `${value.getFullYear()}-${String(value.getMonth() + 1).padStart(2, "0")}-${String(value.getDate()).padStart(2, "0")}`;
}

/**
 * 셀 값을 사람이 읽을 수 있는 문자열로 변환한다.
 *
 * 수식 셀의 캐시된 결과(result)가 Date·리치텍스트·하이퍼링크 객체일 수 있어
 * **재귀로** 풀어야 한다. 예전 구현은 String(result) 를 써서 담당자 이메일·전화번호가
 * "[object Object]" 로, 날짜가 로케일 의존 문자열로 들어갔다.
 */
function cellToText(value: ExcelJS.CellValue, depth = 0): string {
  if (value === null || value === undefined) return "";
  if (depth > 4) return "";
  if (value instanceof Date) return formatCellDate(value);
  if (typeof value === "number" || typeof value === "boolean") return String(value);
  if (typeof value === "string") return value;

  if (typeof value === "object") {
    const obj = value as unknown as Record<string, unknown>;
    if (Array.isArray(obj.richText)) {
      return obj.richText
        .map((run) => cellToText(run as ExcelJS.CellValue, depth + 1))
        .join("");
    }
    // 수식 셀 — 캐시된 결과를 다시 풀어준다
    if ("result" in obj) return cellToText(obj.result as ExcelJS.CellValue, depth + 1);
    // 하이퍼링크 셀 — 보이는 텍스트를 쓴다
    if ("text" in obj) return cellToText(obj.text as ExcelJS.CellValue, depth + 1);
    // 오류 셀(#REF! 등)은 옮길 값이 없다
    if ("error" in obj) return "";
  }
  return "";
}

/** 시트 하나의 추출 결과 */
type SheetExtract = { name: string; rowCount: number; text: string };

/**
 * 시트를 TSV 로 옮긴다.
 *
 * 병합셀은 **대표 셀에서 한 번만** 값을 쓴다. exceljs 는 병합 범위의 모든 셀에
 * 같은 값을 채워주기 때문에, 그대로 옮기면 "견 적 서" 가 한 줄에 12번 반복되는 식으로
 * 텍스트가 몇 배로 불어나 프롬프트 예산을 잡아먹는다.
 */
function extractSheet(sheet: ExcelJS.Worksheet): SheetExtract {
  const lines: string[] = [];
  let rowCount = 0;

  sheet.eachRow({ includeEmpty: false }, (row) => {
    const cells: string[] = [];
    row.eachCell({ includeEmpty: true }, (cell, colNumber) => {
      // 병합 영역의 종속 셀은 비워 둔다 (대표 셀만 값을 남긴다)
      const isFollower = cell.isMerged && cell.master?.address !== cell.address;
      const text = isFollower ? "" : cellToText(cell.value).trim();
      // 셀 안 줄바꿈은 TSV 구조를 깨므로 공백으로 바꾼다
      cells[colNumber - 1] = text.replace(/\s*\n\s*/g, " ");
    });

    // 뒤쪽 빈 칸은 버린다
    let last = cells.length - 1;
    while (last >= 0 && !cells[last]) last--;
    if (last < 0) return; // 완전히 빈 행

    rowCount++;
    lines.push(
      Array.from({ length: last + 1 }, (_, i) => cells[i] ?? "").join("\t"),
    );
  });

  let text = lines.join("\n");
  if (text.length > MAX_SHEET_LENGTH) {
    text = `${text.slice(0, MAX_SHEET_LENGTH)}\n…(이 시트의 이하 내용 생략)`;
  }
  return { name: sheet.name, rowCount, text };
}

/**
 * XLSX 바이트를 텍스트로 추출한다.
 *
 * 맨 앞에 **시트 목록(manifest)** 을 넣는다 — 시트가 많은 견적서 워크북에서
 * 모델이 "어떤 시트가 있는지" 알고 요청에 맞는 시트를 고를 수 있어야 한다.
 */
async function extractXlsx(bytes: Uint8Array): Promise<string> {
  const workbook = new ExcelJS.Workbook();
  // exceljs 는 Buffer/ArrayBuffer 를 받는다
  await workbook.xlsx.load(
    bytes.buffer.slice(
      bytes.byteOffset,
      bytes.byteOffset + bytes.byteLength,
    ) as ArrayBuffer,
  );

  const sheets: SheetExtract[] = [];
  workbook.eachSheet((sheet) => {
    const extracted = extractSheet(sheet);
    if (extracted.text) sheets.push(extracted);
  });
  if (sheets.length === 0) return "";

  const manifest = [
    `# 워크북 시트 목록 (${sheets.length}개)`,
    ...sheets.map((s, i) => `${i + 1}. ${s.name} (${s.rowCount}행)`),
  ].join("\n");

  const body = sheets.map((s) => `# 시트: ${s.name}\n${s.text}`).join("\n\n");
  return `${manifest}\n\n${body}`;
}

function clampText(text: string): string {
  const trimmed = text.trim();
  return trimmed.length > MAX_EXTRACTED_LENGTH
    ? `${trimmed.slice(0, MAX_EXTRACTED_LENGTH)}\n…(생략됨)`
    : trimmed;
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
