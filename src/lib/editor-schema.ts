/**
 * 블록 캔버스 에디터의 문서 모델.
 * Document.contentJson 에 EditorDoc(JSON 직렬화)로 저장한다.
 * (서버·클라이언트 공용 순수 모듈 — server-only import 금지)
 */

import type { CompanyProfile } from "./branding";
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

/**
 * 품목표 요약(수식) 행 — 예: 공급가액/부가세/합계 (#9)
 *
 * `isTotal` 이 **문서 금액이 되는 행**을 가리킨다. 예전에는 "마지막 행이 총계" 라는
 * 암묵적 규약이었는데, 그것은 금액을 **행을 넣은 순서**에 맡기는 것이다 — 사용자가
 * `공급가액` → `부가세` 순서로만 넣으면 문서 금액이 **부가세 금액**이 된다
 * (실측: 1,000만원 견적서가 100만원으로 저장됐다). 그 값은 확정 문서를 통해 기회
 * 예상 금액까지 내려간다(기회-6). 프리셋은 마지막이 `합계` 라서 우연히 맞았을 뿐이다.
 *
 * **옵셔널이다** — 예전 `contentJson` 에는 없으므로 `parseContentJson` 이 읽으면서
 * 마지막 행에 붙여 준다(음수 z 치유·`MetaFieldRole` 추정과 같은 선례). 그래야 이미
 * 저장된 문서의 금액이 이 변경 한 번으로 달라지지 않는다.
 */
export type SummaryRow = {
  id: string;
  label: string;
  formula: string;
  /** 이 행이 문서 금액이다. 표식이 없으면 마지막 행으로 본다(예전 문서) */
  isTotal?: boolean;
};

/** 카탈로그(마스터 데이터) 품목 — 품목표에서 드롭다운으로 선택 (#6) */
export type CatalogOption = {
  id: string;
  name: string;
  unitPrice: number;
  description: string | null;
  category: string;
  unit: string;
};

/**
 * 라벨/값 정보 필드의 **역할** — 코드가 이 필드를 찾을 때 쓰는 안정된 식별자.
 *
 * 예전에는 라벨 문자열이 곧 키였다(`label.includes("고객사")` · `label === "상호"`).
 * 그래서 사용자가 라벨을 `거래처명` 으로 바꾸면 조회가 끊겼고, `Document.clientName`
 * 은 PATCH 에서 `undefined` 가 되어 **문서 목록에 옛 거래처명이 영구히 남았다**
 * (본문과 목록이 서로 다른 거래처를 주장한다). 캔버스에서 라벨을 더블클릭 한 번으로
 * 고칠 수 있게 된 뒤로는 걸리기 쉬운 함정이 됐다.
 *
 * 옵셔널이다 — 예전 `contentJson` 에는 없으므로 `parseContentJson` 이 라벨로 추정해
 * 채워 주고(치유), 다음 저장에 함께 남는다. 필수로 만들면 예전 문서가 통째로 어긋난다.
 */
export type MetaFieldRole =
  | "clientName"
  | "supplierName"
  | "supplierCeoName"
  | "supplierBizRegNo"
  | "supplierAddress"
  | "supplierPhone"
  | "supplierEmail";

export type MetaField = {
  id: string;
  label: string;
  value: string;
  /** 코드가 이 필드를 찾는 열쇠. 없으면 라벨로 추정한다(예전 문서) */
  role?: MetaFieldRole;
};

/**
 * 역할별로 라벨을 추정할 때 쓰는 조각 (치유·폴백 전용).
 *
 * **역할마다 여러 조각을 둔다.** 라벨을 쓰는 주체가 둘이기 때문이다 — 사용자가 캔버스에서
 * 고칠 수도 있고(`사업자등록번호`), **AI 생성 경로는 모델이 라벨을 정한다**(`사업자번호`
 * ·`대표`·`수요기관`). 조각이 하나뿐이면 관례를 살짝 벗어난 라벨에서 곧바로 끊긴다.
 *
 * 겹치는 라벨의 승자는 **선언 순서가 아니라 조각 길이**로 정한다(`labelRoleGuess`) —
 * `대표번호` 는 `대표번호`(4자, 전화)가 `대표`(2자, 대표자)를 이긴다. 순서에 맡기면
 * 조각을 하나 더할 때마다 기존 판정이 조용히 뒤집힌다.
 */
const ROLE_LABEL_HINTS: Record<MetaFieldRole, readonly string[]> = {
  clientName: ["고객사", "거래처", "발주처", "수요기관", "수신처"],
  supplierName: ["상호", "공급자명", "회사명", "업체명"],
  supplierCeoName: ["대표자", "대표이사", "대표"],
  supplierBizRegNo: ["사업자등록번호", "사업자번호", "등록번호", "사업자"],
  supplierAddress: ["사업장주소", "주소", "소재지"],
  supplierPhone: ["대표번호", "전화번호", "연락처", "전화", "tel"],
  supplierEmail: ["이메일", "e-mail", "email", "메일"],
};

/** 역할 전체 목록 (라벨 짐작의 기본 후보) */
const ALL_META_ROLES = Object.keys(ROLE_LABEL_HINTS) as MetaFieldRole[];

/** 라벨 비교용 정규화 — 공백을 없애고 소문자로 (`E-mail` · `대표 연락처`) */
function normalizeRoleLabel(label: unknown): string {
  return String(label ?? "").replace(/\s+/g, "").toLowerCase();
}

/** (role, 조각) 을 **조각이 긴 것부터** 늘어놓은 표 — 겹치는 라벨의 승자를 정한다 */
const ROLE_LABEL_MATCHERS: readonly { role: MetaFieldRole; hint: string }[] = (
  Object.keys(ROLE_LABEL_HINTS) as MetaFieldRole[]
)
  .flatMap((role) =>
    ROLE_LABEL_HINTS[role].map((hint) => ({ role, hint: normalizeRoleLabel(hint) })),
  )
  .sort((a, b) => b.hint.length - a.hint.length);

/**
 * 라벨로 역할을 짐작한다 — 가장 **구체적인**(긴) 조각이 이긴다.
 * `allowed` 밖 역할과 이미 쓰인 역할은 후보에서 뺀다.
 */
function labelRoleGuess(
  label: unknown,
  allowed: readonly MetaFieldRole[],
  taken: ReadonlySet<unknown>,
): MetaFieldRole | null {
  const text = normalizeRoleLabel(label);
  if (!text) return null;
  const match = ROLE_LABEL_MATCHERS.find(
    (m) => allowed.includes(m.role) && !taken.has(m.role) && text.includes(m.hint),
  );
  return match?.role ?? null;
}

/**
 * 블록별로 **허용되는 역할**.
 *
 * 역할을 블록에 매어 두지 않으면 거래처 블록의 `주소` 칸이 `supplierAddress` 를
 * 차지해, 회사 주소가 거래처 자리에 찍힌다(반대로 공급자 블록의 `고객사` 라벨이
 * `clientName` 을 차지하면 문서 목록의 거래처명이 자기 회사 이름이 된다).
 * 추정은 라벨이라는 약한 단서에 기대므로, 후보를 좁히는 것이 유일한 방어다.
 */
export const SUPPLIER_META_ROLES: readonly MetaFieldRole[] = [
  "supplierName",
  "supplierCeoName",
  "supplierBizRegNo",
  "supplierAddress",
  "supplierPhone",
  "supplierEmail",
];
export const CLIENT_META_ROLES: readonly MetaFieldRole[] = ["clientName"];

/** 그 블록에서 쓸 수 있는 역할 목록 (공급자·거래처 블록만 역할을 갖는다) */
export function metaRolesFor(type: BlockType): readonly MetaFieldRole[] {
  if (type === "supplier") return SUPPLIER_META_ROLES;
  if (type === "clientMeta") return CLIENT_META_ROLES;
  return [];
}

/**
 * 역할에 해당하는 필드를 찾는다 — **역할이 먼저, 라벨은 폴백**이다.
 *
 * 라벨 폴백은 `role` 이 없는 예전 문서를 위한 것이고, 역할을 가진 필드가 하나라도
 * 있으면 라벨은 보지 않는다(라벨을 바꿔도 조회가 유지되는 이유).
 */
export function findMetaField(
  fields: MetaField[] | undefined,
  role: MetaFieldRole,
): MetaField | null {
  if (!Array.isArray(fields)) return null;
  const byRole = fields.find((f) => f?.role === role);
  if (byRole) return byRole;
  /*
   * 라벨 폴백 — 후보를 **전체 역할**로 두고 짐작한 결과가 이 역할일 때만 고른다.
   * 이 역할만 후보로 두면 `대표번호` 가 `대표` 에 걸려 대표자 조회에 잡히고,
   * 대표자 자리에 전화번호가 들어간다.
   */
  return (
    fields.find((f) => labelRoleGuess(f?.label, ALL_META_ROLES, new Set()) === role) ??
    null
  );
}

/**
 * 역할이 비어 있는 필드에 역할을 채운다.
 *
 * 두 가지 단서를 쓴다.
 *  ① **라벨 조각** — 예전 `contentJson` 치유용 (`고객사명` → clientName).
 *  ② **값 일치**(`valueHints`) — 라벨을 **모델이 정하는** AI 생성 경로용. 거래처명이
 *     `수요기관`·`발주처` 같은 라벨로 오면 라벨 조각으로는 영영 못 찾는데, 그 값이
 *     무엇인지는 호출측이 알고 있다(`spec.clientName` · 브랜딩 회사명).
 *
 * 이미 그 역할을 가진 필드가 있으면 더 만들지 않는다 — 역할은 블록당 하나여야
 * 조회 결과가 흔들리지 않는다.
 */
export function healMetaFieldRoles(
  fields: MetaField[],
  valueHints?: Partial<Record<MetaFieldRole, string>>,
  /** 이 블록에서 허용되는 역할. 생략하면 전부 (`metaRolesFor` 로 좁혀 넘기는 것을 권한다) */
  allowed?: readonly MetaFieldRole[],
): MetaField[] {
  if (!Array.isArray(fields)) return fields;
  const taken = new Set(fields.map((f) => f?.role).filter(Boolean));
  const roles = allowed ?? ALL_META_ROLES;
  const norm = (v: unknown) => String(v ?? "").trim();
  let changed = false;

  const claim = (f: MetaField, role: MetaFieldRole) => {
    taken.add(role);
    changed = true;
    return { ...f, role };
  };

  // 1차: 라벨 조각 (예전 문서·AI 라벨). 가장 구체적인 조각이 이긴다
  let next = fields.map((f) => {
    if (!f || f.role) return f;
    const role = labelRoleGuess(f.label, roles, taken);
    return role ? claim(f, role) : f;
  });

  // 2차: 값 일치 (AI 가 라벨을 정한 경우). 빈 값은 단서가 되지 않는다
  if (valueHints) {
    next = next.map((f) => {
      if (!f || f.role || !norm(f.value)) return f;
      const role = roles.find(
        (r) =>
          !taken.has(r) && norm(valueHints[r]) !== "" && norm(valueHints[r]) === norm(f.value),
      );
      return role ? claim(f, role) : f;
    });
  }

  return changed ? next : fields;
}

/** 이미지 블록이 채우는 자리 — 회사 로고 · 인감(직인) */
export type ImageRole = "logo" | "stamp";

/** 예전 문서의 이미지 역할을 `alt` 로 추정할 때 쓰는 조각 (치유 전용) */
const IMAGE_ROLE_ALT_HINTS: Record<ImageRole, readonly string[]> = {
  stamp: ["인감", "직인", "도장", "stamp"],
  logo: ["로고", "logo"],
};

/**
 * `alt` 로 이미지 역할을 추정한다 (이미 역할이 있으면 그대로).
 *
 * 라벨 추정과 같은 성격의 **폴백**이다 — `seedTemplate`·AI 조립부가 만든 로고 블록은
 * 언제나 `alt="회사 로고"` 였으므로, 이 추정만으로 예전 문서의 로고 자리가 그대로 살아난다.
 * 짐작할 수 없는 이미지는 역할 없이 남긴다(그냥 그림이다).
 */
export function healImageRole(
  props: BlockPropsMap["image"],
): BlockPropsMap["image"] {
  if (props.role) return props;
  const alt = String(props.alt ?? "").toLowerCase();
  if (!alt) return props;
  const role = (Object.keys(IMAGE_ROLE_ALT_HINTS) as ImageRole[]).find((r) =>
    IMAGE_ROLE_ALT_HINTS[r].some((hint) => alt.includes(hint.toLowerCase())),
  );
  return role ? { ...props, role } : props;
}

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
    /**
     * 이 이미지가 **무엇의 자리**인지. 없으면 그냥 그림이다.
     *
     * 회사 정보(로고·인감)를 채워 넣을 대상을 지목하는 데 쓴다 — 예전에는 대상이 없어서
     * **비어 있는 이미지 블록이면 무엇이든** 로고로 채웠다. 그래서 사용자가 자리만 잡아 둔
     * 빈 이미지 칸에 로고가 인쇄되고, 인감 칸을 지우면 그 자리에 로고가 찍혔다.
     * `MetaFieldRole` 과 같은 이유로 **옵셔널**이며 `parseContentJson` 이 `alt` 로 추정해
     * 채운다(예전 문서의 로고 블록은 `alt="회사 로고"` 였다).
     */
    role?: ImageRole;
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
      /*
       * 여섯 칸 **모두** 역할을 갖는다. 예전에는 `상호` 만 역할이 있어서 회사 정보를
       * 채울 대상이 그 한 칸뿐이었다 — 실제 문서에서 공급자 6칸 중 5칸이 비어 있었던
       * 원인이다(대표자·등록번호·주소·전화). `이메일` 은 역할만 두고 채우지 않는다:
       * `Branding` 에 이메일 컬럼이 없다(스키마 추가는 별건이다). 라벨 줄은 남겨 두어
       * 캔버스에서 바로 적어 넣을 수 있게 한다.
       */
      return {
        labelWidth: 72,
        fields: [
          { id: uid(), label: "상호", value: "", role: "supplierName" as const },
          { id: uid(), label: "대표자", value: "", role: "supplierCeoName" as const },
          { id: uid(), label: "등록번호", value: "", role: "supplierBizRegNo" as const },
          { id: uid(), label: "주소", value: "", role: "supplierAddress" as const },
          { id: uid(), label: "전화", value: "", role: "supplierPhone" as const },
          { id: uid(), label: "이메일", value: "", role: "supplierEmail" as const },
        ],
      };
    case "clientMeta":
      return {
        labelWidth: 96,
        fields: [
          { id: uid(), label: "고객사명", value: "", role: "clientName" as const },
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

/**
 * 사용자가 입력한 글자를 **수량·단가 정수**로 읽는다 (정책 FORM_CURRENCY_KRW).
 *
 * 캔버스 칸 편집과 인스펙터 숫자 입력이 **이 함수 하나**를 쓴다. 예전에는 둘이 따로였고
 * 결과가 갈렸다 — 인스펙터는 `Math.trunc(Number(v))` 라 `1200000.5` → `1200000`,
 * 캔버스는 숫자 아닌 글자를 지우는 방식이라 소수점까지 지워 `1200000.5` → `12000005`
 * 였다. 즉 **같은 값을 캔버스에서 고치면 단가가 10배**가 되고, 그 위에 얹힌 부가세·
 * 합계·문서 금액이 통째로 어긋났다(사용자가 겪은 "단가를 고치면 부가세가 깨진다").
 *
 * 규칙은 하나다 — **소수점 앞까지만 읽는다.** 통화기호·쉼표·공백·단위(`원`)는 걷어내고
 * 소수점이 나오면 거기서 끊는다(지우지 않는다 — 지우면 자릿수가 늘어난다).
 * 음수는 0 으로 본다 — 수량·단가가 음수인 견적서는 없고, 있다면 할인 행으로 표현한다.
 */
export function parseIntInput(value: string | number): number {
  const raw = typeof value === "number" ? String(value) : String(value ?? "");
  // 소수점 뒤를 **버린다**. `1200000.5` 는 1200000 이지 12000005 가 아니다
  const head = raw.split(".")[0];
  const digits = head.replace(/[^\d]/g, "");
  if (!digits) return 0;
  // 부호가 섞였으면(음수·`1-2` 같은 오타) 0 — 값을 짐작하지 않는다
  if (head.includes("-")) return 0;
  const parsed = Number.parseInt(digits, 10);
  return Number.isFinite(parsed) ? Math.max(0, parsed) : 0;
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

/** 수식에서 쓸 수 있는 변수 — 이 목록 밖의 이름은 0 으로 평가된다 */
export const FORMULA_VARIABLES = ["subtotal"] as const;

/**
 * 수식이 **평가기가 읽지 못하는 글자**를 담고 있으면 그 이유, 아니면 `null`.
 *
 * `evalFormula` 는 알아보지 못하는 토큰을 **조용히 버린다**. 그래서 부가세를
 * `subtotal * 10%` 로 적으면 `%` 가 사라져 `subtotal * 10`, 즉 **소계의 10배**가
 * 부가세로 찍힌다(실측 1,000만원 → 1억). `subtotal*.1` 은 `.` 이 사라져 `subtotal * 1`
 * 이 되고, `subtotal + 부가세` 는 한글 이름이 사라져 소계 그대로다. 세 경우 모두
 * 화면에 **그럴듯한 숫자**가 뜨기 때문에 사용자가 알아챌 단서가 없다.
 *
 * 평가 규칙은 **바꾸지 않는다** — 이미 저장된 문서의 금액이 달라지면 안 되기 때문이다.
 * 대신 인스펙터가 이 판정을 옆에 적어 사용자가 고칠 수 있게 한다.
 */
export function formulaError(expr: string): string | null {
  const raw = String(expr ?? "");
  if (!raw.trim()) return "수식이 비어 있습니다.";
  // 평가기가 **읽는** 토큰과 공백을 걷어내고 남은 글자 = 조용히 버려지는 글자
  const rest = raw.replace(/\d+\.?\d*|[a-zA-Z_]\w*|[()+\-*/]|\s+/g, "");
  if (rest) {
    const chars = [...new Set([...rest])].join(" ");
    return `계산에 쓸 수 없는 문자가 있습니다 (${chars}). 무시되므로 금액이 달라집니다.`;
  }
  const unknown = [
    ...new Set(
      (raw.match(/[a-zA-Z_]\w*/g) ?? []).filter(
        (name) => !(FORMULA_VARIABLES as readonly string[]).includes(name),
      ),
    ),
  ];
  if (unknown.length > 0) {
    return `알 수 없는 변수 ${unknown.join(", ")} 는 0 으로 계산됩니다. 쓸 수 있는 변수: ${FORMULA_VARIABLES.join(", ")}.`;
  }
  let depth = 0;
  for (const ch of raw) {
    if (ch === "(") depth += 1;
    if (ch === ")") depth -= 1;
    if (depth < 0) return "괄호가 맞지 않습니다.";
  }
  if (depth !== 0) return "괄호가 맞지 않습니다.";
  return null;
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

/**
 * 요약행 중 **문서 금액이 되는 한 행**. 요약행이 없으면 `null`(= 품목 소계가 금액이다).
 *
 * 표식(`isTotal`)이 있으면 그 행이고, 없으면 **마지막 행**이다 — 표식이 없는 예전
 * 문서의 금액이 달라지지 않게 하는 폴백이다(`parseContentJson` 이 읽으면서 표식을
 * 붙이므로, 한 번 저장하면 그 뒤로는 표식이 단일 기준이 된다).
 * 표식이 여럿이면 **첫 번째**를 쓴다 — 총계는 하나여야 하고, 하나로 맞추는 일은
 * `normalizeSummaryRows` 가 한다.
 */
export function totalSummaryRow(
  rows: readonly SummaryRow[] | undefined,
): SummaryRow | null {
  if (!Array.isArray(rows) || rows.length === 0) return null;
  return rows.find((row) => row?.isTotal) ?? rows[rows.length - 1];
}

/**
 * 총계 표식을 **정확히 1개**로 맞춘다 (요약행을 고치는 모든 경로가 이걸 지난다).
 *
 * 표식이 없으면 마지막 행에 붙인다(예전 문서 치유 — 저장된 금액이 그대로여야 한다).
 * 여럿이면 첫 번째만 남긴다. 바뀐 게 없으면 **같은 배열**을 돌려준다 — 파싱마다 새
 * 객체를 만들면 캔버스가 헛돌고, `props` 가 달라져 미저장 표시가 잘못 켜진다.
 */
export function normalizeSummaryRows(
  rows: readonly SummaryRow[] | undefined,
): SummaryRow[] {
  if (!Array.isArray(rows)) return [];
  const target = totalSummaryRow(rows);
  if (!target) return rows as SummaryRow[];
  let changed = false;
  const next = rows.map((row) => {
    const isTotal = row === target;
    if (Boolean(row?.isTotal) === isTotal) return row;
    changed = true;
    return { ...row, isTotal };
  });
  return changed ? next : (rows as SummaryRow[]);
}

/**
 * 품목표의 최종 총계: 요약 행이 있으면 **총계 표식이 붙은 행** 값, 없으면 품목 합계.
 *
 * 예전에는 무조건 **마지막** 요약행이었다 — `공급가액` → `부가세` 순서로만 넣은
 * 문서의 금액이 부가세 금액이 되던 원인이다 (`SummaryRow.isTotal` 주석 참고).
 */
export function itemTableGrandTotal(props: BlockPropsMap["itemTable"]): number {
  const subtotal = calcItemTableTotal(props.rows);
  const total = totalSummaryRow(props.summaryRows);
  if (!total) return subtotal;
  return Math.round(evalFormula(total.formula, { subtotal }));
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
  rows: { label: string; formula: string; isTotal?: boolean }[];
}[] = [
  {
    label: "부가세 포함 합계",
    // 총계 표식은 **명시한다** — 순서에 기대면 행을 하나 더 넣는 순간 금액이 옮겨간다
    rows: [
      { label: "공급가액", formula: "subtotal" },
      { label: "부가세 (10%)", formula: "subtotal * 0.1" },
      { label: "합계 (VAT 포함)", formula: "subtotal * 1.1", isTotal: true },
    ],
  },
  {
    label: "합계만",
    rows: [{ label: "합계", formula: "subtotal", isTotal: true }],
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
 * 저장할 수 있는 `contentJson` 최대 바이트.
 *
 * 이미지는 `dataUrl` 로 본문 안에 들어간다(별도 저장소가 없다). 인스펙터가 1MB 로
 * 막지만 그건 **화면 검사**이고 서버는 본문을 그대로 저장했다 — 프로젝트가 이미
 * 겪은 교훈(문서 잠금)과 같은 구조다: 화면에서만 막으면 API 로 그대로 통한다.
 * 본문 전체에 상한을 두면 이미지 몇 장이든 한 규칙으로 묶인다.
 *
 * 4MB 는 넉넉하다 — 현재 문서 53건의 contentJson 합계가 21KB 다.
 */
export const MAX_CONTENT_JSON_BYTES = 4 * 1024 * 1024;

/** 본문이 상한을 넘으면 사용자에게 보일 이유, 넘지 않으면 null */
export function contentJsonSizeError(raw: string): string | null {
  const bytes = new TextEncoder().encode(raw).length;
  if (bytes <= MAX_CONTENT_JSON_BYTES) return null;
  const mb = (n: number) => (n / 1024 / 1024).toFixed(1);
  return `문서 본문이 너무 큽니다 (${mb(bytes)}MB / 최대 ${mb(
    MAX_CONTENT_JSON_BYTES,
  )}MB). 이미지 크기를 줄여 주세요.`;
}

/** 정보 블록(공급자·거래처)의 필드 역할을 채운 props — 그 외 블록은 그대로 */
function healBlockMetaRoles(block: Block): Block["props"] {
  if (block.type !== "supplier" && block.type !== "clientMeta") return block.props;
  const props = block.props as BlockPropsMap["clientMeta"];
  if (!Array.isArray(props.fields)) return block.props;
  // 역할 후보를 **그 블록에서 쓰이는 것으로** 좁힌다 — 거래처 블록의 `주소` 칸이
  // 공급자 주소 역할을 차지하면 회사 주소가 거래처 자리에 채워진다
  const fields = healMetaFieldRoles(props.fields, undefined, metaRolesFor(block.type));
  return fields === props.fields ? block.props : { ...props, fields };
}

/**
 * 품목표 요약행에 **총계 표식**을 채운 props (표식이 없는 예전 문서 치유).
 *
 * 마지막 행에 붙이므로 저장된 금액은 달라지지 않고, 그 뒤로는 행을 더해도 금액이
 * 따라 옮겨가지 않는다 — 이것이 이 치유의 목적이다.
 */
function healItemTableTotal(block: Block): Block["props"] {
  const props = block.props as BlockPropsMap["itemTable"];
  if (!Array.isArray(props.summaryRows)) return block.props;
  const summaryRows = normalizeSummaryRows(props.summaryRows);
  return summaryRows === props.summaryRows
    ? block.props
    : { ...props, summaryRows };
}

/** 읽으면서 채우는 값들을 한곳에서 갈라 준다 (블록 종류별 치유) */
function healBlockProps(block: Block): Block["props"] {
  if (block.type === "supplier" || block.type === "clientMeta") {
    return healBlockMetaRoles(block);
  }
  if (block.type === "itemTable") return healItemTableTotal(block);
  // 이미지의 **자리**(로고·인감)도 같은 방식으로 채운다 (`alt` 로 추정)
  if (block.type === "image") return healImageRole(block.props as BlockPropsMap["image"]);
  return block.props;
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
      /*
       * 정보 필드의 **역할**을 여기서 채운다 (예전 contentJson 에는 없다).
       * 지금 채워 두면 다음 저장에 함께 남으므로, 그 뒤로는 라벨을 고쳐도 거래처명·
       * 공급자명 조회가 끊기지 않는다. 마이그레이션 없이 읽는 쪽에서 치유하는 방식은
       * 음수 z 와 같은 선례다. 품목표 요약행의 **총계 표식**도 같은 방식으로 채운다
       * (없으면 마지막 행 — 예전 규약을 그대로 굳혀 금액이 달라지지 않게 한다).
       */
      props: healBlockProps(b),
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

/**
 * 거래처 메타 블록에서 거래처명을 추출한다 (`Document.clientName` 동기화용).
 * 조회는 **역할**로 한다 — 라벨을 `거래처명` 으로 바꿔도 목록의 거래처명이 끊기지 않는다.
 */
export function extractClientName(doc: EditorDoc): string | null {
  const meta = doc.blocks.find((b) => b.type === "clientMeta");
  if (!meta) return null;
  const fields = (meta.props as BlockPropsMap["clientMeta"]).fields;
  const value = findMetaField(fields, "clientName")?.value?.trim();
  return value ? value : null;
}

// ======================= 회사 정보(공급자) 반영 =======================

/**
 * 회사 정보 → 공급자 필드 역할별 값.
 *
 * `이메일` 은 없다 — `Branding` 에 이메일 컬럼이 없기 때문이다. 억지로 대표 연락처를
 * 넣거나 사용자 이메일을 끌어오지 않는다(회사 대표 메일과 담당자 메일은 다른 값이다).
 */
export function companyMetaValues(
  company: CompanyProfile,
): Partial<Record<MetaFieldRole, string>> {
  return {
    supplierName: company.companyName ?? "",
    supplierCeoName: company.ceoName ?? "",
    supplierBizRegNo: company.bizRegNo ?? "",
    supplierAddress: company.address ?? "",
    supplierPhone: company.phone ?? "",
  };
}

/**
 * **빈** 공급자 칸과 **빈** 로고·인감 이미지에 회사 정보를 채운 문서.
 *
 * ## 왜 문서 단위인가
 *
 * 예전에는 이 폴백이 **인쇄 렌더러에만** 있었다(`renderFieldTable` 의 `fallbacks`,
 * `renderImage` 의 `branding.logoUrl`). 그러면 캔버스는 빈 칸, PDF 는 채워진 칸이 되어
 * "화면 렌더러와 인쇄 렌더러는 같은 값을 쓴다" 는 규칙이 깨진다 — 사용자가 화면에서
 * 확인할 수 없는 내용이 고객에게 발송된다. 그래서 규칙을 **문서 한 단계 위**로 올려,
 * 에디터·미리보기·PDF 가 모두 이 함수를 지난 같은 문서를 그린다.
 *
 * ## 지키는 선
 *
 * - **사용자가 적은 값은 절대 덮지 않는다.** 비어 있는 칸만 채운다.
 * - **역할로 지목한다** (`MetaFieldRole` · `ImageRole`). 라벨·`alt` 문자열 비교는
 *   사용자가 라벨을 고치는 순간 끊긴다.
 * - **블록을 만들지 않는다.** 없는 인감 블록을 여기서 만들면 문서를 열 때마다 블록이
 *   생겨난다. 블록을 놓는 것은 시드(`seedTemplate`·AI 조립)의 일이다.
 * - 바뀔 것이 없으면 **같은 객체**를 돌려준다 (불필요한 리렌더·미저장 표시 방지).
 *
 * 채운 값은 다음 저장에 함께 남는다 — `MetaFieldRole`·음수 z 치유와 같은 선례다.
 */
export function withCompanyDefaults(
  doc: EditorDoc,
  company: CompanyProfile | null | undefined,
): EditorDoc {
  if (!company) return doc;
  const values = companyMetaValues(company);
  const images: Record<ImageRole, string> = {
    logo: company.logoUrl ?? "",
    stamp: company.stampUrl ?? "",
  };
  let changed = false;

  const blocks = doc.blocks.map((block) => {
    if (block.type === "supplier") {
      const props = block.props as BlockPropsMap["supplier"];
      if (!Array.isArray(props.fields)) return block;
      let touched = false;
      const fields = props.fields.map((f) => {
        if (!f?.role || String(f.value ?? "").trim()) return f;
        const value = values[f.role];
        if (!value) return f;
        touched = true;
        return { ...f, value };
      });
      if (!touched) return block;
      changed = true;
      return { ...block, props: { ...props, fields } };
    }
    if (block.type === "image") {
      const props = block.props as BlockPropsMap["image"];
      if (!props.role || String(props.dataUrl ?? "").trim()) return block;
      const dataUrl = images[props.role];
      if (!dataUrl) return block;
      changed = true;
      return { ...block, props: { ...props, dataUrl } };
    }
    return block;
  });

  return changed ? { ...doc, blocks } : doc;
}

/**
 * 인감 블록의 기본 자리·크기.
 *
 * 공급자 블록(x 437, w 317)의 **오른쪽 위**에 겹친다 — 국내 견적서에서 직인은 보통
 * 상호·대표자 줄 끝에 찍힌다. 라벨 폭이 72px 이라 값은 x 509 부터 시작하고 상호·대표자·
 * 등록번호는 짧아서, 오른쪽 68px 구간은 글자와 거의 겹치지 않는다. A4 우측 여백(40px)을
 * 지켜 오른쪽 끝은 752px 이다.
 *
 * **좌표를 고정값으로 두는 이유**: 블록은 절대좌표이고 사용자가 옮길 수 있다.
 * 시드는 "처음 놓이는 자리" 만 정하고 그 뒤로는 문서가 정답이다.
 */
export const STAMP_BOX = { x: 684, y: 126, w: 68, h: 68 } as const;

/** 공급자 블록 한 줄의 높이 (인쇄 CSS `.blk-supplier` 의 11px × 1.5 + 여백 기준) */
export const SUPPLIER_ROW_H = 22;

/**
 * 공급자 블록의 시드 높이.
 *
 * 주소는 한 줄에 담기지 않는 경우가 흔하다(값 열은 약 245px, 11px 글꼴로 20자 내외).
 * 줄 수를 어림해 처음부터 담기는 높이로 놓는다 — 열자마자 잘림 경고가 뜨면 사용자가
 * 자기 잘못인지 시드 탓인지 알 수 없다. 어림이 틀려도 `use-overflow` 의
 * "내용에 맞추기" 가 남아 있으므로 **늘리는 쪽으로만** 후하게 잡는다.
 */
export function supplierBlockHeight(fields: MetaField[]): number {
  const extraLines = fields.reduce((sum, f) => {
    const len = String(f.value ?? "").length;
    return sum + Math.min(4, Math.max(0, Math.ceil(len / 20) - 1));
  }, 0);
  return 12 + (fields.length + extraLines) * SUPPLIER_ROW_H;
}

/** contentJson 이 없는 문서를 위한 기본 문서 템플릿 시드. */
export function seedTemplate(input: {
  type: string;
  clientName: string | null;
  /**
   * 회사 정보 — 공급자 칸·로고·인감의 출처 (설정 7).
   *
   * 예전에는 `supplierName` 문자열 하나와 `logoUrl` 만 받았고, 그래서 공급자 블록의
   * `상호` 한 칸만 채워졌다(나머지 다섯 칸은 영구히 비어 있었다). 회사 정보를 통째로
   * 받으면 그 구멍이 근본에서 사라지고, 상호 폴백(조직명·사용자명)을 정하는 곳도
   * `toCompanyProfile` 한 곳으로 모인다.
   */
  company: CompanyProfile;
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

  // 로고 블록 — 원본 700×105 비율(≈6.67:1)에 맞춘 크기. 값은 아래 withCompanyDefaults 가 채운다
  const logo = createBlock("image", { x: 40, y: 48 });
  logo.w = 200;
  logo.h = 30;
  const logoProps = logo.props as BlockPropsMap["image"];
  logoProps.alt = "회사 로고";
  logoProps.role = "logo";

  const title = createBlock("title", { x: 247, y: 56 });
  // 문서 종류에 맞는 제목을 시드한다 (계약서/NDA/제안서에서 "견적서"로 뜨지 않도록).
  (title.props as BlockPropsMap["title"]).text = typeLabel;

  /*
   * 공급자 블록 — 여섯 칸 모두 `defaultProps` 가 역할을 갖고 나오므로, 값은 아래에서
   * `withCompanyDefaults` 가 **역할로** 채운다. 라벨 문자열로 칸을 찾지 않는다.
   */
  const supplier = createBlock("supplier", { x: 437, y: 130 });
  const supplierProps = supplier.props as BlockPropsMap["supplier"];
  const supplierValues = companyMetaValues(input.company);
  supplier.h = supplierBlockHeight(
    supplierProps.fields.map((f) => ({
      ...f,
      value: (f.role ? supplierValues[f.role] : "") ?? "",
    })),
  );

  const clientMeta = createBlock("clientMeta", { x: 40, y: 130 });
  (clientMeta.props as BlockPropsMap["clientMeta"]).fields = [
    { id: uid(), label: "고객사명", value: input.clientName ?? "", role: "clientName" },
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

  /*
   * 인감(직인) — **인감이 등록된 조직에만** 블록을 놓는다.
   *
   * 값이 없는데 블록을 놓으면 캔버스에 "이미지 없음" 회색 자리표시자가 생기고, 그 문서를
   * 그대로 발송하면 고객이 받는 견적서에 빈 사각형이 남는다. 인감은 있으면 찍고 없으면
   * 아예 없는 것이 맞다(나중에 등록하면 새 문서부터 붙는다).
   *
   * 겹침 순서는 `reorderZ(..., "front")` 로 정한다 — z 를 손으로 계산하지 않는다.
   * 예전 "맨 뒤로" 가 `min-1` 로 음수를 만들어 블록이 화면·PDF 에서 통째로 사라진 전례가
   * 있고, 정규화(1..n)를 지키는 곳은 이 함수 하나다.
   */
  let stampId: string | null = null;
  if (input.company.stampUrl) {
    const stamp = createBlock("image", { x: STAMP_BOX.x, y: STAMP_BOX.y });
    stamp.w = STAMP_BOX.w;
    stamp.h = STAMP_BOX.h;
    const stampProps = stamp.props as BlockPropsMap["image"];
    stampProps.alt = "회사 인감";
    stampProps.role = "stamp";
    blocks.push(stamp);
    stampId = stamp.id;
  }

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

  /*
   * 값은 **마지막에 한 번** 채운다. 블록마다 손으로 채우면 칸을 늘릴 때 배선을 하나 더
   * 해야 하고(그래서 다섯 칸이 비어 있었다), 에디터·미리보기·PDF 가 쓰는 규칙과도
   * 갈라진다. 시드는 자리만 놓고 값은 `withCompanyDefaults` 하나가 정한다.
   */
  return withCompanyDefaults(
    {
      version: 1,
      canvas: { w: A4.w, h: A4.h, pages: 1 },
      // 인감이 없으면 겹침 순서를 건드릴 이유가 없다 (모두 z=1 인 예전 모습 그대로)
      blocks: stampId ? reorderZ(blocks, stampId, "front") : blocks,
    },
    input.company,
  );
}
