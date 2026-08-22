/**
 * 에디터 문서(EditorDoc) → 프롬프트용 텍스트 요약.
 *
 * Claude 에 원본 JSON 을 그대로 넣으면 좌표·스타일 같은 잡음이 많아 토큰을 낭비하고
 * 지시를 흐린다. 의미 있는 정보(제목·필드·품목·안내문)만 사람이 읽는 형태로 줄인다.
 *
 * (서버·클라이언트 공용 순수 모듈)
 */

import {
  calcItemTableTotal,
  evalSummaryRows,
  parseContentJson,
  type BlockPropsMap,
  type EditorDoc,
} from "@/lib/editor-schema";
import { DOCUMENT_TYPE_LABELS, type DocumentType } from "@/lib/constants";
import type { CompanyProfile } from "@/lib/branding";
import { formatKRW } from "@/lib/format";

/**
 * 프롬프트에 넣을 기회·거래처 컨텍스트 (PRD F-212).
 *
 * 거래처 정보를 사용자가 손으로 입력받으면 오타·누락이 그대로 문서에 박힌다.
 * CRM 의 Account·Contact 를 그대로 넘겨 **추측할 필요가 없게** 만드는 것이 목적이다.
 *
 * 담당자는 **대표 담당자 1명**만 싣는다 (거래처-8). 한 거래처에 여러 명이 있어도 문서의
 * 수신자는 한 명이고, 누가 대표인지는 `@/lib/contact` 의 `primaryContact()` 가 단일 기준이다
 * — 이 모듈은 순수 모듈이라 조회하지 않고 **이미 고른 담당자를 받는다**.
 */
export type OpportunityContext = {
  /** 기회명 */
  name: string;
  /** 단계 라벨 (초기·제안·검토/협상 등) */
  stageLabel: string;
  /** 예상 금액 (KRW 정수). 0 이면 미정 — 확정 문서가 없다는 뜻이다 (기회-6) */
  expectedAmount: number;
  /** 예상 마감일 표시 문자열. 없으면 빈 문자열 */
  expectedCloseDate: string;
  account: {
    companyName: string;
    bizRegNo: string | null;
    memo: string | null;
  };
  /** 대표 담당자. 담당자 0명인 거래처가 허용되므로 null 일 수 있다 (거래처-8) */
  contact: {
    name: string;
    position: string | null;
    phone: string | null;
    email: string | null;
  } | null;
  /** 갱신 기회면 직전 기회명 (연속 거래임을 알려준다) */
  previousOpportunityName?: string | null;
  memo?: string | null;
};

/**
 * 자사(공급자) 정보를 프롬프트용 텍스트로 (설정 7).
 *
 * 예전에는 **상호 하나만** 넘겼다. 그래서 모델이 만든 공급자 필드는 상호 말고는 전부
 * 빈칸이거나 모델이 지어낸 값이었다 — 사업자등록번호를 지어내면 그 견적서는 세금계산서와
 * 맞지 않는다. 회사 설정에 있는 사실을 그대로 주고 **없는 값은 비워 두라고** 지시한다.
 *
 * 비어 있는 항목은 줄 자체를 넣지 않는다 — `대표자: (없음)` 은 모델에게 "없음" 이라는
 * 값을 주는 것으로 읽힐 수 있다.
 */
export function describeCompany(company: CompanyProfile): string {
  const lines = [`상호: ${company.companyName}`];
  const add = (label: string, value: string | null | undefined) => {
    if (value?.trim()) lines.push(`${label}: ${value.trim()}`);
  };
  add("대표자", company.ceoName);
  add("사업자등록번호", company.bizRegNo);
  add("주소", company.address);
  add("대표 연락처", company.phone);
  return lines.join("\n");
}

/** 기회·거래처를 프롬프트용 텍스트로 */
export function describeOpportunity(ctx: OpportunityContext): string {
  const { account, contact } = ctx;
  const lines = [
    `기회명: ${ctx.name}`,
    `단계: ${ctx.stageLabel}`,
    ctx.expectedAmount > 0 ? `예상 금액: ${formatKRW(ctx.expectedAmount)}` : null,
    ctx.expectedCloseDate ? `예상 마감일: ${ctx.expectedCloseDate}` : null,
    ctx.previousOpportunityName
      ? `직전 기회: ${ctx.previousOpportunityName} (갱신·연속 거래)`
      : null,
    ctx.memo ? `기회 메모: ${ctx.memo}` : null,
    "",
    "[거래처 정보 — CRM 등록값]",
    `고객사명: ${account.companyName}`,
    account.bizRegNo ? `사업자등록번호: ${account.bizRegNo}` : null,
    account.memo ? `거래처 메모: ${account.memo}` : null,
    contact
      ? `담당자: ${contact.name}${contact.position ? ` (${contact.position})` : ""}`
      : null,
    contact?.email ? `담당자 이메일: ${contact.email}` : null,
    contact?.phone ? `담당자 연락처: ${contact.phone}` : null,
  ];
  return lines.filter((line) => line !== null).join("\n");
}

/** 프롬프트에 넣을 문서 메타 */
export type DocumentMeta = {
  title: string;
  type: string;
  clientName?: string | null;
  amount?: number | null;
  contentJson?: string | null;
};

function typeLabel(type: string): string {
  return DOCUMENT_TYPE_LABELS[type as DocumentType] ?? type;
}

/** 블록 하나를 텍스트 한 덩어리로 (블록 id 포함 여부 선택) */
function describeBlock(
  block: EditorDoc["blocks"][number],
  withId: boolean,
): string | null {
  const prefix = withId ? `[${block.id}] ` : "";
  switch (block.type) {
    case "title":
    case "text": {
      const props = block.props as BlockPropsMap["text"];
      const text = (props.text ?? "").trim();
      if (!text) return null;
      return `${prefix}${block.type === "title" ? "대제목" : "텍스트"}: ${text}`;
    }
    case "supplier":
    case "clientMeta": {
      const props = block.props as BlockPropsMap["clientMeta"];
      const fields = (props.fields ?? [])
        .map((f) => `${f.label}=${f.value || "(빈값)"}`)
        .join(", ");
      if (!fields) return null;
      const label = block.type === "supplier" ? "공급자 정보" : "거래처·문서 메타";
      return `${prefix}${label}: ${fields}`;
    }
    case "itemTable": {
      const props = block.props as BlockPropsMap["itemTable"];
      const rows = (props.rows ?? []).map(
        (r, i) =>
          `  ${i + 1}. ${r.name}${r.description ? ` (${r.description})` : ""} — 수량 ${r.quantity} × 단가 ${r.unitPrice}원`,
      );
      const subtotal = calcItemTableTotal(props.rows ?? []);
      const summaries = evalSummaryRows(props).map(
        (s) => `  · ${s.row.label} = ${s.row.formula} → ${s.value}원`,
      );
      return [
        `${prefix}품목표 (품목 합계 ${subtotal}원)`,
        ...rows,
        ...(summaries.length ? ["  [금액 요약행]", ...summaries] : []),
      ].join("\n");
    }
    case "table": {
      const props = block.props as BlockPropsMap["table"];
      const cells = (props.cells ?? []).map((row) => `  | ${row.join(" | ")} |`);
      if (cells.length === 0) return null;
      return [`${prefix}표`, ...cells].join("\n");
    }
    case "image":
      return withId ? `${prefix}이미지 (로고 등)` : null;
    case "divider":
      return null;
    default:
      return null;
  }
}

/** 문서 본문을 프롬프트용 텍스트로 (블록 id 없이 — 참고 자료 제시용) */
export function describeEditorDoc(doc: EditorDoc): string {
  return doc.blocks
    .slice()
    .sort((a, b) => a.y - b.y || a.x - b.x)
    .map((b) => describeBlock(b, false))
    .filter((line): line is string => Boolean(line))
    .join("\n");
}

/** 부분 재작성용 — 블록 id 를 붙여 어떤 블록을 수정할지 지목할 수 있게 한다 */
export function describeEditorDocWithIds(doc: EditorDoc): string {
  return doc.blocks
    .slice()
    .sort((a, b) => a.y - b.y || a.x - b.x)
    .map((b) => describeBlock(b, true))
    .filter((line): line is string => Boolean(line))
    .join("\n");
}

/** 보관함 문서 1건을 프롬프트용 텍스트로 (제목·종류·거래처·총액 + 본문 요약) */
export function describeDocument(meta: DocumentMeta): string {
  const header = [
    `제목: ${meta.title}`,
    `종류: ${typeLabel(meta.type)}`,
    meta.clientName ? `거래처: ${meta.clientName}` : null,
    typeof meta.amount === "number" && meta.amount > 0
      ? `총액: ${formatKRW(meta.amount)}`
      : null,
  ]
    .filter(Boolean)
    .join(" / ");

  const doc = parseContentJson(meta.contentJson);
  const body = doc ? describeEditorDoc(doc) : "(본문 없음)";
  return `${header}\n${body}`;
}

/** 양식(Template)의 구조를 프롬프트용 텍스트로 */
export function describeTemplate(input: {
  name: string;
  type: string;
  contentJson?: string | null;
  variables?: { key: string; label: string; sample?: string | null; required: boolean }[];
}): string {
  const doc = parseContentJson(input.contentJson);
  const parts = [
    `양식 이름: ${input.name}`,
    `문서 종류: ${typeLabel(input.type)}`,
    doc ? `[양식 구조]\n${describeEditorDoc(doc)}` : "(양식 본문 없음)",
  ];
  if (input.variables?.length) {
    parts.push(
      `[채워야 하는 변수 필드]\n${input.variables
        .map(
          (v) =>
            `- ${v.key}${v.required ? " (필수)" : ""}${v.sample ? ` 예: ${v.sample}` : ""}`,
        )
        .join("\n")}`,
    );
  }
  return parts.join("\n");
}
