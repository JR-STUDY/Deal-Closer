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
  pageCount,
  tableLayout,
  textFormat,
  FONT_FAMILIES,
  type Align,
  type Block,
  type BlockPropsMap,
  type EditorDoc,
  type FontFamily,
} from "./editor-schema";
import { formatKRW } from "./format";

/** 조직 브랜딩 (Prisma `Branding` 모델의 인쇄 관련 필드) */
export type PdfBranding = {
  companyName: string | null;
  logoUrl: string | null;
  primaryColor: string;
};

export type DocumentHtmlInput = {
  doc: EditorDoc;
  /** 문서 제목 — PDF 메타데이터(Title)가 된다 */
  title: string;
  branding?: PdfBranding | null;
};

/** Branding.primaryColor 기본값 (prisma/schema.prisma 와 동일) */
export const DEFAULT_PRIMARY_COLOR = "#4F46E5";

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

/** 값이 빈 필드에만 적용할 대체값 — 사용자가 입력한 값은 절대 덮어쓰지 않는다 */
type FieldFallback = { match: (label: string) => boolean; value: string };

/** 라벨/값 2열 표 (공급자·거래처 메타 공용) */
function renderFieldTable(
  props: BlockPropsMap["supplier"] | BlockPropsMap["clientMeta"],
  className: string,
  fallbacks: FieldFallback[] = [],
): string {
  const fields = Array.isArray(props.fields) ? props.fields : [];
  const labelWidth = px(clamp(props.labelWidth, 0, MAX_CANVAS_SIZE));
  const rows = fields
    .map((f) => {
      const label = String(f.label ?? "");
      const value =
        String(f.value ?? "").trim() ||
        (fallbacks.find((c) => c.match(label))?.value ?? "");
      return `<tr><th${styleAttr({ width: labelWidth })}>${escapeHtml(
        label,
      )}</th><td>${escapeHtml(value)}</td></tr>`;
    })
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

  // 요약(수식) 행이 있으면 그것이 합계를 대신한다 — 화면 렌더와 동일한 우선순위.
  const footRows =
    summaries.length > 0
      ? summaries.map(
          ({ row, value }) =>
            `<tr><td class="label" colspan="${labelSpan}">${escapeHtml(
              row.label,
            )}</td><td class="num">${escapeHtml(formatKRW(value))}</td></tr>`,
        )
      : props.showTotal
        ? [
            `<tr><td class="label" colspan="${labelSpan}">합계</td><td class="num">${escapeHtml(
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
  const rows = cells
    .map((row, ri) => {
      const tag = props.hasHeader && ri === 0 ? "th" : "td";
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
      return `<tr>${inner}</tr>`;
    })
    .join("");
  return `<table class="blk-table blk-grid"><tbody>${rows}</tbody></table>`;
}

/**
 * 이미지 블록. 비어 있으면 브랜딩 로고로 대체한다
 * (`seedTemplate` 이 로고 블록에 Branding.logoUrl 을 시드하는 것과 같은 의도).
 * 화면과 달리 "이미지 없음" 자리표시자는 넣지 않는다 — 고객 발송용 인쇄물이기 때문이다.
 */
function renderImage(
  props: BlockPropsMap["image"],
  branding: PdfBranding | null,
): string {
  const src =
    sanitizeImageSrc(props.dataUrl) || sanitizeImageSrc(branding?.logoUrl);
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

function renderBlockContent(block: Block, branding: PdfBranding | null): string {
  switch (block.type) {
    case "title":
      return renderTitle(block.props as BlockPropsMap["title"]);
    case "text":
      return renderText(block.props as BlockPropsMap["text"]);
    case "supplier":
      return renderFieldTable(
        block.props as BlockPropsMap["supplier"],
        "blk-supplier",
        branding?.companyName
          ? [{ match: (l) => l.includes("상호"), value: branding.companyName }]
          : [],
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
      return renderImage(block.props as BlockPropsMap["image"], branding);
    case "divider":
      return renderDivider(block.props as BlockPropsMap["divider"]);
    default:
      return "";
  }
}

// ============================ 페이지 조립 ============================

function renderPage(
  doc: EditorDoc,
  pageIndex: number,
  branding: PdfBranding | null,
): string {
  const boxes = blocksOnPage(doc, pageIndex)
    .map((b) => {
      const style = styleAttr({
        left: px(b.x),
        top: px(b.y - pageIndex * doc.canvas.h),
        width: px(b.w),
        height: px(b.h),
        "z-index": String(Math.trunc(Number(b.z) || 1)),
      });
      return `<div class="blk"${style}>${renderBlockContent(b, branding)}</div>`;
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
.blk-items tfoot tr:last-child{font-weight:600;color:var(--brand)}
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
 * - `logoUrl` → 비어 있는 이미지 블록의 대체 이미지
 * - `companyName` → PDF 제목 메타데이터, 공급자 블록의 빈 "상호" 값
 */
export function buildDocumentHtml(input: DocumentHtmlInput): string {
  const { doc, title } = input;
  const branding = input.branding ?? null;
  const brand = safeHexColor(branding?.primaryColor, DEFAULT_PRIMARY_COLOR);
  const width = clamp(doc.canvas.w, 1, MAX_CANVAS_SIZE);
  const height = clamp(doc.canvas.h, 1, MAX_CANVAS_SIZE);

  const pages = Array.from({ length: pageCount(doc) }, (_, i) =>
    renderPage(doc, i, branding),
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
