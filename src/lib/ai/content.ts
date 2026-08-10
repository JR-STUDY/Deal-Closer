/**
 * 업로드 파일 → 프로바이더 중립 메시지 블록 변환 (서버 전용).
 *
 * PDF·이미지는 멀티모달 입력으로 **원본 그대로** 전달하므로 별도 파서가 필요 없다.
 * 엑셀·CSV 는 lib/attachments.ts 가 추출한 텍스트를 넣는다.
 * docx·hwp 는 변환기를 두지 않았으므로 업로드 단계에서 안내 후 거절한다 (PRD F-202 부분 지원).
 */

import "server-only";
import { attachmentKind, fileExtension, type AttachmentKind } from "@/lib/constants";
import type { AiContentBlock, ImageMediaType } from "./blocks";

/** DB 저장 직전의 첨부 레코드 형태 (lib/attachments.ts toAttachmentRecord 결과) */
export type PreparedFile = {
  fileName: string;
  mimeType: string;
  size: number;
  data: Uint8Array;
  extractedText: string | null;
};

/** 자동 변환을 지원하지 않는 확장자 (안내용) */
const UNSUPPORTED_EXTENSIONS = [".doc", ".docx", ".hwp", ".hwpx", ".ppt", ".pptx"];

export function unsupportedSourceMessage(fileName: string): string | null {
  const ext = fileExtension(fileName);
  if (!UNSUPPORTED_EXTENSIONS.includes(ext)) return null;
  return `${fileName} 은 아직 자동 변환을 지원하지 않습니다. PDF 로 내보낸 뒤 업로드해주세요. (지원: PDF·이미지·엑셀·CSV)`;
}

function imageMediaType(file: PreparedFile): ImageMediaType {
  const mime = file.mimeType.toLowerCase();
  if (mime === "image/png" || mime === "image/jpeg" || mime === "image/gif" || mime === "image/webp") {
    return mime;
  }
  // MIME 을 비우고 보내는 브라우저가 있어 확장자로 보정한다
  switch (fileExtension(file.fileName)) {
    case ".png":
      return "image/png";
    case ".gif":
      return "image/gif";
    case ".webp":
      return "image/webp";
    default:
      return "image/jpeg";
  }
}

function toBase64(data: Uint8Array): string {
  return Buffer.from(data).toString("base64");
}

/** 추출 텍스트가 지나치게 길면 잘라 토큰을 아낀다 */
const MAX_TEXT_CHARS = 20_000;

function clamp(text: string): string {
  return text.length > MAX_TEXT_CHARS
    ? `${text.slice(0, MAX_TEXT_CHARS)}\n…(이하 생략)`
    : text;
}

/**
 * 파일 1개를 content 블록 배열로 변환한다.
 * 어떤 파일인지 알려주는 라벨 텍스트 블록을 앞에 붙인다.
 */
export function fileToContentBlocks(
  file: PreparedFile,
  label: string,
): AiContentBlock[] {
  const kind: AttachmentKind | null = attachmentKind(file.fileName, file.mimeType);

  if (kind === "pdf") {
    return [
      { type: "text", text: `${label}: ${file.fileName} (PDF)` },
      {
        type: "pdf",
        fileName: file.fileName,
        dataBase64: toBase64(file.data),
      },
    ];
  }

  if (kind === "image") {
    return [
      { type: "text", text: `${label}: ${file.fileName} (이미지)` },
      {
        type: "image",
        mediaType: imageMediaType(file),
        dataBase64: toBase64(file.data),
      },
    ];
  }

  if (kind === "excel" || kind === "csv") {
    const text = file.extractedText?.trim();
    return [
      {
        type: "text",
        text: text
          ? `${label}: ${file.fileName} (${kind === "excel" ? "엑셀" : "CSV"} 추출 데이터)\n${clamp(text)}`
          : `${label}: ${file.fileName} — 표 데이터를 읽지 못했습니다. 이 파일은 참고하지 마세요.`,
      },
    ];
  }

  // 여기까지 오면 허용되지 않은 형식 (라우트에서 사전 차단됨)
  return [
    {
      type: "text",
      text: `${label}: ${file.fileName} — 지원하지 않는 형식이라 내용을 읽지 못했습니다.`,
    },
  ];
}

/** 여러 파일을 한 번에 변환 */
export function filesToContentBlocks(
  files: PreparedFile[],
  label = "첨부 파일",
): AiContentBlock[] {
  return files.flatMap((file, i) =>
    fileToContentBlocks(file, files.length > 1 ? `${label} ${i + 1}` : label),
  );
}
