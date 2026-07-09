/**
 * 앱 레벨 상수 (SQLite 는 enum 을 지원하지 않으므로 여기서 값과 라벨을 관리한다)
 * DB 컬럼에는 아래 문자열 값이 그대로 저장된다.
 */

// ── 사용자 역할 ──
export const USER_ROLES = ["SALES_REP", "LEADER", "ADMIN"] as const;
export type UserRole = (typeof USER_ROLES)[number];

export const USER_ROLE_LABELS: Record<UserRole, string> = {
  SALES_REP: "영업 담당자",
  LEADER: "팀 리더",
  ADMIN: "관리자",
};

// ── 문서 종류 ──
export const DOCUMENT_TYPES = ["QUOTE", "CONTRACT", "NDA", "PROPOSAL"] as const;
export type DocumentType = (typeof DOCUMENT_TYPES)[number];

export const DOCUMENT_TYPE_LABELS: Record<DocumentType, string> = {
  QUOTE: "견적서",
  CONTRACT: "계약서",
  NDA: "비밀유지계약서",
  PROPOSAL: "제안서",
};

// ── 문서 상태 ──
// DRAFT → SENT → COMPLETED 가 정상 흐름이며, 어느 상태에서든 VOID(폐기)로 보낼 수 있다.
// 상태 전환은 편집 화면의 상태 드롭다운에서 수동으로 자유롭게 수행한다.
export const DOCUMENT_STATUSES = ["DRAFT", "SENT", "COMPLETED", "VOID"] as const;
export type DocumentStatus = (typeof DOCUMENT_STATUSES)[number];

export const DOCUMENT_STATUS_LABELS: Record<DocumentStatus, string> = {
  DRAFT: "초안",
  SENT: "발송완료",
  COMPLETED: "계약완료",
  VOID: "폐기",
};

/**
 * 폐기(VOID)를 제외한 진행 중 상태.
 * 라이브러리 "전체" 탭·대시보드·통계 집계는 폐기 문서를 제외한다
 * (폐기 문서는 라이브러리의 "폐기" 탭에서만 노출·복원 가능).
 */
export const ACTIVE_DOCUMENT_STATUSES = [
  "DRAFT",
  "SENT",
  "COMPLETED",
] as const satisfies readonly DocumentStatus[];

// ── 초대 상태 ──
export const INVITE_STATUSES = ["PENDING", "ACCEPTED", "EXPIRED"] as const;
export type InviteStatus = (typeof INVITE_STATUSES)[number];

// ── 메일 연동 provider ──
export const EMAIL_PROVIDERS = ["GMAIL", "OUTLOOK"] as const;
export type EmailProvider = (typeof EMAIL_PROVIDERS)[number];

export const EMAIL_PROVIDER_LABELS: Record<EmailProvider, string> = {
  GMAIL: "Gmail",
  OUTLOOK: "Outlook",
};

// ── 크레딧 거래 유형 ──
export const CREDIT_TX_TYPES = ["CHARGE", "USAGE"] as const;
export type CreditTxType = (typeof CREDIT_TX_TYPES)[number];

// ── 생성 요청 상태 ──
export const GENERATION_STATUSES = ["PENDING", "PROCESSING", "DONE", "FAILED"] as const;
export type GenerationStatus = (typeof GENERATION_STATUSES)[number];

// ── AI 문서 1건 생성에 필요한 크레딧 ──
export const CREDITS_PER_GENERATION = 10;

// ── AI 문서 생성 첨부 파일 (정책 VAL_*) ──
/** 요청당 첨부 가능한 최대 파일 개수 */
export const MAX_ATTACHMENTS = 5;
/** 파일 1개당 최대 크기 (10MB) */
export const MAX_ATTACHMENT_SIZE = 10 * 1024 * 1024;
/** 요청당 첨부 파일 합계 최대 크기 (25MB) */
export const MAX_ATTACHMENTS_TOTAL_SIZE = 25 * 1024 * 1024;

/** 요청당 참고할 수 있는 보관함 문서 최대 개수 */
export const MAX_REFERENCES = 5;

/**
 * 허용 첨부 형식: MIME 타입 → 표시 라벨.
 * (브라우저가 MIME 을 비우거나 다르게 보내는 경우가 있어 확장자도 함께 검사한다)
 */
export const ACCEPTED_ATTACHMENT_TYPES = {
  "application/pdf": "PDF",
  "image/png": "이미지",
  "image/jpeg": "이미지",
  "image/webp": "이미지",
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet": "엑셀",
  "text/csv": "CSV",
} as const;

/** 허용 확장자 (소문자, 점 포함) */
export const ACCEPTED_ATTACHMENT_EXTENSIONS = [
  ".pdf",
  ".png",
  ".jpg",
  ".jpeg",
  ".webp",
  ".xlsx",
  ".csv",
] as const;

/** `<input type="file" accept>` 속성 값 */
export const ATTACHMENT_ACCEPT = [
  ...Object.keys(ACCEPTED_ATTACHMENT_TYPES),
  ...ACCEPTED_ATTACHMENT_EXTENSIONS,
].join(",");

/** 파일 종류 분류 (추출/미리보기 분기에 사용) */
export type AttachmentKind = "pdf" | "image" | "excel" | "csv";

/** 파일명 확장자를 소문자로 추출 (".pdf" 형태, 없으면 "") */
export function fileExtension(fileName: string): string {
  const dot = fileName.lastIndexOf(".");
  return dot >= 0 ? fileName.slice(dot).toLowerCase() : "";
}

/** 확장자·MIME 기준 파일 종류 판별 (허용 형식이 아니면 null) */
export function attachmentKind(
  fileName: string,
  mimeType: string,
): AttachmentKind | null {
  const ext = fileExtension(fileName);
  if (ext === ".pdf" || mimeType === "application/pdf") return "pdf";
  if (
    [".png", ".jpg", ".jpeg", ".webp"].includes(ext) ||
    mimeType.startsWith("image/")
  ) {
    return "image";
  }
  if (
    ext === ".xlsx" ||
    mimeType ===
      "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
  ) {
    return "excel";
  }
  if (ext === ".csv" || mimeType === "text/csv") return "csv";
  return null;
}

/** 첨부 허용 여부 (확장자 또는 MIME 중 하나라도 매칭되면 허용) */
export function isAcceptedAttachment(
  fileName: string,
  mimeType: string,
): boolean {
  return attachmentKind(fileName, mimeType) !== null;
}
