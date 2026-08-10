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
import { formatKRW } from "@/lib/format";

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
