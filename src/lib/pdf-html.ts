/**
 * 블록 캔버스 문서(EditorDoc) → 인쇄용 HTML.
 *
 * 에디터 미리보기(`editor-preview.tsx`)와 동일한 절대좌표 배치를 재현한다.
 * 화면용 Tailwind 토큰(border·muted 등)은 인쇄에서 해석되지 않으므로
 * 여기서 실제 색상값으로 고정한다.
 *
 * (서버·클라이언트 공용 순수 모듈 — server-only import 금지.
 *  실제 PDF 바이트 생성은 서버 전용 `pdf.ts` 가 담당한다.)
 */

import {
  blocksOnPage,
  calcItemTableTotal,
  evalSummaryRows,
  normalizeColWidths,
  normalizeRowHeights,
  pageCount,
  tableLayout,
  textFormat,
  totalSummaryRow,
  withCompanyDefaults,
  FONT_FAMILIES,
  type Align,
  type Block,
  type BlockPropsMap,
  type EditorDoc,
  type FontFamily,
} from "./editor-schema";
import {
  DEFAULT_PRIMARY_COLOR as BRANDING_DEFAULT_PRIMARY_COLOR,
  toCompanyProfile,
  type BrandingCompanyRecord,
  type CompanyProfile,
} from "./branding";
import { formatKRW } from "./format";

/**
 * 조직 브랜딩 (Prisma `Branding` 모델의 인쇄 관련 필드).
 *
 * 회사 정보를 **통째로** 받는다. 예전에는 `companyName`·`logoUrl`·`primaryColor` 셋만
 * 있어서 인쇄 경로가 인감·대표자·사업자등록번호·주소·전화를 아예 볼 수 없었다 —
 * 로고와 인감은 견적서에 찍히지 않으면 아무 쓸모가 없다.
 *
 * 필드를 **필수(nullable)** 로 둔다. 옵셔널로 두면 호출측이 하나를 빠뜨려도 타입 검사가
 * 통과하고 런타임에만 값이 사라진다(확정 문서 판정의 `rootId`·`version` 과 같은 이유).
 * 대신 조립은 `toPdfBranding` 한 곳에서 한다.
 */
export type PdfBranding = CompanyProfile & {
  companyName: string;
  primaryColor: string;
};

/** Prisma `Branding` 행(또는 없음) → 인쇄용 브랜딩. 상호 폴백은 호출측이 준다 */
export function toPdfBranding(
  record: (BrandingCompanyRecord & { primaryColor: string }) | null | undefined,
  fallbackCompanyName: string,
): PdfBranding {
  return {
    ...toCompanyProfile(record, fallbackCompanyName),
    primaryColor: record?.primaryColor || BRANDING_DEFAULT_PRIMARY_COLOR,
  };
}

export type DocumentHtmlInput = {
  doc: EditorDoc;
  /** 문서 제목 — PDF 메타데이터(Title)가 된다 */
  title: string;
  branding?: PdfBranding | null;
};

/**
 * Branding.primaryColor 기본값.
 * 값은 `@/lib/branding` 이 단일 소스다 — 두 곳에 적으면 한쪽만 바뀐다.
 */
export const DEFAULT_PRIMARY_COLOR = BRANDING_DEFAULT_PRIMARY_COLOR;

/** 화면의 Tailwind 토큰을 인쇄용 실제 색으로 고정한 값 */
const PRINT_COLORS = {
  border: "#e5e7eb",
  muted: "#f3f4f6",
  mutedForeground: "#6b7280",
  text: "#111827",
  divider: "#d1d5db",
} as const;

/*
 * 글꼴 스택은 `editor-schema` 의 FONT_FAMILIES 하나를 화면·인쇄가 함께 쓴다.
 * 따로 두면 같은 글의 줄바꿈 지점이 달라져, 화면에서 딱 맞춘 블록이 PDF 에서 넘친다.
 */

/*
 * **줄 높이는 화면 렌더러와 숫자까지 같아야 한다** (진단 4).
 *
 * 인쇄 CSS 는 줄 높이를 지정하지 않아 `normal`(≈1.2)로 렌더됐고, 화면은 Tailwind 값을
 * 썼다. 그래서 같은 표가 화면 21.5px / 인쇄 19px 행으로 그려져, 화면에서 딱 맞춘 블록이
 * 인쇄에서는 남고(반대로 넘치기도) 줄바꿈 지점도 어긋났다.
 *
 * 아래 값은 화면 블록 렌더러가 쓰는 Tailwind 클래스의 실측 비율이다.
 * 화면 쪽 클래스를 바꾸면 이 값도 함께 바꿔야 한다.
 */
/** Tailwind `text-xs` 의 줄 높이 비율 (12px → 16px). 품목표·표·거래처 메타가 쓴다. */
const TEXT_XS_LEADING = "1.33333";
/** 앱 기본 줄 높이 1.5 — 공급자 블록은 `text-[11px]` 만 지정해 이 값을 물려받는다 (11px → 16.5px) */
const BASE_LEADING = "1.5";

const ALIGNS: readonly Align[] = ["left", "center", "right"];
const HEX_COLOR = /^#(?:[0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/;
const MAX_DIVIDER_THICKNESS = 64;
const MAX_FONT_SIZE = 400;
const MAX_CANVAS_SIZE = 20000;

const HTML_ESCAPES: Record<string, string> = {
  "&": "&amp;",
  "<": "&lt;",
  ">": "&gt;",
  '"': "&quot;",
  "'": "&#39;",
};

/** HTML 특수문자 이스케이프 — 문서 본문은 전부 사용자 입력이므로 필수 */
export function escapeHtml(value: unknown): string {
  return String(value ?? "").replace(/[&<>"']/g, (c) => HTML_ESCAPES[c]);
}

/** 색상값 화이트리스트 — hex 가 아니면 fallback (style 속성 CSS 주입 차단) */
export function safeHexColor(
  value: string | null | undefined,
  fallback: string,
): string {
  return value && HEX_COLOR.test(value.trim()) ? value.trim() : fallback;
}

function safeAlign(value: unknown, fallback: Align = "left"): Align {
  return ALIGNS.includes(value as Align) ? (value as Align) : fallback;
}

function safeFontStack(value: unknown): string {
  return FONT_FAMILIES[value as FontFamily] ?? FONT_FAMILIES.sans;
}

function clamp(value: number, min: number, max: number): number {
  const n = Number(value);
  if (!Number.isFinite(n)) return min;
  return Math.min(max, Math.max(min, n));
}

function isPrivateHost(hostname: string): boolean {
  const h = hostname.toLowerCase().replace(/^\[|\]$/g, "");
  if (!h || h === "localhost" || h === "::1") return true;
  if (h.endsWith(".local") || h.endsWith(".internal")) return true;
  if (/^(0|10|127)\./.test(h) || /^169\.254\./.test(h) || /^192\.168\./.test(h)) {
    return true;
  }
  return /^172\.(1[6-9]|2\d|3[01])\./.test(h);
}

/**
 * 이미지 src 허용 범위를 좁힌다.
 * - `data:image/*` 는 그대로 허용
 * - 루트 상대경로(`/logo.png`)는 통과시키고, 서버(`pdf.ts`)가 data URL 로 인라인한다
 * - http(s) 는 허용하되 사설·루프백 대역은 차단한다
 *   (헤드리스 브라우저를 통한 내부망 조회 방지)
 * - 그 밖(`javascript:` `file:` 등)은 빈 문자열
 */
export function sanitizeImageSrc(src: string | null | undefined): string {
  const value = (src ?? "").trim();
  if (!value) return "";
  if (value.startsWith("data:image/")) return value;
  if (value.startsWith("/")) return value;
  try {
    const url = new URL(value);
    if (url.protocol !== "http:" && url.protocol !== "https:") return "";
    if (isPrivateHost(url.hostname)) return "";
    return url.toString();
  } catch {
    return "";
  }
}

type StyleMap = Record<string, string | undefined>;

function styleAttr(style: StyleMap): string {
  const css = Object.entries(style)
    .filter(([, v]) => v !== undefined && v !== "")
    .map(([k, v]) => `${k}:${v}`)
    .join(";");
  return css ? ` style="${escapeHtml(css)}"` : "";
}

const px = (n: number): string => `${Number.isFinite(n) ? n : 0}px`;

// ============ 블록 렌더러 (editor/_components/blocks/* 와 1:1 대응) ============

/**
 * 굵기·기울임·줄 높이 (진단 5). 기본값은 화면 렌더러와 **같은 `textFormat`** 이 정한다 —
 * 따로 적으면 예전 문서(이 속성이 없는 contentJson)가 화면과 인쇄에서 다르게 보인다.
 */
function textStyleAttrs(
  props: BlockPropsMap["text"],
  type: "title" | "text",
): StyleMap {
  const f = textFormat(props, type);
  return {
    "font-weight": f.bold ? "700" : "400",
    "font-style": f.italic ? "italic" : "normal",
    "line-height": String(clamp(f.lineHeight, 0.5, 5)),
  };
}

function renderTitle(props: BlockPropsMap["title"]): string {
  const align = safeAlign(props.align);
  const justify =
    align === "center" ? "center" : align === "right" ? "flex-end" : "flex-start";
  const style = styleAttr({
    "text-align": align,
    "font-size": px(clamp(props.fontSize, 1, MAX_FONT_SIZE)),
    "font-family": safeFontStack(props.fontFamily),
    color: safeHexColor(props.color, PRINT_COLORS.text),
    border: props.border
      ? `1px solid ${safeHexColor(props.borderColor, PRINT_COLORS.border)}`
      : undefined,
    "justify-content": justify,
    ...textStyleAttrs(props, "title"),
  });
  return `<div class="blk-title"${style}>${escapeHtml(props.text)}</div>`;
}

function renderText(props: BlockPropsMap["text"]): string {
  const style = styleAttr({
    "text-align": safeAlign(props.align),
    "font-size": px(clamp(props.fontSize, 1, MAX_FONT_SIZE)),
    "font-family": safeFontStack(props.fontFamily),
    color: safeHexColor(props.color, PRINT_COLORS.text),
    border: props.border
      ? `1px solid ${safeHexColor(props.borderColor, PRINT_COLORS.border)}`
      : undefined,
    ...textStyleAttrs(props, "text"),
  });
  return `<div class="blk-text"${style}>${escapeHtml(props.text)}</div>`;
}

/**
 * 라벨/값 2열 표 (공급자·거래처 메타 공용).
 *
 * **회사 정보 폴백은 여기 없다.** 예전에는 이 함수가 빈 `상호` 칸을 브랜딩 회사명으로
 * 메웠는데, 그러면 캔버스에는 빈 칸이 보이는데 PDF 에만 값이 찍혀 화면과 인쇄가 갈라진다
 * (사용자가 확인할 수 없는 내용이 고객에게 발송된다). 지금은 `withCompanyDefaults` 가
 * **문서 단계에서** 한 번 채우고, 에디터·미리보기·PDF 가 같은 문서를 그린다.
 */
function renderFieldTable(
  props: BlockPropsMap["supplier"] | BlockPropsMap["clientMeta"],
  className: string,
): string {
  const fields = Array.isArray(props.fields) ? props.fields : [];
  const labelWidth = px(clamp(props.labelWidth, 0, MAX_CANVAS_SIZE));
  const rows = fields
    .map(
      (f) =>
        `<tr><th${styleAttr({ width: labelWidth })}>${escapeHtml(
          String(f.label ?? ""),
        )}</th><td>${escapeHtml(String(f.value ?? ""))}</td></tr>`,
    )
    .join("");
  return `<table class="blk-table ${className}"><tbody>${rows}</tbody></table>`;
}

function renderItemTable(props: BlockPropsMap["itemTable"]): string {
  const rows = Array.isArray(props.rows) ? props.rows : [];
  const extraCols = props.extraColumns ?? [];
  const summaries = evalSummaryRows(props);
  const labelSpan = 3 + extraCols.length;

  const head = [
    "<th>품목 / 설명</th>",
    ...extraCols.map(
      (c) =>
        `<th${styleAttr({ "text-align": safeAlign(c.align) })}>${escapeHtml(
          c.label,
        )}</th>`,
    ),
    '<th class="num">수량</th>',
    '<th class="num">단가</th>',
    '<th class="num">금액</th>',
  ].join("");

  const body = rows
    .map((r) => {
      const quantity = Number(r.quantity) || 0;
      const unitPrice = Number(r.unitPrice) || 0;
      const description = String(r.description ?? "");
      const cells = [
        `<td><div class="name">${escapeHtml(r.name)}</div>${
          description ? `<div class="desc">${escapeHtml(description)}</div>` : ""
        }</td>`,
        ...extraCols.map(
          (c) =>
            `<td${styleAttr({ "text-align": safeAlign(c.align) })}>${escapeHtml(
              r.extra?.[c.id] ?? "",
            )}</td>`,
        ),
        `<td class="num">${escapeHtml(quantity)}</td>`,
        `<td class="num">${escapeHtml(formatKRW(unitPrice))}</td>`,
        `<td class="num">${escapeHtml(formatKRW(quantity * unitPrice))}</td>`,
      ].join("");
      return `<tr>${cells}</tr>`;
    })
    .join("");

  /*
   * 요약(수식) 행이 있으면 그것이 합계를 대신한다 — 화면 렌더와 동일한 우선순위.
   * 강조(`total` 클래스)는 **총계 표식이 붙은 행**에 준다. 예전 CSS 는
   * `tfoot tr:last-child` 를 굵게 칠했는데, 그것은 "마지막 행이 총계" 라는 옛 규약을
   * 인쇄 쪽에 한 번 더 적어 둔 것이라 표식과 어긋날 수 있었다.
   */
  const totalRowId = totalSummaryRow(props.summaryRows)?.id ?? null;
  const footRows =
    summaries.length > 0
      ? summaries.map(({ row, value }) => {
          const cls = row.id === totalRowId ? ' class="total"' : "";
          return `<tr${cls}><td class="label" colspan="${labelSpan}">${escapeHtml(
            row.label,
          )}</td><td class="num">${escapeHtml(formatKRW(value))}</td></tr>`;
        })
      : props.showTotal
        ? [
            `<tr class="total"><td class="label" colspan="${labelSpan}">합계</td><td class="num">${escapeHtml(
              formatKRW(calcItemTableTotal(rows)),
            )}</td></tr>`,
          ]
        : [];

  const foot = footRows.length ? `<tfoot>${footRows.join("")}</tfoot>` : "";
  return `<table class="blk-table blk-items"><thead><tr>${head}</tr></thead><tbody>${body}</tbody>${foot}</table>`;
}

function renderTable(props: BlockPropsMap["table"]): string {
  // 병합 계산은 화면 렌더러와 **같은 tableLayout** 을 쓴다 (진단 5)
  const { cells, layout } = tableLayout(props);
  const rowHeights = normalizeRowHeights(props.rowHeights, cells.length);
  const rows = cells
    .map((row, ri) => {
      const tag = props.hasHeader && ri === 0 ? "th" : "td";
      // 행 높이도 화면과 같은 값을 쓴다 (0 이면 내용에 맞춤 — colgroup 과 같은 원칙)
      const rowStyle = rowHeights[ri] > 0 ? styleAttr({ height: px(rowHeights[ri]) }) : "";
      const inner = (Array.isArray(row) ? row : [])
        .map((cell, ci) => {
          const span = layout[ri]?.[ci];
          // 덮인 자리는 내보내지 않는다 — 내보내면 colspan 합이 열 수를 넘어 표가 깨진다
          if (span?.skip) return "";
          const style = styleAttr({
            "text-align": safeAlign(props.colAligns?.[ci]),
          });
          const rowSpan =
            span && span.rowSpan > 1 ? ` rowspan="${span.rowSpan}"` : "";
          const colSpan =
            span && span.colSpan > 1 ? ` colspan="${span.colSpan}"` : "";
          return `<${tag}${style}${rowSpan}${colSpan}>${escapeHtml(cell)}</${tag}>`;
        })
        .join("");
      return `<tr${rowStyle}>${inner}</tr>`;
    })
    .join("");
  /*
   * 열 폭도 화면과 같은 값을 쓴다 (`normalizeColWidths`).
   * 저장된 값이 없으면 `<colgroup>` 을 내보내지 않아 예전처럼 자동 배분된다 —
   * 여기서만 균등 분배하면 같은 표가 화면과 인쇄에서 다르게 나온다.
   */
  const colCount = cells[0]?.length ?? 0;
  const colgroup =
    props.colWidths && props.colWidths.length > 0 && colCount > 0
      ? `<colgroup>${normalizeColWidths(props.colWidths, colCount)
          .map((w) => `<col style="width:${w.toFixed(4)}%">`)
          .join("")}</colgroup>`
      : "";
  return `<table class="blk-table blk-grid">${colgroup}<tbody>${rows}</tbody></table>`;
}

/**
 * 이미지 블록.
 *
 * 로고·인감 폴백은 `withCompanyDefaults` 가 문서 단계에서 이미 채웠으므로 여기서는
 * 블록에 담긴 값만 그린다. 화면과 달리 "이미지 없음" 자리표시자는 넣지 않는다 —
 * 고객 발송용 인쇄물에 회색 사각형이 남으면 안 된다.
 */
function renderImage(props: BlockPropsMap["image"]): string {
  const src = sanitizeImageSrc(props.dataUrl);
  if (!src) return "";
  const style = styleAttr({
    "object-fit": props.fit === "cover" ? "cover" : "contain",
    opacity: String(clamp(props.opacity ?? 100, 0, 100) / 100),
    border: props.border
      ? `1px solid ${safeHexColor(props.borderColor, PRINT_COLORS.border)}`
      : undefined,
  });
  return `<img class="blk-image" src="${escapeHtml(src)}" alt="${escapeHtml(
    props.alt,
  )}"${style}>`;
}

function renderDivider(props: BlockPropsMap["divider"]): string {
  const line = `${px(clamp(props.thickness, 0, MAX_DIVIDER_THICKNESS))} ${
    props.dashed ? "dashed" : "solid"
  } ${safeHexColor(props.color, PRINT_COLORS.divider)}`;
  const style =
    props.orientation === "vertical"
      ? styleAttr({ height: "100%", "border-left": line })
      : styleAttr({ width: "100%", "border-top": line });
  return `<div class="blk-divider"><div${style}></div></div>`;
}

function renderBlockContent(block: Block): string {
  switch (block.type) {
    case "title":
      return renderTitle(block.props as BlockPropsMap["title"]);
    case "text":
      return renderText(block.props as BlockPropsMap["text"]);
    case "supplier":
      return renderFieldTable(
        block.props as BlockPropsMap["supplier"],
        "blk-supplier",
      );
    case "clientMeta":
      return renderFieldTable(
        block.props as BlockPropsMap["clientMeta"],
        "blk-meta",
      );
    case "itemTable":
      return renderItemTable(block.props as BlockPropsMap["itemTable"]);
    case "table":
      return renderTable(block.props as BlockPropsMap["table"]);
    case "image":
      return renderImage(block.props as BlockPropsMap["image"]);
    case "divider":
      return renderDivider(block.props as BlockPropsMap["divider"]);
    default:
      return "";
  }
}

// ============================ 페이지 조립 ============================

function renderPage(doc: EditorDoc, pageIndex: number): string {
  const boxes = blocksOnPage(doc, pageIndex)
    .map((b) => {
      const style = styleAttr({
        left: px(b.x),
        top: px(b.y - pageIndex * doc.canvas.h),
        width: px(b.w),
        height: px(b.h),
        "z-index": String(Math.trunc(Number(b.z) || 1)),
      });
      return `<div class="blk"${style}>${renderBlockContent(b)}</div>`;
    })
    .join("");
  return `<div class="page">${boxes}</div>`;
}

function buildStyles(width: number, height: number, brand: string): string {
  return `
:root{--brand:${brand};--border:${PRINT_COLORS.border};--muted:${PRINT_COLORS.muted};--muted-fg:${PRINT_COLORS.mutedForeground}}
*{box-sizing:border-box}
html,body{margin:0;padding:0;background:#fff}
body{color:${PRINT_COLORS.text};font-family:${FONT_FAMILIES.sans};-webkit-print-color-adjust:exact;print-color-adjust:exact}
@page{size:${width}px ${height}px;margin:0}
.page{position:relative;isolation:isolate;width:${width}px;height:${height}px;overflow:hidden;background:#fff;break-after:page}
.page:last-child{break-after:auto}
.blk{position:absolute;overflow:hidden}
.blk-title{display:flex;align-items:center;width:100%;height:100%;padding:0 8px;letter-spacing:.1em}
.blk-text{width:100%;height:100%;padding:4px 8px;white-space:pre-wrap;word-break:break-word}
.blk-table{width:100%;border-collapse:collapse;font-size:12px;line-height:${TEXT_XS_LEADING}}
.blk-table th,.blk-table td{border:1px solid var(--border);padding:4px 8px;text-align:left;vertical-align:top}
.blk-table th{background:var(--muted);font-weight:500}
.blk-table .num{text-align:right;font-variant-numeric:tabular-nums}
.blk-supplier{font-size:11px;line-height:${BASE_LEADING}}
.blk-supplier th,.blk-supplier td{padding:2px 4px}
.blk-supplier th,.blk-meta th{color:var(--muted-fg)}
.blk-items thead th{border-bottom:2px solid var(--brand)}
.blk-items .name{font-weight:500}
.blk-items .desc{font-size:11px;color:var(--muted-fg)}
.blk-items tfoot .label{text-align:right}
.blk-items tfoot tr.total{font-weight:600;color:var(--brand)}
.blk-divider{display:flex;align-items:center;justify-content:center;width:100%;height:100%}
.blk-image{display:block;width:100%;height:100%}
`.trim();
}

/**
 * 문서를 인쇄용 단일 HTML 문서로 만든다.
 * `@page` 크기를 캔버스 크기와 정확히 일치시켜, 캔버스 1페이지가 PDF 1장이 되게 한다.
 *
 * 브랜딩 반영 지점:
 * - `primaryColor` → 품목표 헤더 밑줄·합계 행 강조색 (레이아웃을 바꾸지 않는 위치만)
 * - 회사 정보(상호·대표자·사업자등록번호·주소·전화·로고·인감) → **빈** 공급자 칸과
 *   **빈** 로고·인감 이미지. 판정은 `withCompanyDefaults` 순수 함수 하나이고
 *   에디터 캔버스도 같은 함수를 지난다 — 화면과 인쇄가 같은 값을 그려야 한다.
 * - `companyName` → PDF 제목 메타데이터
 */
export function buildDocumentHtml(input: DocumentHtmlInput): string {
  const { title } = input;
  const branding = input.branding ?? null;
  /*
   * 회사 정보 반영은 **여기서 한 번** 한다. 렌더러마다 폴백을 흩어 두면(예전 방식)
   * 캔버스에 없는 값이 PDF 에만 찍힌다. 호출부가 잊어도 되도록 이 함수가 책임진다.
   */
  const doc = withCompanyDefaults(input.doc, branding);
  const brand = safeHexColor(branding?.primaryColor, DEFAULT_PRIMARY_COLOR);
  const width = clamp(doc.canvas.w, 1, MAX_CANVAS_SIZE);
  const height = clamp(doc.canvas.h, 1, MAX_CANVAS_SIZE);

  const pages = Array.from({ length: pageCount(doc) }, (_, i) =>
    renderPage(doc, i),
  ).join("");

  const docTitle = branding?.companyName
    ? `${title} · ${branding.companyName}`
    : title;

  return `<!doctype html>
<html lang="ko">
<head>
<meta charset="utf-8">
<title>${escapeHtml(docTitle)}</title>
<style>${buildStyles(width, height, brand)}</style>
</head>
<body>${pages}</body>
</html>`;
}
