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

/** 엑셀 워크북 전체에 배정하는 예산 (시트가 많은 견적서 파일을 고려) */
const MAX_WORKBOOK_CHARS = 48_000;

/**
 * 시트가 많은 워크북에서 **요청과 관련 있는 시트를 먼저, 온전히** 넣는다.
 *
 * 왜 필요한가: 실제 견적서 워크북은 시트가 15~18개다. 앞에서부터 잘라 넣으면
 * 목표 시트가 예산 밖으로 밀려나 모델이 엉뚱한 시트로 문서를 만든다
 * (파일명은 "유지보수"인데 첫 시트인 클라우드 견적으로 만들어버린 사고가 있었다).
 * → 파일명·사용자 요청의 낱말과 시트 이름이 겹치는 순서로 넣는다.
 */
function budgetWorkbook(text: string, hints: string[]): string {
  const marker = /^# 시트: (.+)$/gm;
  const heads: { name: string; start: number }[] = [];
  for (let m = marker.exec(text); m; m = marker.exec(text)) {
    heads.push({ name: m[1].trim(), start: m.index });
  }
  // 시트 구조가 없으면(CSV·구버전 추출) 기존처럼 통째로 자른다
  if (heads.length === 0) return clamp(text);

  const manifest = text.slice(0, heads[0].start).trim();
  const sheets = heads.map((head, i) => ({
    name: head.name,
    body: text.slice(head.start, heads[i + 1]?.start ?? text.length).trimEnd(),
    order: i,
  }));

  // 힌트 낱말(2자 이상)과 시트 이름이 겹치면 점수를 준다
  const tokens = [
    ...new Set(
      hints
        .join(" ")
        .split(/[^가-힣A-Za-z0-9]+/)
        .filter((token) => token.length >= 2),
    ),
  ];
  const score = (name: string) =>
    tokens.reduce((sum, token) => (name.includes(token) ? sum + 1 : sum), 0);

  const ranked = sheets
    .map((sheet) => ({ ...sheet, score: score(sheet.name) }))
    .sort((a, b) => b.score - a.score || a.order - b.order);

  const included: typeof ranked = [];
  const skipped: string[] = [];
  let used = manifest.length;
  for (const sheet of ranked) {
    if (used + sheet.body.length <= MAX_WORKBOOK_CHARS) {
      included.push(sheet);
      used += sheet.body.length;
    } else {
      skipped.push(sheet.name);
    }
  }

  // 본문은 원래 시트 순서로 되돌려 넣는다 (사람이 읽는 순서 유지)
  const body = included
    .sort((a, b) => a.order - b.order)
    .map((sheet) => sheet.body)
    .join("\n\n");

  // 무엇을 뺐는지 알려준다 — 모델이 "없는 시트"를 상상하지 않게 한다
  const notice = skipped.length
    ? `\n\n# 분량 때문에 본문에서 제외한 시트\n${skipped.join(", ")}\n(이 시트 내용은 참고하지 마세요. 필요하면 사용자에게 해당 시트를 지정해 달라고 요청하세요.)`
    : "";

  return `${manifest}\n\n${body}${notice}`;
}

/**
 * 파일 1개를 content 블록 배열로 변환한다.
 * 어떤 파일인지 알려주는 라벨 텍스트 블록을 앞에 붙인다.
 */
export function fileToContentBlocks(
  file: PreparedFile,
  label: string,
  /** 어느 시트가 중요한지 판단할 힌트 (사용자 요청 문장 등). 파일명은 자동 포함된다 */
  hints: string[] = [],
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
    if (!text) {
      return [
        {
          type: "text",
          text: `${label}: ${file.fileName} — 표 데이터를 읽지 못했습니다. 이 파일은 참고하지 마세요.`,
        },
      ];
    }
    const body =
      kind === "excel"
        ? budgetWorkbook(text, [file.fileName, ...hints])
        : clamp(text);
    return [
      {
        type: "text",
        text: `${label}: ${file.fileName} (${kind === "excel" ? "엑셀" : "CSV"} 추출 데이터)\n${body}`,
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
  hints: string[] = [],
): AiContentBlock[] {
  return files.flatMap((file, i) =>
    fileToContentBlocks(file, files.length > 1 ? `${label} ${i + 1}` : label, hints),
  );
}
