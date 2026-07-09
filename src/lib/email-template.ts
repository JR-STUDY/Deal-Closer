/**
 * 메일 발송 템플릿 — 치환 변수·검증·DTO 변환 헬퍼.
 * server-only 를 import 하지 않으므로 서버(API·페이지)와 클라이언트에서 모두 사용한다.
 */

// ── 소유 범위 ──
// team = 팀 공용(EmailTemplate.ownerId = null), personal = 개인(ownerId = 사용자 id)
export type TemplateScope = "team" | "personal";

export const TEMPLATE_SCOPE_LABELS: Record<TemplateScope, string> = {
  team: "팀 공용",
  personal: "개인",
};

/**
 * 제목·본문에 넣을 수 있는 치환 변수.
 * 발송 화면에서 템플릿을 불러올 때 현재 문서 값으로 자동 치환된다.
 */
export const TEMPLATE_VARIABLES = [
  { token: "거래처", description: "문서의 거래처명" },
  { token: "담당자", description: "받는 사람(거래처) 담당자명" },
  { token: "문서제목", description: "문서 제목" },
  { token: "문서종류", description: "견적서·계약서 등 종류" },
  { token: "총액", description: "문서 총액(예: ₩1,200,000)" },
] as const;

export type TemplateVariableToken = (typeof TEMPLATE_VARIABLES)[number]["token"];
export type TemplateContext = Record<TemplateVariableToken, string>;

/**
 * 텍스트의 `{{변수}}` 를 주어진 값으로 치환한다.
 * - 앞뒤 공백 허용: `{{ 거래처 }}` 도 인식한다.
 * - context 에 없는 변수는 원문(`{{...}}`)을 그대로 남긴다.
 *   → 일부 변수만 지금 치환하고 나머지 토큰은 뒤로 미룰 수 있다
 *     (예: 발송 화면에서 문서 값은 불러올 때 치환하고, 담당자명은 발송 폼에서 지연 치환).
 */
export function applyTemplateVariables(
  text: string,
  context: Partial<TemplateContext>,
): string {
  return text.replace(/\{\{\s*([^{}]+?)\s*\}\}/g, (whole, rawName: string) => {
    const key = rawName.trim() as TemplateVariableToken;
    return key in context ? (context[key] as string) : whole;
  });
}

// ── 저장 제약 (정책 VAL_*) ──
export const TEMPLATE_NAME_MAX = 60;
export const TEMPLATE_SUBJECT_MAX = 200;
export const TEMPLATE_BODY_MAX = 4000;
export const TEMPLATE_RECIPIENT_NAME_MAX = 60;

/** 클라이언트·서버 공용 메일 템플릿 표현 (Prisma 레코드에서 민감 필드 제외) */
export type EmailTemplateDTO = {
  id: string;
  name: string;
  subject: string;
  body: string;
  scope: TemplateScope;
  /** 기본 담당자명 (없으면 null) — 불러올 때 발송 폼 담당자명에 자동 입력 */
  recipientName: string | null;
};

/** 생성·수정 폼의 편집 값 (shared=true 면 팀 공용) */
export type TemplateFormValues = {
  name: string;
  subject: string;
  body: string;
  shared: boolean;
  recipientName: string;
};

/**
 * "현재 사용자가 볼 수 있는 템플릿" Prisma where 조건 (팀 공용 + 본인 개인).
 * 인가 규칙이므로 한 곳에서만 관리한다 — 목록 조회하는 모든 지점이 이 헬퍼를 쓴다.
 */
export function visibleTemplatesWhere(orgId: string, userId: string) {
  return {
    orgId,
    OR: [{ ownerId: null }, { ownerId: userId }],
  };
}

/** Prisma 레코드(부분) → DTO. ownerId 유무로 공용/개인을 판별한다. */
export function toTemplateDTO(record: {
  id: string;
  name: string;
  subject: string;
  body: string;
  ownerId: string | null;
  recipientName: string | null;
}): EmailTemplateDTO {
  return {
    id: record.id,
    name: record.name,
    subject: record.subject,
    body: record.body,
    scope: record.ownerId === null ? "team" : "personal",
    recipientName: record.recipientName,
  };
}

/** 검증 통과한 템플릿 입력값 */
export type TemplateInput = {
  name: string;
  subject: string;
  body: string;
  shared: boolean;
  recipientName: string | null;
};

/**
 * API 요청 본문을 검증·정규화한다 (POST·PATCH 공용).
 * 실패 시 사용자용 한국어 메시지를 담은 `{ error }` 를 반환한다.
 */
export function parseTemplateInput(
  body: Record<string, unknown>,
): TemplateInput | { error: string } {
  const name = typeof body.name === "string" ? body.name.trim() : "";
  const subject = typeof body.subject === "string" ? body.subject.trim() : "";
  const templateBody = typeof body.body === "string" ? body.body : "";
  const shared = body.shared === true;
  const recipientNameRaw =
    typeof body.recipientName === "string" ? body.recipientName.trim() : "";

  if (!name) return { error: "템플릿 이름을 입력해주세요." };
  if (name.length > TEMPLATE_NAME_MAX) {
    return { error: `템플릿 이름은 ${TEMPLATE_NAME_MAX}자 이내여야 합니다.` };
  }
  if (!subject) return { error: "메일 제목을 입력해주세요." };
  if (subject.length > TEMPLATE_SUBJECT_MAX) {
    return { error: `메일 제목은 ${TEMPLATE_SUBJECT_MAX}자 이내여야 합니다.` };
  }
  if (!templateBody.trim()) return { error: "메일 본문을 입력해주세요." };
  if (templateBody.length > TEMPLATE_BODY_MAX) {
    return { error: `메일 본문은 ${TEMPLATE_BODY_MAX}자 이내여야 합니다.` };
  }
  if (recipientNameRaw.length > TEMPLATE_RECIPIENT_NAME_MAX) {
    return {
      error: `담당자명은 ${TEMPLATE_RECIPIENT_NAME_MAX}자 이내여야 합니다.`,
    };
  }

  return {
    name,
    subject,
    body: templateBody,
    shared,
    recipientName: recipientNameRaw || null,
  };
}
