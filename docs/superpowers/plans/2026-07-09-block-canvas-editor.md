# 블록 캔버스 문서 에디터 구현 계획

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** `/editor/:documentId` 를 A4 캔버스 위에서 블록을 드래그·리사이즈·편집하고 `Document.contentJson` 에 실제 저장하는 블록 에디터로 교체한다.

**Architecture:** 서버 컴포넌트 `page.tsx` 가 문서를 로드해 `contentJson` 을 파싱(없으면 기존 `DocumentItem` 으로 기본 견적서 템플릿 시드)한 뒤 초기 `EditorDoc`(순수 객체)을 단일 client 아일랜드 `document-editor.tsx` 에 넘긴다. 클라이언트는 블록 배열 상태를 관리하고 `react-rnd` 로 이동/리사이즈, 인스펙터로 내용/폼 편집, 저장 버튼으로 `PATCH /api/documents/:id` 호출한다. 금액은 서버가 `contentJson` 에서 재계산한다.

**Tech Stack:** Next.js 16(App Router) · React 19 · TypeScript · Tailwind v4 · shadcn/ui · react-rnd 10.5.3 · Prisma 7 + SQLite

## Global Constraints

- 패키지 매니저는 **pnpm** 전용 (npm/yarn 금지).
- DB 접근은 반드시 `src/lib/db.ts` 의 `prisma` 싱글톤 경유.
- 금액은 원(KRW) 정수(Int), 표시는 `@/lib/format` 의 `formatKRW` (정책 FORM_CURRENCY_KRW).
- 모든 UI 텍스트는 **한국어 존댓말** (정책 COPY-TONE). 접근성 준수(ACC_*: WCAG AA 대비, 터치 타깃 44px).
- import alias `@/*` = `src/*`.
- 페이지는 서버 컴포넌트 기본, 상호작용만 `"use client"` 로 분리해 해당 폴더 `_components/` 에 co-locate.
- 클라이언트 컴포넌트에 함수/비직렬화 객체를 props 로 넘기지 않는다 (REACT_BEST_PRACTICES). 서버 조회는 `page.tsx` 에서 수행.
- 스키마 변경 금지 — `Document.contentJson`(기존 String? 필드) 재사용, 마이그레이션 없음.
- **검증 규약(이 저장소엔 테스트 러너 없음):** 순수 로직은 `pnpm tsx <script>` 로 실제 assert 스크립트를 돌려 검증한다. UI/통합은 `pnpm typecheck` + `pnpm lint` (+ 필요 시 `pnpm build`) 통과와 앱 수동 확인으로 검증한다. 커밋 전 `pnpm typecheck` 와 `pnpm lint` 를 통과시킨다.

---

## 파일 구조

```
src/lib/editor-schema.ts                    # (신규) 블록/문서 타입·기본 템플릿·파싱·합계 계산
src/app/(user)/editor/[documentId]/
  page.tsx                                  # (수정) 로드→파싱/시드→초기 EditorDoc 전달
  _components/
    document-editor.tsx                     # (신규) 최상위 client — 상태·저장·이탈경고
    editor-toolbar.tsx                      # (신규) 상단 저장/발송 툴바
    block-palette.tsx                       # (신규) 좌: 블록 추가(드래그/클릭)
    editor-canvas.tsx                        # (신규) 중앙: A4 캔버스·드롭 처리
    canvas-block.tsx                        # (신규) 개별 블록 react-rnd 래퍼
    block-inspector.tsx                     # (신규) 우: 선택 블록 속성 편집
    blocks/
      index.tsx                             # (신규) type→렌더러 레지스트리
      title-block.tsx                       # (신규)
      text-block.tsx                        # (신규)
      supplier-block.tsx                    # (신규)
      client-meta-block.tsx                 # (신규)
      item-table-block.tsx                  # (신규)
      table-block.tsx                       # (신규)
      image-block.tsx                       # (신규)
      divider-block.tsx                     # (신규)
    editor-client.tsx                       # (삭제) 기존 단순 폼 에디터
src/app/api/documents/[id]/route.ts         # (수정) PATCH: contentJson 기반 amount 서버 재계산
docs/SPEC.md                                # (수정) 에디터 행 비고
AGENTS.md                                   # (수정) 에디터 설명(있으면)
package.json                                # (수정, Task 1) react-rnd + pnpm.onlyBuiltDependencies
```

---

## Task 1: 데이터 모델·시드 로직 (`editor-schema.ts`) + 의존성

**Files:**
- Modify: `package.json` (react-rnd 의존성, `pnpm.onlyBuiltDependencies`)
- Create: `src/lib/editor-schema.ts`
- Test: `scripts/editor-schema.test.ts` (throwaway tsx assertion script)

**Interfaces:**
- Produces:
  - `BLOCK_TYPES`, `BlockType`
  - `type ItemRow = { id: string; name: string; description: string; quantity: number; unitPrice: number }`
  - `type BlockPropsMap` (type별 props), `type AnyBlockProps`
  - `type Block = { id: string; type: BlockType; x: number; y: number; w: number; h: number; z: number; locked: boolean; props: AnyBlockProps }`
  - `type EditorDoc = { version: 1; canvas: { w: number; h: number }; blocks: Block[] }`
  - `A4: { w: 794; h: 1123 }`
  - `defaultProps(type: BlockType): AnyBlockProps`
  - `createBlock(type: BlockType, pos?: { x?: number; y?: number }): Block`
  - `parseContentJson(raw: string | null | undefined): EditorDoc | null`
  - `calcItemTableTotal(rows: ItemRow[]): number`
  - `computeAmount(doc: EditorDoc): number`
  - `seedTemplate(input: { title: string; clientName: string | null; supplierName: string; items: { name: string; description: string | null; quantity: number; unitPrice: number }[] }): EditorDoc`
  - `BLOCK_LABELS: Record<BlockType, string>`

- [ ] **Step 1: 의존성 추가** (워크트리에는 이미 반영됨 — 신규 환경이면 아래를 적용)

`package.json` `dependencies` 에 `"react-rnd": "^10.5.3"` 추가, 최상위에 아래 블록 추가:

```json
  "pnpm": {
    "onlyBuiltDependencies": ["better-sqlite3"]
  }
```

- [ ] **Step 2: 설치 & better-sqlite3 빌드**

Run:
```bash
pnpm install
# better-sqlite3 네이티브 빌드가 막히면(이 머신 CLT 이슈) 아래 우회 후 rebuild:
export npm_config_python=/usr/bin/python3 PYTHON=/usr/bin/python3
export CXXFLAGS="-isystem /Library/Developer/CommandLineTools/SDKs/MacOSX.sdk/usr/include/c++/v1"
export CPPFLAGS="$CXXFLAGS"
pnpm rebuild better-sqlite3
```
Expected: `react-rnd@10.5.3` 설치, `node -e "require('better-sqlite3')"` 성공.

- [ ] **Step 3: `src/lib/editor-schema.ts` 작성**

```ts
/**
 * 블록 캔버스 에디터의 문서 모델.
 * Document.contentJson 에 EditorDoc(JSON 직렬화)로 저장한다.
 * (서버·클라이언트 공용 순수 모듈 — server-only import 금지)
 */

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
  clientMeta: "거래처·견적 메타",
  itemTable: "품목 표",
  table: "표",
  image: "이미지",
  divider: "구분선",
};

export type Align = "left" | "center" | "right";

export type ItemRow = {
  id: string;
  name: string;
  description: string;
  quantity: number;
  unitPrice: number;
};

export type MetaField = { label: string; value: string };

export type BlockPropsMap = {
  title: { text: string; align: Align; fontSize: number };
  text: { text: string; align: Align; fontSize: number };
  supplier: {
    companyName: string;
    regNo: string;
    ceo: string;
    address: string;
    tel: string;
    fax: string;
    email: string;
    manager: string;
  };
  clientMeta: { fields: MetaField[] };
  itemTable: { rows: ItemRow[]; showTotal: boolean };
  table: { hasHeader: boolean; cells: string[][] };
  image: { dataUrl: string; alt: string; fit: "contain" | "cover" };
  divider: { orientation: "horizontal" | "vertical" };
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
  canvas: { w: number; h: number };
  blocks: Block[];
};

function uid(): string {
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

export function defaultProps(type: BlockType): AnyBlockProps {
  switch (type) {
    case "title":
      return { text: "견 적 서", align: "center", fontSize: 28 };
    case "text":
      return { text: "내용을 입력하세요.", align: "left", fontSize: 13 };
    case "supplier":
      return {
        companyName: "",
        regNo: "",
        ceo: "",
        address: "",
        tel: "",
        fax: "",
        email: "",
        manager: "",
      };
    case "clientMeta":
      return {
        fields: [
          { label: "고객사명", value: "" },
          { label: "수신자", value: "" },
          { label: "견적일", value: "" },
          { label: "유효기간", value: "" },
        ],
      };
    case "itemTable":
      return { rows: [], showTotal: true };
    case "table":
      return {
        hasHeader: true,
        cells: [
          ["항목", "값"],
          ["", ""],
        ],
      };
    case "image":
      return { dataUrl: "", alt: "이미지", fit: "contain" };
    case "divider":
      return { orientation: "horizontal" };
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
  return rows.reduce(
    (sum, r) => sum + Math.round(r.quantity) * Math.round(r.unitPrice),
    0,
  );
}

export function computeAmount(doc: EditorDoc): number {
  return doc.blocks
    .filter((b) => b.type === "itemTable")
    .reduce(
      (sum, b) => sum + calcItemTableTotal((b.props as BlockPropsMap["itemTable"]).rows),
      0,
    );
}

/** contentJson 문자열을 EditorDoc 으로 안전 파싱. 형태가 어긋나면 null. */
export function parseContentJson(
  raw: string | null | undefined,
): EditorDoc | null {
  if (!raw) return null;
  try {
    const obj = JSON.parse(raw) as unknown;
    if (
      typeof obj === "object" &&
      obj !== null &&
      "blocks" in obj &&
      Array.isArray((obj as EditorDoc).blocks)
    ) {
      const doc = obj as EditorDoc;
      return {
        version: 1,
        canvas: doc.canvas ?? { w: A4.w, h: A4.h },
        blocks: doc.blocks,
      };
    }
    return null;
  } catch {
    return null;
  }
}

/** contentJson 이 없는 문서를 위한 기본 견적서 템플릿 시드. */
export function seedTemplate(input: {
  title: string;
  clientName: string | null;
  supplierName: string;
  items: {
    name: string;
    description: string | null;
    quantity: number;
    unitPrice: number;
  }[];
}): EditorDoc {
  const title = createBlock("title", { x: 247, y: 56 });
  (title.props as BlockPropsMap["title"]).text = "견 적 서";

  const supplier = createBlock("supplier", { x: 437, y: 130 });
  (supplier.props as BlockPropsMap["supplier"]).companyName = input.supplierName;

  const clientMeta = createBlock("clientMeta", { x: 40, y: 130 });
  (clientMeta.props as BlockPropsMap["clientMeta"]).fields = [
    { label: "고객사명", value: input.clientName ?? "" },
    { label: "수신자", value: "" },
    { label: "견적일", value: "" },
    { label: "유효기간", value: "" },
  ];

  const itemTable = createBlock("itemTable", { x: 40, y: 320 });
  (itemTable.props as BlockPropsMap["itemTable"]).rows = input.items.map((it) => ({
    id: uid(),
    name: it.name,
    description: it.description ?? "",
    quantity: it.quantity,
    unitPrice: it.unitPrice,
  }));

  const notice = createBlock("text", { x: 40, y: 650 });
  notice.w = 714;
  (notice.props as BlockPropsMap["text"]).text = "※ 상기 견적은 부가세 별도입니다.";

  return {
    version: 1,
    canvas: { w: A4.w, h: A4.h },
    blocks: [title, supplier, clientMeta, itemTable, notice],
  };
}
```

- [ ] **Step 4: 검증용 assert 스크립트 작성** — `scripts/editor-schema.test.ts`

```ts
import assert from "node:assert/strict";
import {
  parseContentJson,
  seedTemplate,
  computeAmount,
  calcItemTableTotal,
  createBlock,
} from "../src/lib/editor-schema";

// parseContentJson: 잘못된 입력은 null
assert.equal(parseContentJson(null), null);
assert.equal(parseContentJson("not json"), null);
assert.equal(parseContentJson("{}"), null);

// seedTemplate: 기존 아이템이 itemTable 로 들어가고 합계가 맞는다
const doc = seedTemplate({
  title: "테스트 견적",
  clientName: "(주)테스트",
  supplierName: "SpecFlow AI",
  items: [
    { name: "구축", description: "일괄", quantity: 1, unitPrice: 15_000_000 },
    { name: "서버", description: "5대", quantity: 5, unitPrice: 500_000 },
  ],
});
assert.equal(doc.blocks.length, 5);
assert.equal(doc.blocks.filter((b) => b.type === "itemTable").length, 1);
assert.equal(computeAmount(doc), 17_500_000);

// round-trip: 직렬화→파싱 후 합계 동일
const round = parseContentJson(JSON.stringify(doc));
assert.ok(round);
assert.equal(computeAmount(round), 17_500_000);

// calcItemTableTotal: 정수 반올림 곱
assert.equal(
  calcItemTableTotal([{ id: "a", name: "x", description: "", quantity: 3, unitPrice: 1000 }]),
  3000,
);

// createBlock: 기본값
const b = createBlock("title");
assert.equal(b.type, "title");
assert.equal(b.locked, false);

console.log("editor-schema tests passed ✅");
```

- [ ] **Step 5: 테스트 실행 → 통과 확인**

Run: `pnpm tsx scripts/editor-schema.test.ts`
Expected: `editor-schema tests passed ✅` (exit 0)

- [ ] **Step 6: typecheck & lint**

Run: `pnpm typecheck && pnpm lint`
Expected: 오류 없음.

- [ ] **Step 7: Commit**

```bash
git add package.json pnpm-lock.yaml src/lib/editor-schema.ts scripts/editor-schema.test.ts
git commit -m "feat(editor): 블록 에디터 데이터 모델·시드 로직 추가

- EditorDoc/Block 타입, 기본 템플릿 시드, 합계 계산, contentJson 파싱
- react-rnd 의존성 추가, better-sqlite3 빌드 허용(pnpm)"
```

---

## Task 2: PATCH 라우트 — amount 서버 재계산

**Files:**
- Modify: `src/app/api/documents/[id]/route.ts` (PATCH 핸들러)

**Interfaces:**
- Consumes: `parseContentJson`, `computeAmount` (Task 1)
- Produces: `PATCH /api/documents/:id` 가 `contentJson` 수신 시 `amount` 를 서버에서 재계산해 저장 (클라이언트 amount 무시).

- [ ] **Step 1: import 추가**

`route.ts` 상단 import 에 추가:
```ts
import { parseContentJson, computeAmount } from "@/lib/editor-schema";
```

- [ ] **Step 2: PATCH 의 update data 를 아래로 교체**

기존 `const doc = await prisma.document.update({ ... })` 블록을 다음으로 교체:
```ts
  // contentJson 이 오면 금액은 서버에서 재계산한다 (정책 VAL_ — 클라이언트 값 불신)
  const contentJson =
    typeof body.contentJson === "string" ? body.contentJson : undefined;
  const parsed = contentJson ? parseContentJson(contentJson) : null;
  const recomputedAmount = parsed ? computeAmount(parsed) : undefined;

  const doc = await prisma.document.update({
    where: { id },
    data: {
      title: typeof body.title === "string" ? body.title : undefined,
      type: typeof body.type === "string" ? body.type : undefined,
      status: typeof body.status === "string" ? body.status : undefined,
      clientName:
        typeof body.clientName === "string" ? body.clientName : undefined,
      amount:
        recomputedAmount ??
        (typeof body.amount === "number" ? body.amount : undefined),
      contentJson,
    },
  });
```

- [ ] **Step 3: typecheck & lint**

Run: `pnpm typecheck && pnpm lint`
Expected: 오류 없음.

- [ ] **Step 4: 런타임 확인 (수동)**

Run: `pnpm dev` 후 다른 터미널에서
```bash
# 데모 문서 id 하나 조회
curl -s localhost:3000/api/documents | pnpm tsx -e "const s=require('fs').readFileSync(0,'utf8');const id=JSON.parse(s).data[0].id;console.log(id)"
```
→ 얻은 `<ID>` 로 PATCH 후 amount 가 rows 합계로 저장되는지 확인:
```bash
curl -s -X PATCH localhost:3000/api/documents/<ID> \
  -H 'content-type: application/json' \
  -d '{"contentJson":"{\"version\":1,\"canvas\":{\"w\":794,\"h\":1123},\"blocks\":[{\"id\":\"b\",\"type\":\"itemTable\",\"x\":0,\"y\":0,\"w\":700,\"h\":200,\"z\":1,\"locked\":false,\"props\":{\"showTotal\":true,\"rows\":[{\"id\":\"r\",\"name\":\"x\",\"description\":\"\",\"quantity\":2,\"unitPrice\":5000}]}}]}","amount":999}'
```
Expected: 응답 `data.amount === 10000` (클라이언트가 보낸 999 가 아님).

- [ ] **Step 5: Commit**

```bash
git add src/app/api/documents/[id]/route.ts
git commit -m "feat(api): PATCH 문서 저장 시 contentJson 기반 amount 서버 재계산"
```

---

## Task 3: 블록 렌더러 8종 + 레지스트리

블록 렌더러는 **표시 전용(presentational)** 이다 — 편집은 인스펙터(Task 6)에서 한다. 각 렌더러는 `block` 하나만 받아 props 를 그린다.

**Files:**
- Create: `src/app/(user)/editor/[documentId]/_components/blocks/index.tsx`
- Create: 같은 폴더의 `title-block.tsx` `text-block.tsx` `supplier-block.tsx` `client-meta-block.tsx` `item-table-block.tsx` `table-block.tsx` `image-block.tsx` `divider-block.tsx`

**Interfaces:**
- Consumes: `Block`, `BlockPropsMap`, `calcItemTableTotal` (Task 1), `formatKRW` (`@/lib/format`)
- Produces: `renderBlock(block: Block): React.ReactNode` (from `blocks/index.tsx`)

- [ ] **Step 1: `title-block.tsx`**

```tsx
import type { Block, BlockPropsMap } from "@/lib/editor-schema";

export function TitleBlock({ block }: { block: Block }) {
  const p = block.props as BlockPropsMap["title"];
  return (
    <div
      className="flex h-full w-full items-center px-2 font-bold tracking-widest"
      style={{ textAlign: p.align, fontSize: p.fontSize, justifyContent: p.align === "center" ? "center" : p.align === "right" ? "flex-end" : "flex-start" }}
    >
      {p.text}
    </div>
  );
}
```

- [ ] **Step 2: `text-block.tsx`**

```tsx
import type { Block, BlockPropsMap } from "@/lib/editor-schema";

export function TextBlock({ block }: { block: Block }) {
  const p = block.props as BlockPropsMap["text"];
  return (
    <div
      className="h-full w-full whitespace-pre-wrap px-2 py-1 leading-relaxed"
      style={{ textAlign: p.align, fontSize: p.fontSize }}
    >
      {p.text}
    </div>
  );
}
```

- [ ] **Step 3: `supplier-block.tsx`**

```tsx
import type { Block, BlockPropsMap } from "@/lib/editor-schema";

export function SupplierBlock({ block }: { block: Block }) {
  const p = block.props as BlockPropsMap["supplier"];
  const rows: [string, string][] = [
    ["상호", p.companyName],
    ["대표자", p.ceo],
    ["등록번호", p.regNo],
    ["주소", p.address],
    ["전화", p.tel],
    ["팩스", p.fax],
    ["이메일", p.email],
    ["담당자", p.manager],
  ];
  return (
    <table className="h-full w-full border-collapse text-[11px]">
      <tbody>
        {rows.map(([k, v]) => (
          <tr key={k}>
            <th className="w-16 border bg-muted px-1 py-0.5 text-left font-medium text-muted-foreground">
              {k}
            </th>
            <td className="border px-1 py-0.5">{v}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}
```

- [ ] **Step 4: `client-meta-block.tsx`**

```tsx
import type { Block, BlockPropsMap } from "@/lib/editor-schema";

export function ClientMetaBlock({ block }: { block: Block }) {
  const p = block.props as BlockPropsMap["clientMeta"];
  return (
    <table className="h-full w-full border-collapse text-xs">
      <tbody>
        {p.fields.map((f, i) => (
          <tr key={`${f.label}-${i}`}>
            <th className="w-24 border bg-muted px-2 py-1 text-left font-medium text-muted-foreground">
              {f.label}
            </th>
            <td className="border px-2 py-1">{f.value}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}
```

- [ ] **Step 5: `item-table-block.tsx`**

```tsx
import type { Block, BlockPropsMap } from "@/lib/editor-schema";
import { calcItemTableTotal } from "@/lib/editor-schema";
import { formatKRW } from "@/lib/format";

export function ItemTableBlock({ block }: { block: Block }) {
  const p = block.props as BlockPropsMap["itemTable"];
  const total = calcItemTableTotal(p.rows);
  return (
    <table className="h-full w-full border-collapse text-xs">
      <thead>
        <tr className="bg-muted">
          <th className="border px-2 py-1 text-left">품목 / 설명</th>
          <th className="border px-2 py-1 text-right">수량</th>
          <th className="border px-2 py-1 text-right">단가</th>
          <th className="border px-2 py-1 text-right">금액</th>
        </tr>
      </thead>
      <tbody>
        {p.rows.map((r) => (
          <tr key={r.id}>
            <td className="border px-2 py-1">
              <div className="font-medium">{r.name}</div>
              {r.description ? (
                <div className="text-[11px] text-muted-foreground">{r.description}</div>
              ) : null}
            </td>
            <td className="border px-2 py-1 text-right tabular-nums">{r.quantity}</td>
            <td className="border px-2 py-1 text-right tabular-nums">{formatKRW(r.unitPrice)}</td>
            <td className="border px-2 py-1 text-right tabular-nums">
              {formatKRW(r.quantity * r.unitPrice)}
            </td>
          </tr>
        ))}
      </tbody>
      {p.showTotal ? (
        <tfoot>
          <tr>
            <td className="border px-2 py-1 text-right font-semibold" colSpan={3}>
              합계
            </td>
            <td className="border px-2 py-1 text-right font-semibold tabular-nums">
              {formatKRW(total)}
            </td>
          </tr>
        </tfoot>
      ) : null}
    </table>
  );
}
```

- [ ] **Step 6: `table-block.tsx`**

```tsx
import type { Block, BlockPropsMap } from "@/lib/editor-schema";

export function TableBlock({ block }: { block: Block }) {
  const p = block.props as BlockPropsMap["table"];
  return (
    <table className="h-full w-full border-collapse text-xs">
      <tbody>
        {p.cells.map((row, ri) => (
          <tr key={ri}>
            {row.map((cell, ci) => {
              const header = p.hasHeader && ri === 0;
              return header ? (
                <th key={ci} className="border bg-muted px-2 py-1 text-left font-medium">
                  {cell}
                </th>
              ) : (
                <td key={ci} className="border px-2 py-1">
                  {cell}
                </td>
              );
            })}
          </tr>
        ))}
      </tbody>
    </table>
  );
}
```

- [ ] **Step 7: `image-block.tsx`**

```tsx
import type { Block, BlockPropsMap } from "@/lib/editor-schema";

export function ImageBlock({ block }: { block: Block }) {
  const p = block.props as BlockPropsMap["image"];
  if (!p.dataUrl) {
    return (
      <div className="flex h-full w-full items-center justify-center border border-dashed text-[11px] text-muted-foreground">
        이미지 없음
      </div>
    );
  }
  // 에디터 미리보기용 data URL — next/image 불필요
  // eslint-disable-next-line @next/next/no-img-element
  return <img src={p.dataUrl} alt={p.alt} className="h-full w-full" style={{ objectFit: p.fit }} />;
}
```

- [ ] **Step 8: `divider-block.tsx`**

```tsx
import type { Block, BlockPropsMap } from "@/lib/editor-schema";

export function DividerBlock({ block }: { block: Block }) {
  const p = block.props as BlockPropsMap["divider"];
  return (
    <div className="flex h-full w-full items-center justify-center">
      <div className={p.orientation === "vertical" ? "h-full w-px bg-border" : "h-px w-full bg-border"} />
    </div>
  );
}
```

- [ ] **Step 9: `blocks/index.tsx` 레지스트리**

```tsx
import type { Block } from "@/lib/editor-schema";
import { TitleBlock } from "./title-block";
import { TextBlock } from "./text-block";
import { SupplierBlock } from "./supplier-block";
import { ClientMetaBlock } from "./client-meta-block";
import { ItemTableBlock } from "./item-table-block";
import { TableBlock } from "./table-block";
import { ImageBlock } from "./image-block";
import { DividerBlock } from "./divider-block";

export function renderBlock(block: Block) {
  switch (block.type) {
    case "title":
      return <TitleBlock block={block} />;
    case "text":
      return <TextBlock block={block} />;
    case "supplier":
      return <SupplierBlock block={block} />;
    case "clientMeta":
      return <ClientMetaBlock block={block} />;
    case "itemTable":
      return <ItemTableBlock block={block} />;
    case "table":
      return <TableBlock block={block} />;
    case "image":
      return <ImageBlock block={block} />;
    case "divider":
      return <DividerBlock block={block} />;
  }
}
```

- [ ] **Step 10: typecheck & lint & commit**

Run: `pnpm typecheck && pnpm lint`
Expected: 오류 없음.
```bash
git add "src/app/(user)/editor/[documentId]/_components/blocks"
git commit -m "feat(editor): 블록 렌더러 8종 + 레지스트리"
```

---

## Task 4: 캔버스 & 블록 래퍼 (react-rnd)

**Files:**
- Create: `src/app/(user)/editor/[documentId]/_components/canvas-block.tsx`
- Create: `src/app/(user)/editor/[documentId]/_components/editor-canvas.tsx`

**Interfaces:**
- Consumes: `Block`, `EditorDoc` (Task 1), `renderBlock` (Task 3), `Rnd` (react-rnd)
- Produces:
  - `type Geometry = { x: number; y: number; w: number; h: number }`
  - `<CanvasBlock block selected onSelect(id) onGeometry(id, geo) />`
  - `<EditorCanvas doc selectedId onSelect onGeometry onAddBlock(type, pos) />` — 드롭 시 `onAddBlock`

- [ ] **Step 1: `canvas-block.tsx`** ("use client")

```tsx
"use client";

import { memo } from "react";
import { Rnd } from "react-rnd";
import type { Block } from "@/lib/editor-schema";
import { renderBlock } from "./blocks";

export type Geometry = { x: number; y: number; w: number; h: number };

type Props = {
  block: Block;
  selected: boolean;
  onSelect: (id: string) => void;
  onGeometry: (id: string, geo: Geometry) => void;
};

function CanvasBlockImpl({ block, selected, onSelect, onGeometry }: Props) {
  return (
    <Rnd
      size={{ width: block.w, height: block.h }}
      position={{ x: block.x, y: block.y }}
      bounds="parent"
      dragHandleClassName="block-drag-handle"
      onMouseDown={() => onSelect(block.id)}
      onDragStop={(_e, d) => onGeometry(block.id, { x: d.x, y: d.y, w: block.w, h: block.h })}
      onResizeStop={(_e, _dir, ref, _delta, pos) =>
        onGeometry(block.id, {
          x: pos.x,
          y: pos.y,
          w: ref.offsetWidth,
          h: ref.offsetHeight,
        })
      }
      style={{ zIndex: block.z }}
      className={selected ? "outline outline-2 outline-primary" : "outline outline-1 outline-transparent hover:outline-border"}
    >
      <div className="block-drag-handle h-full w-full cursor-move overflow-hidden bg-background">
        {renderBlock(block)}
      </div>
    </Rnd>
  );
}

export const CanvasBlock = memo(CanvasBlockImpl);
```

- [ ] **Step 2: `editor-canvas.tsx`** ("use client")

```tsx
"use client";

import { useRef } from "react";
import type { DragEvent } from "react";
import type { EditorDoc, BlockType } from "@/lib/editor-schema";
import { BLOCK_TYPES } from "@/lib/editor-schema";
import { CanvasBlock, type Geometry } from "./canvas-block";

type Props = {
  doc: EditorDoc;
  selectedId: string | null;
  onSelect: (id: string | null) => void;
  onGeometry: (id: string, geo: Geometry) => void;
  onAddBlock: (type: BlockType, pos: { x: number; y: number }) => void;
};

export function EditorCanvas({ doc, selectedId, onSelect, onGeometry, onAddBlock }: Props) {
  const ref = useRef<HTMLDivElement>(null);

  function handleDrop(e: DragEvent<HTMLDivElement>) {
    e.preventDefault();
    const type = e.dataTransfer.getData("application/x-block-type") as BlockType;
    if (!BLOCK_TYPES.includes(type)) return;
    const rect = ref.current?.getBoundingClientRect();
    const x = rect ? Math.max(0, e.clientX - rect.left) : 40;
    const y = rect ? Math.max(0, e.clientY - rect.top) : 40;
    onAddBlock(type, { x, y });
  }

  return (
    <div className="flex flex-1 justify-center overflow-auto bg-muted/40 p-8">
      <div
        ref={ref}
        onDragOver={(e) => e.preventDefault()}
        onDrop={handleDrop}
        onMouseDown={(e) => {
          if (e.target === ref.current) onSelect(null);
        }}
        className="relative shrink-0 bg-white shadow-sm ring-1 ring-border"
        style={{ width: doc.canvas.w, height: doc.canvas.h }}
      >
        {doc.blocks.map((b) => (
          <CanvasBlock
            key={b.id}
            block={b}
            selected={b.id === selectedId}
            onSelect={onSelect}
            onGeometry={onGeometry}
          />
        ))}
      </div>
    </div>
  );
}
```

- [ ] **Step 3: typecheck & lint & commit**

Run: `pnpm typecheck && pnpm lint`
Expected: 오류 없음 (react-rnd 타입 포함).
```bash
git add "src/app/(user)/editor/[documentId]/_components/canvas-block.tsx" "src/app/(user)/editor/[documentId]/_components/editor-canvas.tsx"
git commit -m "feat(editor): react-rnd 캔버스·블록 래퍼(이동/리사이즈/드롭 추가)"
```

---

## Task 5: 블록 팔레트

**Files:**
- Create: `src/app/(user)/editor/[documentId]/_components/block-palette.tsx`

**Interfaces:**
- Consumes: `BLOCK_TYPES`, `BLOCK_LABELS`, `BlockType` (Task 1)
- Produces: `<BlockPalette onAdd(type) />` — 클릭 추가 + 드래그(dataTransfer `application/x-block-type`)

- [ ] **Step 1: `block-palette.tsx`** ("use client")

```tsx
"use client";

import type { DragEvent } from "react";
import { BLOCK_TYPES, BLOCK_LABELS, type BlockType } from "@/lib/editor-schema";
import { Button } from "@/components/ui/button";

export function BlockPalette({ onAdd }: { onAdd: (type: BlockType) => void }) {
  function handleDragStart(e: DragEvent<HTMLButtonElement>, type: BlockType) {
    e.dataTransfer.setData("application/x-block-type", type);
    e.dataTransfer.effectAllowed = "copy";
  }

  return (
    <aside className="w-44 shrink-0 border-r bg-background p-3">
      <p className="mb-2 px-1 text-xs font-medium text-muted-foreground">블록 추가</p>
      <div className="flex flex-col gap-1.5">
        {BLOCK_TYPES.map((type) => (
          <Button
            key={type}
            variant="outline"
            size="sm"
            draggable
            onDragStart={(e) => handleDragStart(e, type)}
            onClick={() => onAdd(type)}
            className="justify-start"
          >
            {BLOCK_LABELS[type]}
          </Button>
        ))}
      </div>
      <p className="mt-3 px-1 text-[11px] leading-relaxed text-muted-foreground">
        캔버스로 끌어다 놓거나 클릭하면 추가됩니다.
      </p>
    </aside>
  );
}
```

- [ ] **Step 2: typecheck & lint & commit**

Run: `pnpm typecheck && pnpm lint`
Expected: 오류 없음.
```bash
git add "src/app/(user)/editor/[documentId]/_components/block-palette.tsx"
git commit -m "feat(editor): 블록 팔레트(드래그/클릭 추가)"
```

---

## Task 6: 블록 인스펙터

선택된 블록의 위치/크기/고정여부와 type별 내용 폼을 편집한다.

**Files:**
- Create: `src/app/(user)/editor/[documentId]/_components/block-inspector.tsx`

**Interfaces:**
- Consumes: `Block`, `BlockPropsMap`, `ItemRow`, `MetaField` (Task 1); UI: `input`, `label`, `textarea`, `switch`, `button`, `select`
- Produces: `<BlockInspector block onChange(patch: Partial<Block>) onChangeProps(propsPatch) onRemove(id) />`

- [ ] **Step 1: `block-inspector.tsx`** ("use client")

```tsx
"use client";

import type { Block, BlockPropsMap, ItemRow } from "@/lib/editor-schema";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { Trash2, Plus } from "lucide-react";

type Props = {
  block: Block | null;
  onChange: (patch: Partial<Block>) => void;
  onChangeProps: (propsPatch: Record<string, unknown>) => void;
  onRemove: (id: string) => void;
};

function uid() {
  return typeof crypto !== "undefined" && "randomUUID" in crypto
    ? crypto.randomUUID()
    : `id-${Math.random().toString(36).slice(2)}`;
}

export function BlockInspector({ block, onChange, onChangeProps, onRemove }: Props) {
  if (!block) {
    return (
      <aside className="w-72 shrink-0 border-l bg-background p-4">
        <p className="text-sm text-muted-foreground">블록을 선택하면 여기에서 편집합니다.</p>
      </aside>
    );
  }

  return (
    <aside className="w-72 shrink-0 space-y-4 overflow-auto border-l bg-background p-4">
      <div className="flex items-center justify-between">
        <p className="text-sm font-medium">블록 속성</p>
        <Button variant="ghost" size="icon" onClick={() => onRemove(block.id)} aria-label="블록 삭제">
          <Trash2 className="size-4" />
        </Button>
      </div>

      {/* 위치·크기 */}
      <div className="grid grid-cols-2 gap-2">
        {(["x", "y", "w", "h"] as const).map((k) => (
          <div key={k}>
            <Label className="text-xs uppercase text-muted-foreground">{k}</Label>
            <Input
              type="number"
              value={block[k]}
              onChange={(e) => onChange({ [k]: Number(e.target.value) || 0 })}
            />
          </div>
        ))}
      </div>

      {/* 고정 여부 */}
      <div className="flex items-center justify-between">
        <Label htmlFor="locked" className="text-sm">내용 고정(잠금)</Label>
        <Switch
          id="locked"
          checked={block.locked}
          onCheckedChange={(v) => onChange({ locked: v })}
        />
      </div>

      {!block.locked ? <ContentForm block={block} onChangeProps={onChangeProps} uid={uid} /> : (
        <p className="text-xs text-muted-foreground">잠금 상태입니다. 해제하면 내용을 편집할 수 있습니다.</p>
      )}
    </aside>
  );
}

function ContentForm({
  block,
  onChangeProps,
  uid,
}: {
  block: Block;
  onChangeProps: (p: Record<string, unknown>) => void;
  uid: () => string;
}) {
  switch (block.type) {
    case "title":
    case "text": {
      const p = block.props as BlockPropsMap["text"];
      return (
        <div className="space-y-2">
          <Label className="text-xs">텍스트</Label>
          <Textarea value={p.text} onChange={(e) => onChangeProps({ text: e.target.value })} />
          <Label className="text-xs">글자 크기</Label>
          <Input
            type="number"
            value={p.fontSize}
            onChange={(e) => onChangeProps({ fontSize: Number(e.target.value) || 12 })}
          />
        </div>
      );
    }
    case "supplier": {
      const p = block.props as BlockPropsMap["supplier"];
      const fields: [keyof BlockPropsMap["supplier"], string][] = [
        ["companyName", "상호"],
        ["ceo", "대표자"],
        ["regNo", "등록번호"],
        ["address", "주소"],
        ["tel", "전화"],
        ["fax", "팩스"],
        ["email", "이메일"],
        ["manager", "담당자"],
      ];
      return (
        <div className="space-y-2">
          {fields.map(([key, label]) => (
            <div key={key}>
              <Label className="text-xs">{label}</Label>
              <Input value={p[key]} onChange={(e) => onChangeProps({ [key]: e.target.value })} />
            </div>
          ))}
        </div>
      );
    }
    case "clientMeta": {
      const p = block.props as BlockPropsMap["clientMeta"];
      return (
        <div className="space-y-2">
          {p.fields.map((f, i) => (
            <div key={i} className="grid grid-cols-[1fr_1fr] gap-1">
              <Input
                value={f.label}
                onChange={(e) => {
                  const next = p.fields.map((x, xi) => (xi === i ? { ...x, label: e.target.value } : x));
                  onChangeProps({ fields: next });
                }}
              />
              <Input
                value={f.value}
                onChange={(e) => {
                  const next = p.fields.map((x, xi) => (xi === i ? { ...x, value: e.target.value } : x));
                  onChangeProps({ fields: next });
                }}
              />
            </div>
          ))}
          <Button
            variant="outline"
            size="sm"
            onClick={() => onChangeProps({ fields: [...p.fields, { label: "항목", value: "" }] })}
          >
            <Plus className="size-4" /> 항목 추가
          </Button>
        </div>
      );
    }
    case "itemTable": {
      const p = block.props as BlockPropsMap["itemTable"];
      const update = (rows: ItemRow[]) => onChangeProps({ rows });
      return (
        <div className="space-y-2">
          {p.rows.map((r, i) => (
            <div key={r.id} className="space-y-1 rounded border p-2">
              <Input
                placeholder="품목명"
                value={r.name}
                onChange={(e) => update(p.rows.map((x, xi) => (xi === i ? { ...x, name: e.target.value } : x)))}
              />
              <Input
                placeholder="설명"
                value={r.description}
                onChange={(e) => update(p.rows.map((x, xi) => (xi === i ? { ...x, description: e.target.value } : x)))}
              />
              <div className="grid grid-cols-2 gap-1">
                <Input
                  type="number"
                  placeholder="수량"
                  value={r.quantity}
                  onChange={(e) => update(p.rows.map((x, xi) => (xi === i ? { ...x, quantity: Number(e.target.value) || 0 } : x)))}
                />
                <Input
                  type="number"
                  placeholder="단가"
                  value={r.unitPrice}
                  onChange={(e) => update(p.rows.map((x, xi) => (xi === i ? { ...x, unitPrice: Number(e.target.value) || 0 } : x)))}
                />
              </div>
              <Button
                variant="ghost"
                size="sm"
                onClick={() => update(p.rows.filter((_, xi) => xi !== i))}
              >
                <Trash2 className="size-4" /> 행 삭제
              </Button>
            </div>
          ))}
          <Button
            variant="outline"
            size="sm"
            onClick={() =>
              update([...p.rows, { id: uid(), name: "", description: "", quantity: 1, unitPrice: 0 }])
            }
          >
            <Plus className="size-4" /> 항목 추가
          </Button>
        </div>
      );
    }
    case "image": {
      const p = block.props as BlockPropsMap["image"];
      return (
        <div className="space-y-2">
          <Label className="text-xs">이미지 업로드</Label>
          <Input
            type="file"
            accept="image/*"
            onChange={(e) => {
              const file = e.target.files?.[0];
              if (!file) return;
              const reader = new FileReader();
              reader.onload = () => onChangeProps({ dataUrl: String(reader.result) });
              reader.readAsDataURL(file);
            }}
          />
          <Label className="text-xs">대체 텍스트</Label>
          <Input value={p.alt} onChange={(e) => onChangeProps({ alt: e.target.value })} />
        </div>
      );
    }
    case "table": {
      const p = block.props as BlockPropsMap["table"];
      return (
        <div className="space-y-2">
          <Label className="text-xs">셀 내용(행=줄, 열=탭)</Label>
          <Textarea
            rows={6}
            value={p.cells.map((r) => r.join("\t")).join("\n")}
            onChange={(e) =>
              onChangeProps({ cells: e.target.value.split("\n").map((line) => line.split("\t")) })
            }
          />
        </div>
      );
    }
    case "divider":
      return <p className="text-xs text-muted-foreground">구분선은 추가 설정이 없습니다.</p>;
    default:
      return null;
  }
}
```

- [ ] **Step 2: typecheck & lint & commit**

Run: `pnpm typecheck && pnpm lint`
Expected: 오류 없음.
```bash
git add "src/app/(user)/editor/[documentId]/_components/block-inspector.tsx"
git commit -m "feat(editor): 블록 인스펙터(위치/크기/고정/type별 내용 폼)"
```

---

## Task 7: 최상위 에디터 + 툴바 + 페이지 배선 + 기존 에디터 삭제

**Files:**
- Create: `src/app/(user)/editor/[documentId]/_components/editor-toolbar.tsx`
- Create: `src/app/(user)/editor/[documentId]/_components/document-editor.tsx`
- Modify: `src/app/(user)/editor/[documentId]/page.tsx`
- Delete: `src/app/(user)/editor/[documentId]/_components/editor-client.tsx`

**Interfaces:**
- Consumes: `EditorDoc`, `Block`, `BlockType`, `createBlock`, `computeAmount` (Task 1); `EditorCanvas`+`Geometry` (Task 4); `BlockPalette` (Task 5); `BlockInspector` (Task 6); `seedTemplate`/`parseContentJson` (Task 1, page 에서)
- Produces: `<DocumentEditor documentId initialDoc initialTitle />` (client); `page.tsx` 가 초기 `EditorDoc` 을 시드/파싱해 전달

- [ ] **Step 1: `editor-toolbar.tsx`** ("use client")

```tsx
"use client";

import Link from "next/link";
import { Send, Save } from "lucide-react";
import { Button } from "@/components/ui/button";

type Props = {
  documentId: string;
  dirty: boolean;
  saving: boolean;
  onSave: () => void;
};

export function EditorToolbar({ documentId, dirty, saving, onSave }: Props) {
  return (
    <div className="flex items-center gap-2">
      {dirty ? <span className="text-xs text-muted-foreground">저장되지 않은 변경사항</span> : null}
      <Button onClick={onSave} disabled={saving || !dirty}>
        <Save className="size-4" />
        {saving ? "저장 중…" : "저장"}
      </Button>
      <Button asChild variant="outline">
        <Link href={`/sender/${documentId}`}>
          <Send className="size-4" />
          발송하기
        </Link>
      </Button>
    </div>
  );
}
```

- [ ] **Step 2: `document-editor.tsx`** ("use client")

```tsx
"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import type { Block, BlockType, EditorDoc } from "@/lib/editor-schema";
import { createBlock } from "@/lib/editor-schema";
import { EditorCanvas, type Geometry } from "./editor-canvas";
import { BlockPalette } from "./block-palette";
import { BlockInspector } from "./block-inspector";
import { EditorToolbar } from "./editor-toolbar";

type Props = {
  documentId: string;
  initialDoc: EditorDoc;
};

export function DocumentEditor({ documentId, initialDoc }: Props) {
  const [doc, setDoc] = useState<EditorDoc>(initialDoc);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [dirty, setDirty] = useState(false);
  const [saving, setSaving] = useState(false);

  const selectedBlock = useMemo(
    () => doc.blocks.find((b) => b.id === selectedId) ?? null,
    [doc.blocks, selectedId],
  );

  const markDirty = () => setDirty(true);

  const handleAdd = useCallback((type: BlockType, pos?: { x: number; y: number }) => {
    const block = createBlock(type, pos);
    setDoc((d) => ({ ...d, blocks: [...d.blocks, block] }));
    setSelectedId(block.id);
    markDirty();
  }, []);

  const handleGeometry = useCallback((id: string, geo: Geometry) => {
    setDoc((d) => ({
      ...d,
      blocks: d.blocks.map((b) => (b.id === id ? { ...b, ...geo } : b)),
    }));
    markDirty();
  }, []);

  const handleChangeBlock = useCallback((patch: Partial<Block>) => {
    if (!selectedId) return;
    setDoc((d) => ({
      ...d,
      blocks: d.blocks.map((b) => (b.id === selectedId ? { ...b, ...patch } : b)),
    }));
    markDirty();
  }, [selectedId]);

  const handleChangeProps = useCallback((propsPatch: Record<string, unknown>) => {
    if (!selectedId) return;
    setDoc((d) => ({
      ...d,
      blocks: d.blocks.map((b) =>
        b.id === selectedId ? { ...b, props: { ...b.props, ...propsPatch } } : b,
      ),
    }));
    markDirty();
  }, [selectedId]);

  const handleRemove = useCallback((id: string) => {
    setDoc((d) => ({ ...d, blocks: d.blocks.filter((b) => b.id !== id) }));
    setSelectedId(null);
    markDirty();
  }, []);

  async function handleSave() {
    setSaving(true);
    try {
      const res = await fetch(`/api/documents/${documentId}`, {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ contentJson: JSON.stringify(doc) }),
      });
      if (!res.ok) throw new Error("save failed");
      setDirty(false);
      toast.success("저장되었습니다.");
    } catch {
      toast.error("저장에 실패했습니다. 다시 시도해주세요.");
    } finally {
      setSaving(false);
    }
  }

  // 미저장 이탈 경고 (정책 STATE_)
  useEffect(() => {
    function onBeforeUnload(e: BeforeUnloadEvent) {
      if (!dirty) return;
      e.preventDefault();
      e.returnValue = "";
    }
    window.addEventListener("beforeunload", onBeforeUnload);
    return () => window.removeEventListener("beforeunload", onBeforeUnload);
  }, [dirty]);

  return (
    <div className="flex flex-1 overflow-hidden">
      <BlockPalette onAdd={(type) => handleAdd(type)} />
      <div className="flex flex-1 flex-col overflow-hidden">
        <div className="flex items-center justify-end border-b bg-background px-4 py-2">
          <EditorToolbar documentId={documentId} dirty={dirty} saving={saving} onSave={handleSave} />
        </div>
        <EditorCanvas
          doc={doc}
          selectedId={selectedId}
          onSelect={setSelectedId}
          onGeometry={handleGeometry}
          onAddBlock={handleAdd}
        />
      </div>
      <BlockInspector
        block={selectedBlock}
        onChange={handleChangeBlock}
        onChangeProps={handleChangeProps}
        onRemove={handleRemove}
      />
    </div>
  );
}
```

- [ ] **Step 3: `page.tsx` 교체**

```tsx
import { notFound } from "next/navigation";
import { prisma } from "@/lib/db";
import { getCurrentOrg } from "@/lib/session";
import { PageHeader } from "@/components/page-header";
import { StatusBadge } from "@/components/status-badge";
import { parseContentJson, seedTemplate } from "@/lib/editor-schema";
import { DocumentEditor } from "./_components/document-editor";

export default async function EditorPage({
  params,
}: {
  params: Promise<{ documentId: string }>;
}) {
  const { documentId } = await params;

  const [document, org] = await Promise.all([
    prisma.document.findUnique({
      where: { id: documentId },
      include: { items: { orderBy: { sortOrder: "asc" } } },
    }),
    getCurrentOrg(),
  ]);

  if (!document) notFound();

  const branding = await prisma.branding.findUnique({ where: { orgId: org.id } });

  const initialDoc =
    parseContentJson(document.contentJson) ??
    seedTemplate({
      title: document.title,
      clientName: document.clientName,
      supplierName: branding?.companyName ?? org.name,
      items: document.items,
    });

  return (
    <>
      <PageHeader title={document.title} actions={<StatusBadge status={document.status} />} />
      <DocumentEditor documentId={document.id} initialDoc={initialDoc} />
    </>
  );
}
```

- [ ] **Step 4: 기존 에디터 삭제**

Run:
```bash
git rm "src/app/(user)/editor/[documentId]/_components/editor-client.tsx"
```

- [ ] **Step 5: typecheck & lint & build**

Run: `pnpm typecheck && pnpm lint && pnpm build`
Expected: 오류 없음, 빌드 성공.

- [ ] **Step 6: Commit**

```bash
git add "src/app/(user)/editor/[documentId]"
git commit -m "feat(editor): 블록 캔버스 에디터 배선(툴바·상태·저장·이탈경고)

- DocumentEditor client 아일랜드로 팔레트/캔버스/인스펙터 통합
- page.tsx: contentJson 파싱 또는 기존 아이템으로 기본 템플릿 시드
- 기존 editor-client.tsx 폼 에디터 제거"
```

---

## Task 8: 문서 갱신 + 최종 검증

**Files:**
- Modify: `docs/SPEC.md` (에디터 행)
- Modify: `AGENTS.md` (에디터 언급 있으면)

- [ ] **Step 1: `docs/SPEC.md` 에디터 행 갱신**

`| 웹 문서 에디터 | \`/editor/:documentId\` | 라인아이템 편집 |` 를 다음으로 교체:
```
| 웹 문서 에디터 | `/editor/:documentId` | 블록 캔버스 에디터(2D 배치·contentJson 저장) |
```

- [ ] **Step 2: `AGENTS.md` 확인·갱신**

Run: `grep -n "라인아이템\|에디터" AGENTS.md`
에디터를 "라인아이템 편집"으로 설명하는 문장이 있으면 "블록 캔버스 에디터(드래그·리사이즈·contentJson 저장)"로 갱신. 없으면 변경 없음.

- [ ] **Step 3: 앱 수동 확인 (성공 기준 검증)**

Run: `pnpm dev` → 브라우저에서 `/library` → 문서 하나 "편집" 진입 후 확인:
1. 좌 팔레트에서 블록을 캔버스로 드래그/클릭 추가 → 추가됨.
2. 캔버스 블록 드래그 이동, 모서리 리사이즈 동작.
3. 블록 선택 → 우 인스펙터에서 내용·위치·크기·고정 편집 반영.
4. 품목 표 행 편집 시 합계 자동 갱신.
5. 저장 → 새로고침 후 배치·내용 유지(contentJson 저장 확인).
6. 기존 문서 최초 진입 시 기본 템플릿 + 기존 품목이 품목표로 시드됨.

- [ ] **Step 4: react-doctor**

Run: `pnpm doctor`
Expected: 새 error 없음(기존 warning 은 허용).

- [ ] **Step 5: Commit**

```bash
git add docs/SPEC.md AGENTS.md
git commit -m "docs: 에디터 기획서 정합성 갱신(블록 캔버스 에디터)"
```

---

## Self-Review 결과 (작성자 체크)

- **스펙 커버리지:** 3-패널(팔레트 T5·캔버스 T4·인스펙터 T6·툴바 T7) ✓ / 도메인+범용 블록 8종(T3) ✓ / contentJson 저장·서버 amount 재계산(T2·T7) ✓ / 기본 템플릿 시드+기존 아이템 이관(T1·T7) ✓ / locked(T1·T6) ✓ / 이탈경고·정책(T7) ✓ / 문서·의존성 갱신(T1·T8) ✓ / react-rnd(T1·T4) ✓.
- **플레이스홀더:** 모든 코드 스텝에 실제 코드 포함, TBD/TODO 없음.
- **타입 정합성:** `Geometry`(T4)·`renderBlock`(T3)·`createBlock`/`computeAmount`/`parseContentJson`/`seedTemplate`(T1)·`onChangeProps` 시그니처가 T6·T7에서 일치.
- **범위:** 단일 에디터 화면 — 단일 계획으로 적정.
- **주의:** 이 저장소엔 테스트 러너가 없어 순수 로직만 tsx assert(T1)로 검증, UI는 typecheck/lint/build + 수동 확인으로 검증(Global Constraints 명시).
