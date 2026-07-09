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
export const DOCUMENT_STATUSES = ["DRAFT", "SENT", "COMPLETED"] as const;
export type DocumentStatus = (typeof DOCUMENT_STATUSES)[number];

export const DOCUMENT_STATUS_LABELS: Record<DocumentStatus, string> = {
  DRAFT: "초안",
  SENT: "발송완료",
  COMPLETED: "계약완료",
};

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
