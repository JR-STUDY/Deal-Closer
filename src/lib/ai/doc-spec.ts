/**
 * AI 문서 생성의 중간 표현(DocSpec)과 에디터 문서(EditorDoc) 변환.
 *
 * 설계 의도: Claude 에게 절대좌표 블록(EditorDoc)을 직접 만들게 하면 레이아웃이
 * 쉽게 깨진다. 대신 **의미 기반 스펙**(제목·거래처 필드·품목·요약행·안내문)만
 * 구조화 출력(JSON Schema)으로 받고, 좌표 배치는 이 모듈의 결정적(deterministic)
 * 코드가 담당한다.
 *   - 표준 양식이 있으면  → 양식의 레이아웃·문구는 그대로 두고 값만 채운다 (F-212)
 *   - 표준 양식이 없으면  → 기본 배치 규칙으로 새로 조립한다
 *
 * (서버·클라이언트 공용 순수 모듈 — server-only import 금지)
 */

import {
  A4,
  createBlock,
  uid,
  itemTableGrandTotal,
  normalizeSummaryRows,
  type Block,
  type BlockPropsMap,
  type EditorDoc,
  findMetaField,
  healMetaFieldRoles,
  type MetaFieldRole,
} from "@/lib/editor-schema";
import {
  DOCUMENT_TYPES,
  DOCUMENT_TYPE_LABELS,
  type DocumentType,
} from "@/lib/constants";

// ============================ 타입 ============================

export type SpecField = { label: string; value: string };
export type SpecItem = {
  name: string;
  description: string;
  quantity: number;
  unitPrice: number;
};
export type SpecSummaryRow = { label: string; formula: string };
export type SpecNote = { heading: string; lines: string[] };
/**
 * 품목표로 표현할 수 없는 **격자 표**.
 *
 * 실제 견적서에는 "지원항목 × 유지보수 등급" 처럼 O/X 매트릭스나 조건표가 들어간다.
 * 이걸 스펙에 담을 수 없으면 원본 양식을 옮길 때 그 표가 통째로 사라진다.
 */
export type SpecTable = { title: string; headerRow: string[]; rows: string[][] };
export type SpecVariable = {
  key: string;
  label: string;
  sample: string;
  required: boolean;
};

/** Claude 가 반환하는 문서 스펙 */
export type DocSpec = {
  /** 문서함에 표시할 제목 */
  title: string;
  documentType: DocumentType;
  /** 문서 상단 대제목 블록 텍스트 (예: "견 적 서") */
  headingText: string;
  /** 거래처(고객사) 상호 — Document.clientName 으로도 저장된다 */
  clientName: string;
  /** 생성 결과를 사용자에게 알려줄 한 문장 */
  summary: string;
  clientFields: SpecField[];
  supplierFields: SpecField[];
  items: SpecItem[];
  summaryRows: SpecSummaryRow[];
  /** 품목표로 표현할 수 없는 격자 표 (등급 매트릭스·조건표 등) */
  tables: SpecTable[];
  notes: SpecNote[];
};

/** 표준 양식 세팅(F-203) 결과 = 문서 스펙 + 변수 필드 정의(F-204) */
export type TemplateSpec = DocSpec & { variables: SpecVariable[] };

// ======================= JSON Schema =======================
// structured outputs 제약: 모든 object 는 additionalProperties:false + 전체 required.
// null 을 쓰지 않고 "빈 문자열"로 표현해 스키마를 단순하게 유지한다.

const FIELD_SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: ["label", "value"],
  properties: {
    label: { type: "string", description: "필드 라벨 (예: 고객사명, 수신자, 견적일)" },
    value: { type: "string", description: "필드 값. 알 수 없으면 빈 문자열" },
  },
} as const;

const ITEM_SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: ["name", "description", "quantity", "unitPrice"],
  properties: {
    name: { type: "string", description: "품목명" },
    description: { type: "string", description: "규격·비고. 없으면 빈 문자열" },
    quantity: { type: "integer", description: "수량 (1 이상 정수)" },
    unitPrice: {
      type: "integer",
      description: "단가 — 원(KRW) 단위 정수. 소수점·쉼표·통화기호 없이 숫자만",
    },
  },
} as const;

const SUMMARY_ROW_SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: ["label", "formula"],
  properties: {
    label: { type: "string", description: "요약행 라벨 (예: 공급가액, 부가세 (10%), 합계)" },
    formula: {
      type: "string",
      description:
        "산술 수식. 변수 subtotal(품목 수량×단가 합계)과 + - * / ( ) 만 사용. 예: subtotal * 0.1",
    },
  },
} as const;

const NOTE_SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: ["heading", "lines"],
  properties: {
    heading: { type: "string", description: "섹션 제목 (예: 기타사항, 계약 조건)" },
    lines: {
      type: "array",
      description: "섹션 본문 줄 목록. 각 줄은 한 문장 또는 한 조항",
      items: { type: "string" },
    },
  },
} as const;

const TABLE_SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: ["title", "headerRow", "rows"],
  properties: {
    title: {
      type: "string",
      description: '표 위에 붙일 제목. 없으면 빈 문자열. 예: "유지보수 등급별 지원 범위"',
    },
    headerRow: {
      type: "array",
      description: "머리글 행의 칸 목록. 머리글이 없으면 빈 배열",
      items: { type: "string" },
    },
    rows: {
      type: "array",
      description:
        "본문 행 목록. 각 행은 칸 문자열 배열이며, 머리글과 칸 수를 맞춘다. 빈 칸은 빈 문자열",
      items: { type: "array", items: { type: "string" } },
    },
  },
} as const;

const DOC_SPEC_PROPERTIES = {
  title: {
    type: "string",
    description: '문서함에 표시할 제목. 예: "(주)글로벌커머스 견적서"',
  },
  documentType: {
    type: "string",
    enum: [...DOCUMENT_TYPES],
    description: "문서 종류. QUOTE=견적서 CONTRACT=계약서 NDA=비밀유지계약서 PROPOSAL=제안서",
  },
  headingText: {
    type: "string",
    description: '문서 상단 대제목. 예: "견 적 서", "용역 계약서"',
  },
  clientName: {
    type: "string",
    description: "거래처(고객사) 상호. 알 수 없으면 빈 문자열",
  },
  summary: {
    type: "string",
    description: "무엇을 어떻게 만들었는지 사용자에게 알려줄 한 문장 (한국어 존댓말)",
  },
  clientFields: {
    type: "array",
    description:
      "거래처·문서 메타 필드 (고객사명·수신자·견적일·유효기간·계약기간 등). 표준 양식이 주어졌다면 그 양식의 라벨을 그대로 사용",
    items: FIELD_SCHEMA,
  },
  supplierFields: {
    type: "array",
    description:
      "공급자(자사) 정보 필드 (상호·대표자·등록번호·주소·담당자·전화·이메일). 확인할 수 없으면 빈 배열",
    items: FIELD_SCHEMA,
  },
  items: {
    type: "array",
    description:
      "품목 표 행. 견적서·계약서의 금액 근거. 금액 정보가 없는 문서(NDA 등)는 빈 배열",
    items: ITEM_SCHEMA,
  },
  summaryRows: {
    type: "array",
    description:
      "품목표 하단 금액 요약행. 부가세를 별도 표기해야 하면 공급가액/부가세/합계 3행. 필요 없으면 빈 배열",
    items: SUMMARY_ROW_SCHEMA,
  },
  tables: {
    type: "array",
    description:
      "품목표로 표현할 수 없는 격자 표 (예: 지원항목 × 등급 O/X 매트릭스, 조건표, 요율표). " +
      "원본 문서에 이런 표가 있으면 칸 값을 그대로 옮긴다. 없으면 빈 배열",
    items: TABLE_SCHEMA,
  },
  notes: {
    type: "array",
    description: "문서 하단 안내·약관 섹션. 필요 없으면 빈 배열",
    items: NOTE_SCHEMA,
  },
} as const;

const DOC_SPEC_REQUIRED = Object.keys(DOC_SPEC_PROPERTIES);

/** 문서 초안 생성(F-212) 응답 스키마 */
export const DOC_SPEC_SCHEMA: Record<string, unknown> = {
  type: "object",
  additionalProperties: false,
  required: DOC_SPEC_REQUIRED,
  properties: DOC_SPEC_PROPERTIES,
};

const VARIABLE_SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: ["key", "label", "sample", "required"],
  properties: {
    key: {
      type: "string",
      description: '치환 키 — 공백 없는 한국어 명사. 예: "고객사명", "계약기간"',
    },
    label: { type: "string", description: "화면 표시 라벨" },
    sample: { type: "string", description: "예시값. 없으면 빈 문자열" },
    required: { type: "boolean", description: "문서 생성 시 반드시 채워야 하는 값인지" },
  },
} as const;

/** 표준 양식 세팅(F-203 + F-204) 응답 스키마 */
export const TEMPLATE_SPEC_SCHEMA: Record<string, unknown> = {
  type: "object",
  additionalProperties: false,
  required: [...DOC_SPEC_REQUIRED, "variables"],
  properties: {
    ...DOC_SPEC_PROPERTIES,
    variables: {
      type: "array",
      description:
        "이 양식에서 문서마다 달라지는 값의 목록 (F-204). 고객사명·담당자명·품목·단가·수량·계약기간 등",
      items: VARIABLE_SCHEMA,
    },
  },
};

/** 변수 필드만 재추출할 때 쓰는 응답 스키마 (F-204) */
export const VARIABLES_SCHEMA: Record<string, unknown> = {
  type: "object",
  additionalProperties: false,
  required: ["variables"],
  properties: {
    variables: {
      type: "array",
      description: "양식에서 문서마다 달라지는 값의 목록",
      items: VARIABLE_SCHEMA,
    },
  },
};

// ========================= 파싱·검증 =========================

const MAX_TITLE = 120;
const MAX_TEXT = 4_000;
const MAX_ITEMS = 200;
const MAX_FIELDS = 30;
const MAX_NOTES = 12;
const MAX_NOTE_LINES = 40;
const MAX_TABLES = 6;
const MAX_TABLE_ROWS = 40;
const MAX_TABLE_COLS = 12;
const MAX_VARIABLES = 40;

function str(value: unknown, max = MAX_TEXT): string {
  return typeof value === "string" ? value.trim().slice(0, max) : "";
}

/** 0 이상 정수로 정규화 (KRW 정수 정책 FORM_CURRENCY_KRW) */
function int(value: unknown, fallback = 0): number {
  const n = Math.trunc(Number(value));
  return Number.isFinite(n) && n >= 0 ? n : fallback;
}

function arr(value: unknown): unknown[] {
  return Array.isArray(value) ? value : [];
}

function parseFields(value: unknown): SpecField[] {
  return arr(value)
    .slice(0, MAX_FIELDS)
    .map((raw) => {
      const f = raw as Record<string, unknown>;
      return { label: str(f?.label, 40), value: str(f?.value, 200) };
    })
    .filter((f) => f.label.length > 0);
}

function parseItems(value: unknown): SpecItem[] {
  return arr(value)
    .slice(0, MAX_ITEMS)
    .map((raw) => {
      const it = raw as Record<string, unknown>;
      return {
        name: str(it?.name, 120),
        description: str(it?.description, 300),
        quantity: Math.max(1, int(it?.quantity, 1)),
        unitPrice: int(it?.unitPrice, 0),
      };
    })
    .filter((it) => it.name.length > 0);
}

function parseSummaryRows(value: unknown): SpecSummaryRow[] {
  return arr(value)
    .slice(0, 10)
    .map((raw) => {
      const r = raw as Record<string, unknown>;
      return { label: str(r?.label, 40), formula: str(r?.formula, 200) };
    })
    .filter((r) => r.label.length > 0 && r.formula.length > 0);
}

/**
 * 격자 표를 파싱한다.
 * 머리글과 본문 행의 칸 수가 어긋나면 가장 넓은 행에 맞춰 빈 칸으로 채운다
 * (모델이 칸을 빠뜨려도 표가 깨지지 않게).
 */
function parseTables(value: unknown): SpecTable[] {
  return arr(value)
    .slice(0, MAX_TABLES)
    .map((raw) => {
      const t = raw as Record<string, unknown>;
      const headerRow = arr(t?.headerRow)
        .slice(0, MAX_TABLE_COLS)
        .map((cell) => str(cell, 200));
      const rows = arr(t?.rows)
        .slice(0, MAX_TABLE_ROWS)
        .map((row) => arr(row).slice(0, MAX_TABLE_COLS).map((cell) => str(cell, 300)))
        .filter((row) => row.some((cell) => cell.length > 0));

      const cols = Math.max(headerRow.length, ...rows.map((r) => r.length), 0);
      const pad = (row: string[]) =>
        Array.from({ length: cols }, (_, i) => row[i] ?? "");

      return {
        title: str(t?.title, 120),
        headerRow: headerRow.length > 0 ? pad(headerRow) : [],
        rows: rows.map(pad),
      };
    })
    .filter((t) => t.rows.length > 0);
}

function parseNotes(value: unknown): SpecNote[] {
  return arr(value)
    .slice(0, MAX_NOTES)
    .map((raw) => {
      const n = raw as Record<string, unknown>;
      return {
        heading: str(n?.heading, 80),
        lines: arr(n?.lines)
          .slice(0, MAX_NOTE_LINES)
          .map((l) => str(l, 500))
          .filter((l) => l.length > 0),
      };
    })
    .filter((n) => n.heading.length > 0 || n.lines.length > 0);
}

export function parseVariables(value: unknown): SpecVariable[] {
  const seen = new Set<string>();
  return arr(value)
    .slice(0, MAX_VARIABLES)
    .map((raw) => {
      const v = raw as Record<string, unknown>;
      return {
        key: str(v?.key, 40),
        label: str(v?.label, 60),
        sample: str(v?.sample, 120),
        required: v?.required === true,
      };
    })
    .filter((v) => {
      if (!v.key) return false;
      if (seen.has(v.key)) return false; // (templateId, key) 유니크 제약 보호
      seen.add(v.key);
      return true;
    })
    .map((v) => ({ ...v, label: v.label || v.key }));
}

/** Claude 응답(JSON)을 DocSpec 으로 정규화한다. 형식이 어긋난 값은 안전한 기본값으로 대체. */
export function parseDocSpec(raw: unknown, fallbackType: DocumentType = "QUOTE"): DocSpec {
  const o = (typeof raw === "object" && raw !== null ? raw : {}) as Record<string, unknown>;
  const documentType = (DOCUMENT_TYPES as readonly string[]).includes(
    String(o.documentType),
  )
    ? (o.documentType as DocumentType)
    : fallbackType;
  const typeLabel = DOCUMENT_TYPE_LABELS[documentType];

  return {
    title: str(o.title, MAX_TITLE) || `${typeLabel} 초안`,
    documentType,
    headingText: str(o.headingText, 60) || typeLabel,
    clientName: str(o.clientName, 120),
    summary: str(o.summary, 500),
    clientFields: parseFields(o.clientFields),
    supplierFields: parseFields(o.supplierFields),
    items: parseItems(o.items),
    summaryRows: parseSummaryRows(o.summaryRows),
    tables: parseTables(o.tables),
    notes: parseNotes(o.notes),
  };
}

/** 표준 양식 세팅 응답 정규화 */
export function parseTemplateSpec(
  raw: unknown,
  fallbackType: DocumentType = "QUOTE",
): TemplateSpec {
  const o = (typeof raw === "object" && raw !== null ? raw : {}) as Record<string, unknown>;
  return { ...parseDocSpec(raw, fallbackType), variables: parseVariables(o.variables) };
}

// ==================== EditorDoc 변환 ====================

/** 라벨 비교용 정규화 (공백·괄호 제거) */
function normalizeLabel(label: string): string {
  return label.replace(/[\s()·:]/g, "");
}

/** 같은 뜻으로 볼 라벨인지 (부분 일치 허용: "고객사" ↔ "고객사명") */
export function labelMatches(a: string, b: string): boolean {
  const x = normalizeLabel(a);
  const y = normalizeLabel(b);
  if (!x || !y) return false;
  return x === y || x.includes(y) || y.includes(x);
}

const FIELD_ROW_HEIGHT = 22;

/**
 * 메타 블록(supplier/clientMeta)의 필드 값을 스펙 값으로 채운다.
 * - 라벨이 일치하는 필드는 값만 덮어쓴다 (빈 값은 양식 값을 보존)
 * - 양식에 없는 필드는 뒤에 덧붙이고 블록 높이를 늘린다
 */
/**
 * 정보 블록의 필드에 역할(`MetaFieldRole`)을 배정한다 — 조회가 라벨에 매이지 않게.
 * 라벨 조각으로 먼저 찾고, 못 찾으면 **값 일치**로 찾는다(AI 가 라벨을 정한 경우).
 */
function assignMetaRoles(
  block: Block,
  valueHints: Partial<Record<MetaFieldRole, string>>,
): void {
  const props = block.props as BlockPropsMap["clientMeta"];
  if (!Array.isArray(props.fields)) return;
  props.fields = healMetaFieldRoles(props.fields, valueHints);
}

function fillMetaBlock(block: Block, specFields: SpecField[]): void {
  const props = block.props as BlockPropsMap["clientMeta"];
  if (!Array.isArray(props.fields)) return;

  const fields = props.fields.map((f) => ({ ...f }));
  const appended: SpecField[] = [];

  for (const spec of specFields) {
    if (!spec.value) continue;
    const target = fields.find((f) => labelMatches(f.label ?? "", spec.label));
    if (target) target.value = spec.value;
    else appended.push(spec);
  }

  for (const spec of appended) {
    fields.push({ id: uid(), label: spec.label, value: spec.value });
  }
  props.fields = fields;
  if (appended.length > 0) {
    block.h = block.h + appended.length * FIELD_ROW_HEIGHT;
  }
}

/** 품목표 블록에 스펙 품목·요약행을 반영하고 높이를 재계산한다 */
function fillItemTableBlock(block: Block, spec: DocSpec): void {
  const props = block.props as BlockPropsMap["itemTable"];
  if (spec.items.length > 0) {
    props.rows = spec.items.map((it) => ({
      id: uid(),
      name: it.name,
      description: it.description,
      quantity: it.quantity,
      unitPrice: it.unitPrice,
    }));
  }
  if (spec.summaryRows.length > 0) {
    /*
     * 총계 표식을 **여기서 굳힌다** (마지막 행 = 프롬프트가 지시한 `합계 (VAT 포함)`).
     * 모델은 표식을 만들지 않으므로, 굳혀 두지 않으면 사용자가 나중에 요약행을 하나
     * 더할 때 문서 금액이 그 행으로 옮겨간다.
     */
    props.summaryRows = normalizeSummaryRows(
      spec.summaryRows.map((r) => ({
        id: uid(),
        label: r.label,
        formula: r.formula,
      })),
    );
  }
  block.h = itemTableHeight(props.rows.length, (props.summaryRows ?? []).length);
}

/** 헤더(36) + 행(28) + 합계행(28) + 요약행(24) 기준 높이 */
export function itemTableHeight(rowCount: number, summaryCount: number): number {
  return 36 + Math.max(1, rowCount) * 28 + 28 + summaryCount * 24;
}

function cloneDoc(doc: EditorDoc): EditorDoc {
  return JSON.parse(JSON.stringify(doc)) as EditorDoc;
}

/** 블록이 차지하는 최대 y 를 보고 필요한 페이지 수를 계산한다 */
function withPageCount(doc: EditorDoc): EditorDoc {
  const bottom = doc.blocks.reduce((max, b) => Math.max(max, b.y + b.h), 0);
  doc.canvas.pages = Math.max(1, Math.ceil((bottom + 48) / doc.canvas.h));
  return doc;
}

/** 안내문 섹션을 텍스트 블록으로 만든다 (양식 조립·추가 공용) */
function noteBlock(note: SpecNote, y: number): Block {
  const block = createBlock("text", { x: 40, y });
  block.w = 714;
  block.h = 22 + (note.lines.length + 1) * 20;
  const props = block.props as BlockPropsMap["text"];
  props.text = [note.heading ? `▶ ${note.heading}` : "", ...note.lines]
    .filter(Boolean)
    .join("\n");
  props.fontSize = 12;
  return block;
}

/** 표 한 줄 높이 (머리글 포함) */
const TABLE_ROW_HEIGHT = 26;

/**
 * 격자 표 블록을 만든다.
 * 제목이 있으면 표 위에 텍스트 블록을 따로 두므로, 여기서는 표만 만든다.
 */
function tableBlock(table: SpecTable, y: number): Block {
  const block = createBlock("table", { x: 40, y });
  block.w = 714;
  const props = block.props as BlockPropsMap["table"];
  const cells = table.headerRow.length > 0
    ? [table.headerRow, ...table.rows]
    : table.rows;
  props.cells = cells;
  props.hasHeader = table.headerRow.length > 0;
  // 첫 칸은 항목명이라 왼쪽, 나머지는 값·기호라 가운데 정렬이 읽기 좋다
  props.colAligns = Array.from({ length: cells[0]?.length ?? 1 }, (_, i) =>
    i === 0 ? "left" : "center",
  );
  block.h = Math.max(TABLE_ROW_HEIGHT * 2, cells.length * TABLE_ROW_HEIGHT);
  return block;
}

/** 표 제목 텍스트 블록 */
function tableTitleBlock(title: string, y: number): Block {
  const block = createBlock("text", { x: 40, y });
  block.w = 714;
  block.h = 24;
  const props = block.props as BlockPropsMap["text"];
  props.text = `▶ ${title}`;
  props.fontSize = 12;
  return block;
}

/** 이 표 제목이 이미 양식에 있는지 (양식 기반 생성에서 중복 추가를 막는다) */
function hasTableTitle(doc: EditorDoc, title: string): boolean {
  if (!title) return false;
  const needle = normalizeLabel(title);
  return doc.blocks.some((b) => {
    if (b.type !== "text" && b.type !== "title") return false;
    const text = (b.props as BlockPropsMap["text"]).text ?? "";
    return normalizeLabel(text).includes(needle);
  });
}

/** 이 안내문과 같은 제목의 텍스트 블록이 이미 양식에 있는지 */
function hasNoteHeading(doc: EditorDoc, heading: string): boolean {
  if (!heading) return true; // 제목 없는 섹션은 중복 판단이 불가 → 추가하지 않는다
  const needle = normalizeLabel(heading);
  return doc.blocks.some((b) => {
    if (b.type !== "text" && b.type !== "title") return false;
    const text = (b.props as BlockPropsMap["text"]).text ?? "";
    return normalizeLabel(text).includes(needle);
  });
}

/**
 * 표준 양식(EditorDoc)을 베이스로 스펙 값을 채운다 (F-212).
 * 레이아웃·고정 문구·공급자 정보는 양식이 정답이므로 건드리지 않고,
 * 거래처 메타 필드와 품목표만 채운다.
 *
 * 단, 요청에서 새로 나온 안내문(특약·결제조건 등)이 양식에 없으면 문서 맨 아래에 덧붙인다.
 * 그러지 않으면 사용자가 프롬프트로 요청한 조건이 조용히 사라진다.
 */
export function fillTemplateDoc(base: EditorDoc, spec: DocSpec): EditorDoc {
  const doc = cloneDoc(base);
  for (const block of doc.blocks) {
    if (block.type === "clientMeta") {
      fillMetaBlock(block, spec.clientFields);
      /*
       * 채운 뒤 **역할**을 배정한다. 양식·모델이 라벨을 정하므로(`수요기관`·`발주처`)
       * 라벨 조각만으로는 거래처명 필드를 못 찾는다 — 그러면 Document.clientName 이
       * 영영 동기화되지 않아 목록과 본문이 다른 거래처를 주장한다. 값은 우리가 안다.
       */
      assignMetaRoles(block, { clientName: spec.clientName });
    } else if (block.type === "itemTable") {
      fillItemTableBlock(block, spec);
    }
  }

  // 양식에 없는 격자 표·안내문은 문서 맨 아래에 덧붙인다.
  // 그러지 않으면 원본에 있던 등급 매트릭스나 사용자가 요청한 조건이 조용히 사라진다.
  const hasGrid = doc.blocks.some((b) => b.type === "table");
  const newTables = spec.tables.filter(
    (table) => !(hasGrid && hasTableTitle(doc, table.title)),
  );
  const newNotes = spec.notes.filter((note) => !hasNoteHeading(doc, note.heading));

  if (newTables.length > 0 || newNotes.length > 0) {
    let y = doc.blocks.reduce((max, b) => Math.max(max, b.y + b.h), 0) + 24;
    for (const table of newTables) {
      if (table.title) {
        const titleBlock = tableTitleBlock(table.title, y);
        doc.blocks.push(titleBlock);
        y += titleBlock.h + 4;
      }
      const grid = tableBlock(table, y);
      doc.blocks.push(grid);
      y += grid.h + 24;
    }
    for (const note of newNotes) {
      const block = noteBlock(note, y);
      doc.blocks.push(block);
      y += block.h + 12;
    }
  }

  return withPageCount(doc);
}

/** 기본 거래처 메타 필드 (스펙이 비어 있을 때) */
function defaultClientFields(spec: DocSpec): SpecField[] {
  return [
    { label: "고객사명", value: spec.clientName },
    { label: "수신자", value: "" },
    { label: "작성일", value: "" },
    { label: "유효기간", value: "" },
  ];
}

/**
 * 양식이 없을 때 스펙만으로 문서를 조립한다.
 * 좌표·크기는 seedTemplate 과 같은 A4 배치 규칙을 따른다.
 */
export function buildDocFromSpec(
  spec: DocSpec,
  opts: { supplierName: string; logoUrl?: string | null },
): EditorDoc {
  const blocks: Block[] = [];

  // 로고 (브랜딩 로고가 있을 때만 이미지 값을 채운다)
  const logo = createBlock("image", { x: 40, y: 48 });
  logo.w = 200;
  logo.h = 30;
  const logoProps = logo.props as BlockPropsMap["image"];
  logoProps.alt = "회사 로고";
  if (opts.logoUrl) logoProps.dataUrl = opts.logoUrl;
  blocks.push(logo);

  // 대제목
  const heading = createBlock("title", { x: 247, y: 56 });
  (heading.props as BlockPropsMap["title"]).text = spec.headingText;
  blocks.push(heading);

  // 공급자 정보 — 스펙이 없으면 브랜딩 회사명만 채운 기본 필드
  const supplier = createBlock("supplier", { x: 437, y: 130 });
  const supplierProps = supplier.props as BlockPropsMap["supplier"];
  if (spec.supplierFields.length > 0) {
    supplierProps.fields = spec.supplierFields.map((f) => ({
      id: uid(),
      label: f.label,
      value: f.value,
    }));
  } else {
    // 공급자명 필드는 **역할**로 찾는다 (라벨 문자열 비교는 라벨을 고치면 끊긴다)
    const target = findMetaField(supplierProps.fields, "supplierName");
    supplierProps.fields = supplierProps.fields.map((f) =>
      f.id === target?.id ? { ...f, value: opts.supplierName } : f,
    );
  }
  assignMetaRoles(supplier, { supplierName: opts.supplierName });
  supplier.h = Math.max(140, 12 + supplierProps.fields.length * FIELD_ROW_HEIGHT);
  blocks.push(supplier);

  // 거래처·문서 메타
  const clientMeta = createBlock("clientMeta", { x: 40, y: 130 });
  const clientProps = clientMeta.props as BlockPropsMap["clientMeta"];
  const clientFields =
    spec.clientFields.length > 0 ? spec.clientFields : defaultClientFields(spec);
  clientProps.fields = clientFields.map((f) => ({
    id: uid(),
    label: f.label,
    value: f.value,
  }));
  assignMetaRoles(clientMeta, { clientName: spec.clientName });
  clientMeta.h = Math.max(150, 12 + clientFields.length * FIELD_ROW_HEIGHT);
  blocks.push(clientMeta);

  let y = Math.max(
    supplier.y + supplier.h,
    clientMeta.y + clientMeta.h,
  ) + 40;

  // 품목표 (금액 정보가 있을 때만)
  if (spec.items.length > 0) {
    const itemTable = createBlock("itemTable", { x: 40, y });
    itemTable.w = 714;
    const props = itemTable.props as BlockPropsMap["itemTable"];
    props.rows = spec.items.map((it) => ({
      id: uid(),
      name: it.name,
      description: it.description,
      quantity: it.quantity,
      unitPrice: it.unitPrice,
    }));
    // 총계 표식은 마지막 행(프롬프트가 지시한 `합계 (VAT 포함)`)에 굳힌다
    props.summaryRows = normalizeSummaryRows(
      spec.summaryRows.map((r) => ({
        id: uid(),
        label: r.label,
        formula: r.formula,
      })),
    );
    itemTable.h = itemTableHeight(props.rows.length, props.summaryRows.length);
    blocks.push(itemTable);
    y += itemTable.h + 24;
  }

  // 격자 표 (등급 매트릭스·조건표 등) — 품목표 아래, 안내문 위
  for (const table of spec.tables) {
    if (table.title) {
      const titleBlock = tableTitleBlock(table.title, y);
      blocks.push(titleBlock);
      y += titleBlock.h + 4;
    }
    const grid = tableBlock(table, y);
    blocks.push(grid);
    y += grid.h + 24;
  }

  // 하단 안내·약관 섹션
  for (const note of spec.notes) {
    const section = noteBlock(note, y);
    blocks.push(section);
    y += section.h + 12;
  }

  return withPageCount({
    version: 1,
    canvas: { w: A4.w, h: A4.h, pages: 1 },
    blocks,
  });
}

/** 양식이 있으면 채우고, 없으면 새로 조립한다 */
export function specToEditorDoc(
  spec: DocSpec,
  opts: {
    base?: EditorDoc | null;
    supplierName: string;
    logoUrl?: string | null;
  },
): EditorDoc {
  return opts.base
    ? fillTemplateDoc(opts.base, spec)
    : buildDocFromSpec(spec, {
        supplierName: opts.supplierName,
        logoUrl: opts.logoUrl,
      });
}

/**
 * 최종 문서 본문에서 품목 행을 뽑는다 (DocumentItem 동기화용).
 *
 * 스펙(spec.items)을 그대로 쓰면 안 된다 — 양식 기반 생성처럼 스펙이 비어 있어
 * 양식의 품목이 그대로 남는 경우, 또는 부분 재작성에서 품목표를 유지한 경우
 * 본문과 라인아이템이 어긋난다. 항상 본문이 정답이다.
 */
export function extractItemRows(doc: EditorDoc): SpecItem[] {
  return doc.blocks
    .filter((b) => b.type === "itemTable")
    .flatMap((b) => (b.props as BlockPropsMap["itemTable"]).rows ?? [])
    .filter((row) => Boolean(row?.name))
    .map((row) => ({
      name: row.name,
      description: row.description ?? "",
      quantity: Number(row.quantity) || 0,
      unitPrice: Number(row.unitPrice) || 0,
    }));
}

/** 생성 문서의 총액 (품목표 요약행이 있으면 마지막 요약행 값) */
export function docTotal(doc: EditorDoc): number {
  return doc.blocks
    .filter((b) => b.type === "itemTable")
    .reduce(
      (sum, b) => sum + itemTableGrandTotal(b.props as BlockPropsMap["itemTable"]),
      0,
    );
}
