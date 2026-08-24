/**
 * 문서 파일 이름·응답 헤더 **순수 함수** (F-223 · F-232).
 *
 * 발송 첨부(`POST /api/documents/:id/send`) · PDF 다운로드(`GET /api/documents/:id/pdf`) ·
 * 발송 화면의 첨부 카드가 **같은 이름**을 써야 한다. 예전에는 발송 화면이
 * `` `[${typeLabel}] ${document.title}.pdf` `` 를 직접 조립했고 서버는 `${doc.title}.pdf` 를
 * 이력에 남겼다 — 화면에 보이는 이름과 실제로 나가는 파일 이름이 달랐다. 규칙을 한 곳에 둔다.
 *
 * `server-only` 를 import 하지 않는 **순수 모듈**이라 서버 라우트·클라이언트 폼·
 * `scripts/document-file.test.ts` 어디서나 쓴다 (AGENTS.md "서버가 읽는 상수는
 * use client 파일에서 export 하지 않는다" 의 반대편 — 양쪽이 함께 보는 값은 순수 모듈에 둔다).
 */

import { DOCUMENT_TYPE_LABELS, isDocumentType } from "./constants";

/** PDF 응답의 MIME 타입 — 라우트와 첨부가 같은 값을 쓴다 */
export const PDF_CONTENT_TYPE = "application/pdf";

/** 파일명에 쓸 수 없는 문자 — 경로 구분자와 OS 예약 문자 */
const UNSAFE_FILENAME = /[\\/:*?"<>|]+/g;

/** 파일명 길이 상한(확장자 제외) — 일부 파일시스템이 255바이트를 넘기지 못한다 */
const FILENAME_MAX = 120;

/** ASCII 로 적을 수 없는 글자 (한글 파일명 대체용) */
const NON_ASCII = /[^ -~]/g;

/** 제목이 통째로 걸러졌을 때의 대체 이름 — 빈 파일명(`.pdf`)을 만들지 않는다 */
const FALLBACK_BASE = "문서";

/** 파일명 조각 하나를 안전하게 만든다 (걸러내고 공백을 접는다) */
function sanitizePart(value: string): string {
  return value.replace(UNSAFE_FILENAME, " ").replace(/\s+/g, " ").trim();
}

/**
 * 첨부·다운로드 파일명. `[견적서] 다올테크 도입 견적.pdf` 형태다.
 *
 * 제목은 전부 사용자 입력이라 경로 구분자(`/`)·예약 문자가 들어올 수 있다 — 그대로 헤더에
 * 넣으면 받는 쪽에서 저장이 실패하거나 엉뚱한 경로로 해석된다. 걸러내고 길이를 자른다.
 *
 * **종류 라벨과 제목을 따로 걸러낸다.** 이어 붙인 뒤에 한 번에 걸러내면 대괄호가 살아남아,
 * 제목이 통째로 걸러진 문서의 파일명이 `[ ].pdf` 가 된다 — 이름이 없는 것과 같다.
 * 지금은 제목이 비면 그 자리만 대체 이름으로 채우고, 라벨까지 비면 대괄호도 붙이지 않는다.
 */
export function documentPdfFileName(document: {
  title: string;
  type: string;
}): string {
  const typeLabel = sanitizePart(
    isDocumentType(document.type)
      ? DOCUMENT_TYPE_LABELS[document.type]
      : document.type,
  );
  const title = sanitizePart(document.title) || FALLBACK_BASE;
  const base = (typeLabel ? `[${typeLabel}] ${title}` : title)
    .slice(0, FILENAME_MAX)
    // 잘린 끝에 공백이 남으면 `... .pdf` 가 된다
    .trimEnd();
  return `${base}.pdf`;
}

/**
 * `Content-Disposition` 헤더 값.
 *
 * 한글 파일명은 ASCII 로 적을 수 없으므로 **`filename` 과 `filename*`(RFC 5987) 을 함께**
 * 넣는다. 하나만 넣으면 한쪽이 깨진다 — `filename` 만 주면 한글이 사라지고(`_____.pdf`),
 * `filename*` 만 주면 그 확장을 모르는 구형 클라이언트가 이름을 아예 못 읽는다.
 * `filename` 쪽 값에서 `"` 를 걷어내는 것도 필수다(따옴표가 헤더를 조기에 닫는다).
 */
export function contentDisposition(
  fileName: string,
  disposition: "inline" | "attachment" = "attachment",
): string {
  const ascii = fileName.replace(NON_ASCII, "_").replace(/"/g, "");
  return `${disposition}; filename="${ascii}"; filename*=UTF-8''${encodeURIComponent(fileName)}`;
}
