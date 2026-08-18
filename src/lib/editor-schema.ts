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

/**
 * fontFamily 키 → 실제 CSS font-family.
 *
 * **화면과 인쇄가 같은 스택을 쓴다.** 예전에는 화면용(여기)과 인쇄용(`pdf-html.ts`)이
 * 따로 있었는데, 그러면 같은 글에서 줄바꿈 지점이 달라져 화면에서 딱 맞춘 블록이
 * PDF 에서 넘치거나 남는다. 한글 글꼴을 명시하는 이유·순서는 아래 주석 참고.
 *
 * 순서가 중요하다. 글꼴 대체는 글자 단위로 왼쪽부터 찾으므로, 계열에 맞는 **한글**
 * 글꼴을 라틴 글꼴 바로 뒤에 두어야 한다. 고딕 글꼴을 앞에 두면 명조를 골라도 한글만
 * 고딕으로 나온다. 맨 끝의 고딕은 어느 한글 글꼴도 없을 때 두부(□)를 피하려는 최후
 * 수단이다 — 헤드리스 브라우저는 한글 글꼴이 없는 리눅스 컨테이너에서도 돌 수 있다.
 * 실제로 어떤 글꼴이 쓰였는지는 `pdf.ts` 의 `checkKoreanFonts()` 로 확인한다.
 */
export const FONT_FAMILIES: Record<FontFamily, string> = {
  sans: 'ui-sans-serif, system-ui, "Apple SD Gothic Neo", "Noto Sans KR", "Malgun Gothic", "Nanum Gothic", sans-serif',
  serif:
    'ui-serif, Georgia, "Nanum Myeongjo", "Noto Serif KR", AppleMyungjo, Batang, "Apple SD Gothic Neo", serif',
  mono: 'ui-monospace, SFMono-Regular, "D2Coding ligature", D2Coding, "Noto Sans Mono CJK KR", "Nanum Gothic Coding", "Apple SD Gothic Neo", monospace',
};

export const FONT_FAMILY_LABELS: Record<FontFamily, string> = {
  sans: "고딕",
  serif: "명조",
  mono: "고정폭",
};

/**
 * 텍스트 계열(title/text) 공통 스타일.
 *
 * 서식은 **블록 단위**다 — 한 블록 안에서 특정 단어만 굵게 하는 부분 서식(리치텍스트)은
 * 문서 모델을 문자열에서 인라인 런(run) 배열로 바꿔야 해서 별도 과제로 둔다.
 * 강조할 문구는 텍스트 블록을 나눠 표현한다.
 */
export type TextStyle = {
  text: string;
  align: Align;
  fontSize: number;
  fontFamily: FontFamily;
  color: string;
  border: boolean;
  borderColor: string;
  /**
   * 아래 세 값은 나중에 추가됐다 — **기존 contentJson 에는 없다.**
   * 그래서 옵셔널로 두고 읽는 쪽이 `textFormat()` 으로 기본값을 채운다.
   * 필수로 만들면 예전 문서를 열 때마다 굵기·줄 높이가 통째로 초기화된다.
   */
  bold?: boolean;
  italic?: boolean;
  /** 줄 높이 배수 (1.625 = 기존 leading-relaxed) */
  lineHeight?: number;
};

/** 제목 블록의 기본 굵기 — 제목은 굵게, 본문은 보통이 기존 모습이다 */
const DEFAULT_BOLD: Record<"title" | "text", boolean> = {
  title: true,
  text: false,
};

/** 기존 문서에 없던 서식 값의 기본값 (화면·인쇄가 같은 기본값을 써야 한다) */
export const DEFAULT_LINE_HEIGHT = 1.625;

/**
 * 텍스트 블록의 서식을 기본값까지 채워 돌려준다.
 * 화면 렌더러·인쇄 렌더러·인스펙터가 **같은 기본값**을 써야 예전 문서가 서로 다르게 보이지 않는다.
 */
export function textFormat(
  props: TextStyle,
  type: "title" | "text",
): { bold: boolean; italic: boolean; lineHeight: number } {
  return {
    bold: props.bold ?? DEFAULT_BOLD[type],
    italic: props.italic ?? false,
    lineHeight:
      typeof props.lineHeight === "number" && props.lineHeight > 0
        ? props.lineHeight
        : DEFAULT_LINE_HEIGHT,
  };
}

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

/**
 * 표 병합 범위 — 시작 셀(r, c)에서 rs 행 × cs 열.
 * 값은 시작 셀의 `cells[r][c]` 를 쓰고, 덮인 셀은 렌더에서 건너뛴다.
 */
export type TableMerge = { r: number; c: number; rs: number; cs: number };

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
  table: {
    hasHeader: boolean;
    cells: string[][];
    colAligns: Align[];
    /**
     * 열 폭 (%). 없으면 브라우저 자동 배분 — 기존 문서가 그대로 보인다.
     * px 가 아니라 **비율**로 두는 이유: 블록 폭을 줄이면 표도 같이 줄어야 하는데
     * px 로 저장하면 합이 블록보다 커져 표가 넘치거나 마지막 열이 잘린다.
     */
    colWidths?: number[];
    /**
     * 행 높이 (px). 표 레이아웃에서 행 높이는 **최소값**으로 동작한다 —
     * 내용이 더 크면 그만큼 늘어난다(줄여도 글자가 잘리지 않는다).
     * 없으면 예전처럼 내용에 맞춰진다.
     */
    rowHeights?: number[];
    /**
     * 병합 범위 (진단 5) — 계약서 표에는 병합 셀이 필수다.
     * `cells` 는 그대로 두고 병합만 얹는다 → 기존 문서와 호환된다(없으면 병합 없음).
     */
    merges?: TableMerge[];
  };
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

/**
 * 해당 페이지에 **걸치는** 블록만 골라 z 오름차순으로 준다.
 *
 * 캔버스는 여러 페이지를 한 장으로 이어 그리지만 미리보기와 PDF 는 한 장씩 그리므로
 * 페이지 경계에 걸친 블록은 양쪽에 모두 나와야 한다(각 페이지에서 잘려 이어진다).
 * 미리보기(`editor-preview`)와 인쇄(`pdf-html`)가 이 판정을 각자 구현하고 있었다 —
 * 한쪽만 손보면 화면과 PDF 의 쪽 나눔이 조용히 어긋난다.
 */
export function blocksOnPage(doc: EditorDoc, pageIndex: number): Block[] {
  const h = doc.canvas.h;
  return doc.blocks
    .filter((b) => b.y < (pageIndex + 1) * h && b.y + b.h > pageIndex * h)
    .sort((a, b) => a.z - b.z);
}

/**
 * 겹침 순서(z)를 바꾸고 **전체를 1..n 으로 정규화**한다.
 *
 * 정규화가 핵심이다. 예전에는 "맨 뒤로" 가 `min - 1` 을 주어 z 가 음수까지 내려갔는데,
 * 캔버스·페이지 컨테이너가 흰 배경을 가진 **stacking context 가 아닌** 요소라서
 * 음수 z 자식은 부모 배경 **뒤로** 들어가 화면과 PDF 에서 통째로 사라졌다.
 * (컨테이너에 `isolation: isolate` 도 함께 걸어 이미 저장된 음수 z 도 살려낸다.)
 *
 * 규칙을 컴포넌트가 아니라 여기 두는 이유: 캔버스·인스펙터·컨텍스트 메뉴가 같은 판정을
 * 공유해야 하고, 순수 함수여야 테스트로 경계를 지킬 수 있다.
 */
export function reorderZ(
  blocks: Block[],
  id: string,
  action: ZOrderAction,
): Block[] {
  return reorderZMany(blocks, [id], action);
}

/**
 * 여러 블록의 겹침 순서를 **묶음째** 바꾼다 (다중선택).
 *
 * `reorderZ` 를 id 마다 차례로 부르면 안 된다 — 선택 내부의 상대 순서가 뒤집힌다.
 * 예: A(1) B(2) C(3) 에서 B·C 를 "앞으로" 보내려고 높은 것부터 부르면 C 는 이미 맨 앞이라
 * 제자리, 그다음 B 가 C 를 넘어가 **B 가 C 위**로 올라간다(원래 순서와 반대).
 * 그래서 선택을 하나의 묶음으로 떼어 낸 뒤 통째로 끼워 넣는다.
 *
 * "앞으로"·"뒤로" 는 묶음 **바로 위/아래의 비선택 블록 하나**를 뛰어넘는 것으로 정의한다.
 */
export function reorderZMany(
  blocks: Block[],
  ids: readonly string[],
  action: ZOrderAction,
): Block[] {
  const set = new Set(ids);

  // 현재 순서(z 오름차순, 동순위는 기존 배열 순서)
  const ordered = blocks
    .map((block, index) => ({ block, index }))
    .sort((a, b) => a.block.z - b.block.z || a.index - b.index)
    .map((entry) => entry.block);

  const selected = ordered.filter((b) => set.has(b.id));
  const rest = ordered.filter((b) => !set.has(b.id));
  // 아무것도 안 골랐거나 전부 골랐으면 상대 순서가 바뀔 수 없다
  if (selected.length === 0 || rest.length === 0) return blocks;

  /** 선택 묶음을 rest 의 `at` 위치에 끼운다 */
  const insertAt = (at: number) => [
    ...rest.slice(0, at),
    ...selected,
    ...rest.slice(at),
  ];

  let next: Block[];
  if (action === "front") {
    next = [...rest, ...selected];
  } else if (action === "back") {
    next = [...selected, ...rest];
  } else if (action === "forward") {
    // 가장 위 선택 블록보다 위에 있는 첫 비선택 블록을 넘는다 (없으면 이미 맨 앞)
    let topSel = -1;
    for (let i = 0; i < ordered.length; i++) if (set.has(ordered[i].id)) topSel = i;
    const neighbor = ordered.slice(topSel + 1).find((b) => !set.has(b.id));
    if (!neighbor) return blocks;
    next = insertAt(rest.indexOf(neighbor) + 1);
  } else {
    // 가장 아래 선택 블록보다 아래에 있는 마지막 비선택 블록 앞으로 내린다
    const botSel = ordered.findIndex((b) => set.has(b.id));
    const below = ordered.slice(0, botSel).filter((b) => !set.has(b.id));
    const neighbor = below[below.length - 1];
    if (!neighbor) return blocks;
    next = insertAt(rest.indexOf(neighbor));
  }

  // 1..n 으로 다시 매긴다 — 음수·0 이 생기지 않고 값이 무한정 커지지도 않는다
  const zById = new Map(next.map((block, index) => [block.id, index + 1]));
  if (blocks.every((block) => zById.get(block.id) === block.z)) return blocks;
  return blocks.map((block) => {
    const z = zById.get(block.id);
    return z === undefined || z === block.z ? block : { ...block, z };
  });
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

/**
 * 문서 본문에서 금액을 도출한다. **품목표 블록이 하나도 없으면 `null`** 이다.
 *
 * "합계 0원"과 "이 문서는 금액을 품목표로 표현하지 않는다"는 **다른 사실**이다.
 * 계약서·NDA 처럼 품목표 없이 금액만 가진 문서를 저장할 때 이 둘을 같게 취급하면,
 * 본문을 한 글자도 고치지 않은 저장 한 번으로 `Document.amount` 가 0 이 되고
 * 확정 문서를 통해 기회 예상 금액까지 0 으로 끌어내린다 (기회-6).
 * `null` 은 "쓸 근거가 없으니 저장된 값을 그대로 두라"는 뜻이다.
 */
export function deriveAmount(doc: EditorDoc): number | null {
  const tables = doc.blocks.filter((b) => b.type === "itemTable");
  if (tables.length === 0) return null;
  return tables.reduce(
    (sum, b) => sum + itemTableGrandTotal(b.props as BlockPropsMap["itemTable"]),
    0,
  );
}

/** 화면 표시용 총액 — 근거가 없으면 0 으로 본다 (저장에는 `deriveAmount` 를 쓴다). */
export function computeAmount(doc: EditorDoc): number {
  return deriveAmount(doc) ?? 0;
}

// ─────────────────────────── 표 셀 병합 (진단 5) ───────────────────────────

/** 셀 하나를 어떻게 그릴지 — `skip` 이면 다른 셀에 덮였으므로 렌더하지 않는다 */
export type TableCellLayout = {
  skip: boolean;
  rowSpan: number;
  colSpan: number;
};

/**
 * 병합 범위를 **유효한 것만** 남긴다.
 *
 * 셀 격자는 사용자가 행·열을 지우면서 계속 변하는데 병합 범위는 좌표로 저장된다.
 * 그래서 그릴 때마다 걸러야 한다 — 범위 밖이거나 1×1 이거나 **이미 다른 병합에 덮인**
 * 범위는 버린다. 겹친 병합을 그대로 렌더하면 colspan 합이 열 수를 넘어 표가 깨진다.
 * 먼저 선언된 병합이 이긴다(사용자가 만든 순서를 존중한다).
 */
/** 열 폭 최소값(%) — 이보다 좁아지면 글자가 한 자도 안 들어가 다시 잡을 수 없다 */
export const MIN_COL_PERCENT = 4;

/**
 * 열 폭 배열을 열 개수에 맞춰 정리한다 (합 100%).
 *
 * 행·열을 더하거나 지우면 길이가 어긋나는데, 그대로 `<colgroup>` 에 넣으면 마지막 열이
 * 사라지거나 표가 통째로 찌그러진다. 저장된 값이 없거나 못 쓰면 **균등 분배**로 돌린다.
 */
export function normalizeColWidths(
  widths: number[] | undefined,
  colCount: number,
): number[] {
  if (colCount <= 0) return [];
  const even = 100 / colCount;
  if (!Array.isArray(widths) || widths.length !== colCount) {
    return Array.from({ length: colCount }, () => even);
  }
  const clean = widths.map((w) =>
    typeof w === "number" && Number.isFinite(w) && w > 0 ? w : even,
  );
  const sum = clean.reduce((a, b) => a + b, 0);
  if (sum <= 0) return Array.from({ length: colCount }, () => even);
  // 합을 100 으로 맞춘다 — 저장된 값이 조금씩 어긋나도 표가 넘치지 않는다
  return clean.map((w) => (w / sum) * 100);
}

/** 행 높이 최소값(px) — 한 줄이 들어갈 자리는 남긴다 */
export const MIN_ROW_PX = 16;

/**
 * 행 높이 배열을 행 개수에 맞춰 정리한다.
 *
 * 열 폭과 달리 **합을 맞추지 않는다** — 행은 서로 독립이고, 표 전체 높이는 블록 높이가
 * 정한다(넘치면 잘림 경고가 뜨고 "내용 높이에 맞추기"로 맞춘다).
 * 길이가 어긋나거나 못 쓰는 값은 `0`(= 내용에 맞춤)으로 둔다.
 */
export function normalizeRowHeights(
  heights: number[] | undefined,
  rowCount: number,
): number[] {
  if (rowCount <= 0) return [];
  return Array.from({ length: rowCount }, (_, i) => {
    const value = Array.isArray(heights) ? heights[i] : undefined;
    return typeof value === "number" && Number.isFinite(value) && value > 0
      ? Math.max(MIN_ROW_PX, Math.round(value))
      : 0;
  });
}

/**
 * 행 높이를 바꾼다 — `index` 행만 늘리거나 줄인다.
 * 저장된 값이 없던 행은 `measured`(지금 그려진 높이)에서 이어 간다.
 */
export function resizeTableRow(
  heights: number[],
  index: number,
  deltaPx: number,
  measured: number,
): number[] {
  if (index < 0 || index >= heights.length) return heights;
  const from = heights[index] > 0 ? heights[index] : measured;
  const next = [...heights];
  next[index] = Math.max(MIN_ROW_PX, Math.round(from + deltaPx));
  return next;
}

/**
 * 두 열 사이 경계를 옮긴다 — `index` 열이 커지면 **바로 오른쪽 열이 그만큼 작아진다**.
 *
 * 다른 열까지 건드리지 않는 이유: 경계 하나를 끌었는데 표 전체가 재배치되면 사용자가
 * 방금 맞춘 다른 열이 다시 틀어진다. 합이 100 으로 유지되므로 표 폭도 그대로다.
 */
export function resizeTableColumn(
  widths: number[],
  index: number,
  deltaPercent: number,
): number[] {
  if (index < 0 || index >= widths.length - 1) return widths;
  const left = widths[index];
  const right = widths[index + 1];
  // 양쪽 모두 최소 폭을 지키는 범위로 이동량을 자른다
  const move = Math.max(
    MIN_COL_PERCENT - left,
    Math.min(deltaPercent, right - MIN_COL_PERCENT),
  );
  if (move === 0) return widths;
  const next = [...widths];
  next[index] = left + move;
  next[index + 1] = right - move;
  return next;
}

export function normalizeMerges(
  merges: readonly TableMerge[] | undefined,
  rows: number,
  cols: number,
): TableMerge[] {
  if (!merges?.length || rows <= 0 || cols <= 0) return [];
  const taken = new Set<string>();
  const kept: TableMerge[] = [];

  for (const raw of merges) {
    const r = Math.trunc(Number(raw?.r));
    const c = Math.trunc(Number(raw?.c));
    const rs = Math.trunc(Number(raw?.rs));
    const cs = Math.trunc(Number(raw?.cs));
    if (!Number.isFinite(r) || !Number.isFinite(c)) continue;
    if (r < 0 || c < 0 || rs < 1 || cs < 1) continue;
    if (rs === 1 && cs === 1) continue; // 1×1 은 병합이 아니다
    if (r + rs > rows || c + cs > cols) continue; // 격자 밖으로 삐져나간다

    const covered: string[] = [];
    let overlaps = false;
    for (let i = r; i < r + rs && !overlaps; i++) {
      for (let j = c; j < c + cs; j++) {
        const key = `${i}:${j}`;
        if (taken.has(key)) {
          overlaps = true;
          break;
        }
        covered.push(key);
      }
    }
    if (overlaps) continue;

    for (const key of covered) taken.add(key);
    kept.push({ r, c, rs, cs });
  }
  return kept;
}

/**
 * 표를 그릴 때 필요한 셀별 span/skip 정보를 만든다.
 * 화면 렌더러와 인쇄 렌더러가 **이 함수 하나**를 공유해야 병합 표가 같게 나온다.
 */
export function tableLayout(props: BlockPropsMap["table"]): {
  cells: string[][];
  layout: TableCellLayout[][];
  merges: TableMerge[];
} {
  const cells = Array.isArray(props.cells) ? props.cells : [];
  const rows = cells.length;
  const cols = cells.reduce((max, row) => Math.max(max, row?.length ?? 0), 0);
  const merges = normalizeMerges(props.merges, rows, cols);

  const layout: TableCellLayout[][] = cells.map((row) =>
    (Array.isArray(row) ? row : []).map(() => ({
      skip: false,
      rowSpan: 1,
      colSpan: 1,
    })),
  );

  for (const m of merges) {
    for (let i = m.r; i < m.r + m.rs; i++) {
      for (let j = m.c; j < m.c + m.cs; j++) {
        const cell = layout[i]?.[j];
        if (!cell) continue;
        if (i === m.r && j === m.c) {
          cell.rowSpan = m.rs;
          cell.colSpan = m.cs;
        } else {
          cell.skip = true;
        }
      }
    }
  }
  return { cells, layout, merges };
}

/**
 * 행을 지웠을 때 병합 범위를 옮긴다 (지운 행에 걸친 병합은 한 행 줄어든다).
 * 여기서 손보지 않으면 지운 뒤 남은 병합이 격자 밖을 가리켜 표가 어긋난다.
 */
export function shiftMergesOnRowDelete(
  merges: readonly TableMerge[] | undefined,
  index: number,
): TableMerge[] {
  return (merges ?? []).flatMap((m) => {
    if (index < m.r) return [{ ...m, r: m.r - 1 }]; // 위쪽이 지워지면 위로 당겨진다
    if (index >= m.r + m.rs) return [m]; // 범위 아래 — 영향 없음
    const rs = m.rs - 1; // 범위에 걸침 → 한 행 줄어든다
    return rs > 1 || m.cs > 1 ? [{ ...m, rs }] : [];
  });
}

/** 열을 지웠을 때 병합 범위를 옮긴다 (행 삭제와 같은 규칙) */
export function shiftMergesOnColDelete(
  merges: readonly TableMerge[] | undefined,
  index: number,
): TableMerge[] {
  return (merges ?? []).flatMap((m) => {
    if (index < m.c) return [{ ...m, c: m.c - 1 }];
    if (index >= m.c + m.cs) return [m];
    const cs = m.cs - 1;
    return cs > 1 || m.rs > 1 ? [{ ...m, cs }] : [];
  });
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
      // 음수 z 는 흰 배경 뒤로 숨어 블록이 사라진다 — 이미 저장된 손상 값을 여기서 치유한다
      // (예전 "맨 뒤로" 가 min-1 로 내려 음수를 만들었다. 지금은 reorderZ 가 1..n 을 지킨다.)
      z: typeof b.z === "number" ? Math.max(1, Math.trunc(b.z)) : 1,
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
  /**
   * 저장된 `Document.amount`. 품목(`items`)이 없을 때 품목표에 근거 1행을 만드는 데 쓴다.
   * 넘기지 않으면 품목 없는 문서는 합계 ₩0 으로 열린다.
   */
  amount?: number;
  /** 하단 약관/안내 섹션 (기타사항·기술지원 안내·특이사항 등) */
  notes?: { heading: string; lines: string[] }[];
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
  const itemRows: ItemRow[] = input.items.map((it) => ({
    id: uid(),
    name: it.name,
    description: it.description ?? "",
    quantity: it.quantity,
    unitPrice: it.unitPrice,
  }));
  /*
   * 품목은 없는데 금액만 있는 문서(수동 생성·구버전 데이터)에는 **근거 1행**을 만든다.
   * 이 행이 없으면 문서를 열자마자 합계 ₩0 이 보이고, 그 화면을 저장하는 순간
   * 실제 금액이 0 으로 덮여 기회 예상 금액까지 따라 내려간다.
   * 캔버스가 곧 금액의 출처이므로, 출처를 비워 둔 채 열지 않는다.
   */
  (itemTable.props as BlockPropsMap["itemTable"]).rows =
    itemRows.length > 0 || !input.amount || input.amount <= 0
      ? itemRows
      : [
          {
            id: uid(),
            name: `${typeLabel} 금액`,
            description: "품목 내역이 없어 총액으로 표시했습니다. 필요하면 항목을 나눠 주세요.",
            quantity: 1,
            unitPrice: input.amount,
          },
        ];

  const notice = createBlock("text", { x: 40, y: 636 });
  notice.w = 714;
  notice.h = 26;
  (notice.props as BlockPropsMap["text"]).text =
    "※ 상기 견적은 부가세 별도입니다.";

  const blocks: Block[] = [logo, title, supplier, clientMeta, itemTable, notice];

  // 하단 약관/안내 섹션(있을 때만) — 기타사항·기술지원 안내·특이사항 등
  if (input.notes?.length) {
    let y = 678;
    for (const note of input.notes) {
      const section = createBlock("text", { x: 40, y });
      section.w = 714;
      section.h = 22 + (note.lines.length + 1) * 20;
      const p = section.props as BlockPropsMap["text"];
      p.text = [`▶ ${note.heading}`, ...note.lines].join("\n");
      p.fontSize = 12;
      blocks.push(section);
      y += section.h + 10;
    }
  }

  return {
    version: 1,
    canvas: { w: A4.w, h: A4.h, pages: 1 },
    blocks,
  };
}
