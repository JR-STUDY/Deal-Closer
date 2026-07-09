/**
 * 블록 캔버스 에디터의 문서 모델.
 * Document.contentJson 에 EditorDoc(JSON 직렬화)로 저장한다.
 * (서버·클라이언트 공용 순수 모듈 — server-only import 금지)
 */

import { DOCUMENT_TYPE_LABELS, type DocumentType } from "./constants";

export const A4 = { w: 794, h: 1123 } as const; // A4 @96dpi(px)

export const BLOCK_TYPES = [
  "title",
  "text",
  "supplier",
  "clientMeta",
  "itemTable",
  "table",
  "image",
  "divider",
] as const;
export type BlockType = (typeof BLOCK_TYPES)[number];

export const BLOCK_LABELS: Record<BlockType, string> = {
  title: "문서 제목",
  text: "텍스트",
  supplier: "공급자 정보",
  clientMeta: "거래처·견적",
  itemTable: "품목 표",
  table: "표",
  image: "이미지",
  divider: "구분선",
};

export type Align = "left" | "center" | "right";

/** 겹친 블록의 앞뒤 순서(z) 조작 동작 */
export type ZOrderAction = "front" | "back" | "forward" | "backward";

export type FontFamily = "sans" | "serif" | "mono";

/** fontFamily 키 → 실제 CSS font-family */
export const FONT_FAMILIES: Record<FontFamily, string> = {
  sans: "ui-sans-serif, system-ui, sans-serif",
  serif: "ui-serif, Georgia, 'Nanum Myeongjo', serif",
  mono: "ui-monospace, 'SFMono-Regular', monospace",
};

export const FONT_FAMILY_LABELS: Record<FontFamily, string> = {
  sans: "고딕",
  serif: "명조",
  mono: "고정폭",
};

/** 텍스트 계열(title/text) 공통 스타일 */
export type TextStyle = {
  text: string;
  align: Align;
  fontSize: number;
  fontFamily: FontFamily;
  color: string;
  border: boolean;
  borderColor: string;
};

export type ItemRow = {
  id: string;
  name: string;
  description: string;
  quantity: number;
  unitPrice: number;
  /** 사용자 추가 열 값 (colId → 값) */
  extra?: Record<string, string>;
};

/** 품목표 사용자 추가 열 정의 */
export type TableColumn = { id: string; label: string; align: Align };

/** 품목표 요약(수식) 행 — 예: 공급가액/부가세/합계 (#9) */
export type SummaryRow = { id: string; label: string; formula: string };

/** 카탈로그(마스터 데이터) 품목 — 품목표에서 드롭다운으로 선택 (#6) */
export type CatalogOption = {
  id: string;
  name: string;
  unitPrice: number;
  description: string | null;
  category: string;
  unit: string;
};

export type MetaField = { id: string; label: string; value: string };

export type BlockPropsMap = {
  title: TextStyle;
  text: TextStyle;
  supplier: { fields: MetaField[]; labelWidth: number };
  clientMeta: { fields: MetaField[]; labelWidth: number };
  itemTable: {
    rows: ItemRow[];
    showTotal: boolean;
    extraColumns: TableColumn[];
    summaryRows: SummaryRow[];
  };
  table: { hasHeader: boolean; cells: string[][]; colAligns: Align[] };
  image: {
    dataUrl: string;
    alt: string;
    fit: "contain" | "cover";
    opacity: number;
    border: boolean;
    borderColor: string;
  };
  divider: {
    orientation: "horizontal" | "vertical";
    color: string;
    thickness: number;
    dashed: boolean;
  };
};

export type AnyBlockProps = BlockPropsMap[BlockType];

export type Block = {
  id: string;
  type: BlockType;
  x: number;
  y: number;
  w: number;
  h: number;
  z: number;
  locked: boolean;
  props: AnyBlockProps;
};

export type EditorDoc = {
  version: 1;
  /** w·h = 한 페이지(A4) 크기, pages = 페이지 수 (#8) */
  canvas: { w: number; h: number; pages: number };
  blocks: Block[];
};

/** 문서 페이지 수 (최소 1) */
export function pageCount(doc: EditorDoc): number {
  return Math.max(1, doc.canvas.pages ?? 1);
}

export function uid(): string {
  return typeof crypto !== "undefined" && "randomUUID" in crypto
    ? crypto.randomUUID()
    : `id-${Math.random().toString(36).slice(2)}`;
}

const DEFAULT_SIZE: Record<BlockType, { w: number; h: number }> = {
  title: { w: 300, h: 56 },
  text: { w: 360, h: 120 },
  supplier: { w: 317, h: 140 },
  clientMeta: { w: 360, h: 150 },
  itemTable: { w: 714, h: 220 },
  table: { w: 360, h: 120 },
  image: { w: 160, h: 80 },
  divider: { w: 714, h: 2 },
};

function textStyle(overrides: Partial<TextStyle> = {}): TextStyle {
  return {
    text: "내용을 입력하세요.",
    align: "left",
    fontSize: 13,
    fontFamily: "sans",
    color: "#111827",
    border: false,
    borderColor: "#e5e7eb",
    ...overrides,
  };
}

export function defaultProps(type: BlockType): AnyBlockProps {
  switch (type) {
    case "title":
      return textStyle({ text: "견 적 서", align: "center", fontSize: 28 });
    case "text":
      return textStyle();
    case "supplier":
      return {
        labelWidth: 72,
        fields: [
          { id: uid(), label: "상호", value: "" },
          { id: uid(), label: "대표자", value: "" },
          { id: uid(), label: "등록번호", value: "" },
          { id: uid(), label: "주소", value: "" },
          { id: uid(), label: "전화", value: "" },
          { id: uid(), label: "이메일", value: "" },
        ],
      };
    case "clientMeta":
      return {
        labelWidth: 96,
        fields: [
          { id: uid(), label: "고객사명", value: "" },
          { id: uid(), label: "수신자", value: "" },
          { id: uid(), label: "견적일", value: "" },
          { id: uid(), label: "유효기간", value: "" },
        ],
      };
    case "itemTable":
      return { rows: [], showTotal: true, extraColumns: [], summaryRows: [] };
    case "table":
      return {
        hasHeader: true,
        cells: [
          ["항목", "값"],
          ["", ""],
        ],
        colAligns: ["left", "left"],
      };
    case "image":
      return {
        dataUrl: "",
        alt: "이미지",
        fit: "contain",
        opacity: 100,
        border: false,
        borderColor: "#e5e7eb",
      };
    case "divider":
      return {
        orientation: "horizontal",
        color: "#d1d5db",
        thickness: 1,
        dashed: false,
      };
  }
}

export function createBlock(
  type: BlockType,
  pos?: { x?: number; y?: number },
): Block {
  const size = DEFAULT_SIZE[type];
  return {
    id: uid(),
    type,
    x: pos?.x ?? 40,
    y: pos?.y ?? 40,
    w: size.w,
    h: size.h,
    z: 1,
    locked: false,
    props: defaultProps(type),
  };
}

export function calcItemTableTotal(rows: ItemRow[]): number {
  if (!Array.isArray(rows)) return 0;
  // 행 표시와 동일한 식(수량×단가)으로 계산해 합계 불일치를 방지한다.
  // 값은 인스펙터에서 정수로 강제되므로 KRW 정수 정책을 유지한다 (FORM_CURRENCY_KRW).
  return rows.reduce(
    (sum, r) => sum + (Number(r.quantity) || 0) * (Number(r.unitPrice) || 0),
    0,
  );
}

/**
 * 안전한 산술 수식 평가기 (eval/Function 미사용 — 서버·클라이언트 공용).
 * 지원: 숫자, + - * / , 괄호, 단항 -, 변수(vars 맵). 알 수 없는 토큰은 0.
 * 사용 변수: subtotal(품목 수량×단가 합계).
 */
export function evalFormula(expr: string, vars: Record<string, number>): number {
  const tokens = String(expr).match(/\d+\.?\d*|[a-zA-Z_]\w*|[()+\-*/]/g) ?? [];
  let pos = 0;
  const peek = () => tokens[pos];
  const next = () => tokens[pos++];

  function factor(): number {
    const t = peek();
    if (t === "(") {
      next();
      const v = expr2();
      if (peek() === ")") next();
      return v;
    }
    if (t === "-") {
      next();
      return -factor();
    }
    if (t === undefined) return 0;
    next();
    if (/^\d/.test(t)) return parseFloat(t);
    return vars[t] ?? 0;
  }
  function term(): number {
    let v = factor();
    while (peek() === "*" || peek() === "/") {
      const op = next();
      const r = factor();
      v = op === "*" ? v * r : r === 0 ? 0 : v / r;
    }
    return v;
  }
  function expr2(): number {
    let v = term();
    while (peek() === "+" || peek() === "-") {
      const op = next();
      const r = term();
      v = op === "+" ? v + r : v - r;
    }
    return v;
  }
  const result = expr2();
  return Number.isFinite(result) ? result : 0;
}

/** 품목표 요약 행들을 평가한다 (subtotal = 품목 합계). 값은 KRW 정수로 반올림. */
export function evalSummaryRows(
  props: BlockPropsMap["itemTable"],
): { row: SummaryRow; value: number }[] {
  const subtotal = calcItemTableTotal(props.rows);
  return (props.summaryRows ?? []).map((row) => ({
    row,
    value: Math.round(evalFormula(row.formula, { subtotal })),
  }));
}

/** 품목표의 최종 총계: 요약 행이 있으면 마지막 행 값, 없으면 품목 합계. */
export function itemTableGrandTotal(props: BlockPropsMap["itemTable"]): number {
  const summaries = props.summaryRows ?? [];
  const subtotal = calcItemTableTotal(props.rows);
  if (!summaries.length) return subtotal;
  return Math.round(
    evalFormula(summaries[summaries.length - 1].formula, { subtotal }),
  );
}

export function computeAmount(doc: EditorDoc): number {
  return doc.blocks
    .filter((b) => b.type === "itemTable")
    .reduce(
      (sum, b) => sum + itemTableGrandTotal(b.props as BlockPropsMap["itemTable"]),
      0,
    );
}

/** 금액 수식 예시 프리셋 (#9) — 인스펙터에서 불러오기 */
export const FORMULA_PRESETS: {
  label: string;
  rows: { label: string; formula: string }[];
}[] = [
  {
    label: "부가세 포함 합계",
    rows: [
      { label: "공급가액", formula: "subtotal" },
      { label: "부가세 (10%)", formula: "subtotal * 0.1" },
      { label: "합계 (VAT 포함)", formula: "subtotal * 1.1" },
    ],
  },
  {
    label: "합계만",
    rows: [{ label: "합계", formula: "subtotal" }],
  },
];

/** 블록 하나가 렌더 가능한 최소 형태를 갖췄는지 검증한다. */
function isValidBlock(b: unknown): b is Block {
  if (typeof b !== "object" || b === null) return false;
  const x = b as Record<string, unknown>;
  return (
    typeof x.id === "string" &&
    typeof x.type === "string" &&
    (BLOCK_TYPES as readonly string[]).includes(x.type) &&
    typeof x.x === "number" &&
    typeof x.y === "number" &&
    typeof x.w === "number" &&
    typeof x.h === "number" &&
    typeof x.props === "object" &&
    x.props !== null
  );
}

/**
 * contentJson 문자열을 EditorDoc 으로 안전 파싱한다.
 * 형태가 어긋나거나 유효 블록이 없으면 null 을 반환하고,
 * 개별 블록도 최소 스키마를 검증해 렌더 크래시를 방지한다.
 */
export function parseContentJson(
  raw: string | null | undefined,
): EditorDoc | null {
  if (!raw) return null;
  try {
    const obj = JSON.parse(raw) as unknown;
    if (
      typeof obj !== "object" ||
      obj === null ||
      !("blocks" in obj) ||
      !Array.isArray((obj as EditorDoc).blocks)
    ) {
      return null;
    }
    const doc = obj as EditorDoc;
    const blocks: Block[] = doc.blocks.filter(isValidBlock).map((b) => ({
      ...b,
      z: typeof b.z === "number" ? b.z : 1,
      locked: typeof b.locked === "boolean" ? b.locked : false,
    }));
    return {
      version: 1,
      canvas: {
        w: doc.canvas?.w ?? A4.w,
        h: doc.canvas?.h ?? A4.h,
        pages: Math.max(1, doc.canvas?.pages ?? 1),
      },
      blocks,
    };
  } catch {
    return null;
  }
}

/** 거래처 메타 블록에서 "고객사명" 값을 추출한다 (Document.clientName 동기화용). */
export function extractClientName(doc: EditorDoc): string | null {
  const meta = doc.blocks.find((b) => b.type === "clientMeta");
  if (!meta) return null;
  const fields = (meta.props as BlockPropsMap["clientMeta"]).fields;
  if (!Array.isArray(fields)) return null;
  const field = fields.find((f) => f.label?.includes("고객사"));
  const value = field?.value?.trim();
  return value ? value : null;
}

/** contentJson 이 없는 문서를 위한 기본 문서 템플릿 시드. */
export function seedTemplate(input: {
  type: string;
  clientName: string | null;
  supplierName: string;
  logoUrl?: string | null;
  items: {
    name: string;
    description: string | null;
    quantity: number;
    unitPrice: number;
  }[];
}): EditorDoc {
  const typeLabel =
    DOCUMENT_TYPE_LABELS[input.type as DocumentType] ?? "견적서";

  // 로고 블록 — 브랜딩 로고(있으면)를 기본값으로. 원본 700×105 비율(≈6.67:1)에 맞춘 크기.
  const logo = createBlock("image", { x: 40, y: 48 });
  logo.w = 200;
  logo.h = 30;
  const logoProps = logo.props as BlockPropsMap["image"];
  logoProps.alt = "회사 로고";
  if (input.logoUrl) logoProps.dataUrl = input.logoUrl;

  const title = createBlock("title", { x: 247, y: 56 });
  // 문서 종류에 맞는 제목을 시드한다 (계약서/NDA/제안서에서 "견적서"로 뜨지 않도록).
  (title.props as BlockPropsMap["title"]).text = typeLabel;

  const supplier = createBlock("supplier", { x: 437, y: 130 });
  const supplierProps = supplier.props as BlockPropsMap["supplier"];
  // 첫 필드(상호) 값에 공급자명을 시드한다.
  supplierProps.fields = supplierProps.fields.map((f) =>
    f.label === "상호" ? { ...f, value: input.supplierName } : f,
  );

  const clientMeta = createBlock("clientMeta", { x: 40, y: 130 });
  (clientMeta.props as BlockPropsMap["clientMeta"]).fields = [
    { id: uid(), label: "고객사명", value: input.clientName ?? "" },
    { id: uid(), label: "수신자", value: "" },
    { id: uid(), label: "견적일", value: "" },
    { id: uid(), label: "유효기간", value: "" },
  ];

  const itemTable = createBlock("itemTable", { x: 40, y: 320 });
  (itemTable.props as BlockPropsMap["itemTable"]).rows = input.items.map(
    (it) => ({
      id: uid(),
      name: it.name,
      description: it.description ?? "",
      quantity: it.quantity,
      unitPrice: it.unitPrice,
    }),
  );

  const notice = createBlock("text", { x: 40, y: 650 });
  notice.w = 714;
  (notice.props as BlockPropsMap["text"]).text =
    "※ 상기 견적은 부가세 별도입니다.";

  return {
    version: 1,
    canvas: { w: A4.w, h: A4.h, pages: 1 },
    blocks: [logo, title, supplier, clientMeta, itemTable, notice],
  };
}
