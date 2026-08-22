import { formatKRW } from "./format";
import { parseIntInput } from "./editor-schema";
import type { Block, BlockPropsMap, MetaField } from "./editor-schema";

/**
 * 캔버스에서 고칠 수 있는 **한 칸**을 가리키는 좌표와, 그 칸을 읽고 쓰는 규칙.
 *
 * ## 왜 한곳에 모았나
 *
 * 예전에는 커밋 경로가 종류마다 따로였다 — 블록 전체(`onCommit`) · 격자 표
 * (`onCellCommit`) · 품목표(`onItemCommit`). 그래서 **표처럼 보이는데 편집만 안 되는
 * 칸**이 생겼다. 실제로 이랬다:
 *
 *  - `공급자 정보`·`거래처·견적 정보` 는 `<table>` 로 그려져 격자 표와 똑같이 보이는데
 *    더블클릭 경로가 아예 없었다 (인스펙터에서만 고칠 수 있었다)
 *  - 품목표의 **추가 열 머리글**과 **요약행 라벨**도 인스펙터에만 있었다
 *
 * 칸 종류를 늘릴 때마다 콜백을 하나 더 배선해야 했으니, 빠뜨리는 것이 기본값이었다.
 * 이제 좌표(`CellRef`)와 읽기·쓰기가 이 모듈 하나에 있고 화면은 이것만 쓴다.
 *
 * ## 어디까지 고칠 수 있나
 *
 * 기준은 하나다 — **인스펙터에서 고칠 수 있는 글자는 캔버스에서도 고칠 수 있다.**
 * 사용자가 같은 값을 두 자리에서 다르게 대할 이유가 없다. 반대로 다음은 캔버스에서도
 * 인스펙터에서도 고치지 않는다:
 *
 *  - **계산 결과** — 품목표의 금액(수량×단가)과 요약행의 값(수식). 손으로 고치게 하면
 *    근거와 어긋난 숫자가 문서에 남고, 그 숫자가 확정 문서를 통해 기회 예상 금액까지
 *    간다(기회-6).
 *  - **고정 머리글** — 품목표의 `품목 / 설명`·`수량`·`단가`·`금액`·`합계`. 이 문구는
 *    `props` 에 없다(렌더러에 박혀 있다). 고치게 하려면 스키마에 넣는 것이 먼저다.
 *
 * `editableCells()` 가 그 목록을 **열거**하므로 화면과 테스트가 같은 답을 본다.
 */

/** 고칠 수 있는 칸 하나. 종류마다 좌표가 다르므로 판별 유니온이다 */
export type CellRef =
  /** 블록 전체 (제목·텍스트) */
  | { kind: "block" }
  /** 격자 표의 칸 (행·열) */
  | { kind: "cell"; r: number; c: number }
  /** 품목표 행의 필드 — `name`·`description`·`quantity`·`unitPrice`·`extra:{colId}` */
  | { kind: "item"; row: number; field: string }
  /** 품목표 추가 열의 머리글 */
  | { kind: "itemColumn"; colId: string }
  /** 품목표 요약행의 라벨 (값은 수식 결과라 고칠 수 없다) */
  | { kind: "itemSummary"; summaryId: string }
  /** 공급자 정보·거래처 정보의 라벨/값 */
  | { kind: "metaField"; fieldId: string; part: "label" | "value" };

const EXTRA_PREFIX = "extra:";

/** 품목표 추가 열 값의 필드 이름 */
export function extraField(colId: string): string {
  return `${EXTRA_PREFIX}${colId}`;
}

function extraColId(field: string): string | null {
  return field.startsWith(EXTRA_PREFIX) ? field.slice(EXTRA_PREFIX.length) : null;
}

/** 같은 칸인지 — 편집 중인 칸을 그리는 쪽이 쓴다 */
export function sameCell(a: CellRef | null | undefined, b: CellRef | null | undefined): boolean {
  if (!a || !b || a.kind !== b.kind) return false;
  switch (a.kind) {
    case "block":
      return true;
    case "cell":
      return b.kind === "cell" && a.r === b.r && a.c === b.c;
    case "item":
      return b.kind === "item" && a.row === b.row && a.field === b.field;
    case "itemColumn":
      return b.kind === "itemColumn" && a.colId === b.colId;
    case "itemSummary":
      return b.kind === "itemSummary" && a.summaryId === b.summaryId;
    case "metaField":
      return b.kind === "metaField" && a.fieldId === b.fieldId && a.part === b.part;
  }
}

/*
 * 숫자 칸의 파싱은 `@/lib/editor-schema` 의 `parseIntInput` **한 곳**이다.
 *
 * 예전에는 이 모듈이 `value.replace(/[^\d-]/g, "")` 로 직접 걷어냈고 인스펙터는
 * `Math.trunc(Number(v))` 를 썼다. 두 규칙은 소수점에서 갈린다 — 같은 `1200000.5`
 * 를 캔버스는 `12000005`(10배!), 인스펙터는 `1200000` 으로 읽었다. 어느 자리에서
 * 고쳤는지에 따라 단가가 달라지면 그 위에 얹힌 부가세·합계·문서 금액이 전부 어긋난다.
 */

/**
 * 그 칸에 **저장된 값**. 없는 칸이면 `null`.
 *
 * 화면 표시값이 아니라 저장값이다 — 단가는 `₩1,200,000` 이 아니라 `1200000` 을 준다.
 * 편집칸에 넣을 값이 이것이고(통화기호와 싸우게 하지 않는다), 테스트가 왕복을 확인하는
 * 기준도 이것이다.
 */
export function readCell(block: Block, ref: CellRef): string | null {
  switch (ref.kind) {
    case "block": {
      if (block.type !== "title" && block.type !== "text") return null;
      return (block.props as BlockPropsMap["text"]).text ?? "";
    }
    case "cell": {
      if (block.type !== "table") return null;
      const p = block.props as BlockPropsMap["table"];
      const row = p.cells[ref.r];
      if (!row || ref.c < 0 || ref.c >= row.length) return null;
      return row[ref.c] ?? "";
    }
    case "item": {
      if (block.type !== "itemTable") return null;
      const p = block.props as BlockPropsMap["itemTable"];
      const row = p.rows[ref.row];
      if (!row) return null;
      if (ref.field === "name") return row.name ?? "";
      if (ref.field === "description") return row.description ?? "";
      if (ref.field === "quantity") return String(row.quantity ?? 0);
      if (ref.field === "unitPrice") return String(row.unitPrice ?? 0);
      const colId = extraColId(ref.field);
      // 정의되지 않은 열의 값은 고치지 않는다 — 열을 지우면 그 칸도 사라져야 한다
      if (colId && (p.extraColumns ?? []).some((c) => c.id === colId)) {
        return row.extra?.[colId] ?? "";
      }
      return null;
    }
    case "itemColumn": {
      if (block.type !== "itemTable") return null;
      const p = block.props as BlockPropsMap["itemTable"];
      const col = (p.extraColumns ?? []).find((c) => c.id === ref.colId);
      return col ? (col.label ?? "") : null;
    }
    case "itemSummary": {
      if (block.type !== "itemTable") return null;
      const p = block.props as BlockPropsMap["itemTable"];
      const row = (p.summaryRows ?? []).find((s) => s.id === ref.summaryId);
      return row ? (row.label ?? "") : null;
    }
    case "metaField": {
      const fields = metaFields(block);
      if (!fields) return null;
      const field = fields.find((f) => f.id === ref.fieldId);
      if (!field) return null;
      return (ref.part === "label" ? field.label : field.value) ?? "";
    }
  }
}

/**
 * 화면에 **보이는** 값. 대부분 저장값과 같고 금액 칸만 다르다.
 * 표시와 편집을 가르는 곳이 한군데뿐이어야 `₩` 가 값에 섞여 저장되지 않는다.
 */
export function displayCell(block: Block, ref: CellRef): string | null {
  const raw = readCell(block, ref);
  if (raw === null) return null;
  if (ref.kind === "item" && ref.field === "unitPrice") return formatKRW(Number(raw) || 0);
  return raw;
}

/** 공급자·거래처 블록의 필드 목록 (둘은 같은 모양이다) */
function metaFields(block: Block): MetaField[] | null {
  if (block.type !== "supplier" && block.type !== "clientMeta") return null;
  const p = block.props as BlockPropsMap["clientMeta"];
  return Array.isArray(p.fields) ? p.fields : [];
}

/**
 * 칸에 글자를 쓴 **새 블록**. 고칠 수 없는 칸이면 원본을 그대로 돌려준다
 * (호출측이 종류를 다시 판단하지 않아도 되게 — 판단은 여기 한곳이다).
 */
export function writeCell(block: Block, ref: CellRef, text: string): Block {
  // 없는 칸에 쓰려는 요청은 조용히 버린다. 여기서 걸러야 화면이 검사를 중복하지 않는다
  if (readCell(block, ref) === null) return block;

  switch (ref.kind) {
    case "block": {
      return { ...block, props: { ...block.props, text } };
    }
    case "cell": {
      const p = block.props as BlockPropsMap["table"];
      const cells = p.cells.map((row, ri) =>
        ri === ref.r ? row.map((cell, ci) => (ci === ref.c ? text : cell)) : row,
      );
      return { ...block, props: { ...p, cells } };
    }
    case "item": {
      const p = block.props as BlockPropsMap["itemTable"];
      const rows = p.rows.map((row, ri) => {
        if (ri !== ref.row) return row;
        if (ref.field === "name") return { ...row, name: text };
        if (ref.field === "description") return { ...row, description: text };
        // 수량·단가는 숫자다 — 문자열로 저장하면 합계 계산이 NaN 이 된다.
        // 키를 계산식(`[ref.field]`)으로 쓰지 않는다 — 오타가 타입 검사를 통과해 버린다
        if (ref.field === "quantity") return { ...row, quantity: parseIntInput(text) };
        if (ref.field === "unitPrice") return { ...row, unitPrice: parseIntInput(text) };
        const colId = extraColId(ref.field);
        return colId
          ? { ...row, extra: { ...(row.extra ?? {}), [colId]: text } }
          : row;
      });
      return { ...block, props: { ...p, rows } };
    }
    case "itemColumn": {
      const p = block.props as BlockPropsMap["itemTable"];
      const extraColumns = (p.extraColumns ?? []).map((c) =>
        c.id === ref.colId ? { ...c, label: text } : c,
      );
      return { ...block, props: { ...p, extraColumns } };
    }
    case "itemSummary": {
      const p = block.props as BlockPropsMap["itemTable"];
      const summaryRows = (p.summaryRows ?? []).map((s) =>
        s.id === ref.summaryId ? { ...s, label: text } : s,
      );
      return { ...block, props: { ...p, summaryRows } };
    }
    case "metaField": {
      const p = block.props as BlockPropsMap["clientMeta"];
      const fields = (Array.isArray(p.fields) ? p.fields : []).map((f) => {
        if (f.id !== ref.fieldId) return f;
        return ref.part === "label" ? { ...f, label: text } : { ...f, value: text };
      });
      return { ...block, props: { ...p, fields } };
    }
  }
}

/**
 * 이 블록에서 고칠 수 있는 칸 **전부** (그리는 순서대로).
 *
 * 화면이 이 목록을 직접 그리지는 않는다 — 블록마다 배치가 다르기 때문이다. 대신
 * ① "이 블록은 칸 편집이 되는가" 를 판단하고 ② 테스트가 **인스펙터에서 고칠 수 있는
 * 것이 모두 여기 있는지** 확인하는 데 쓴다. 화면에 새 칸을 그리면서 이 목록에 넣지
 * 않으면 테스트가 잡는다.
 */
export function editableCells(block: Block): CellRef[] {
  switch (block.type) {
    case "title":
    case "text":
      return [{ kind: "block" }];
    case "table": {
      const p = block.props as BlockPropsMap["table"];
      const refs: CellRef[] = [];
      p.cells.forEach((row, r) =>
        row.forEach((_, c) => refs.push({ kind: "cell", r, c })),
      );
      return refs;
    }
    case "itemTable": {
      const p = block.props as BlockPropsMap["itemTable"];
      const cols = p.extraColumns ?? [];
      const refs: CellRef[] = [];
      // 머리글(추가 열) → 각 행의 필드 → 요약행 라벨. 고정 머리글·금액·요약값은 없다
      cols.forEach((c) => refs.push({ kind: "itemColumn", colId: c.id }));
      p.rows.forEach((_, row) => {
        refs.push({ kind: "item", row, field: "name" });
        refs.push({ kind: "item", row, field: "description" });
        cols.forEach((c) => refs.push({ kind: "item", row, field: extraField(c.id) }));
        refs.push({ kind: "item", row, field: "quantity" });
        refs.push({ kind: "item", row, field: "unitPrice" });
      });
      (p.summaryRows ?? []).forEach((s) =>
        refs.push({ kind: "itemSummary", summaryId: s.id }),
      );
      return refs;
    }
    case "supplier":
    case "clientMeta": {
      const fields = metaFields(block) ?? [];
      return fields.flatMap((f): CellRef[] => [
        { kind: "metaField", fieldId: f.id, part: "label" },
        { kind: "metaField", fieldId: f.id, part: "value" },
      ]);
    }
    // 이미지·구분선은 글자가 없다 (인스펙터의 속성으로만 다룬다)
    default:
      return [];
  }
}

/** 블록 **전체**를 더블클릭으로 고치는 종류 (표·정보 블록은 칸 단위다) */
export function isWholeBlockEditable(block: Block): boolean {
  return block.type === "title" || block.type === "text";
}

/** 칸 단위로 고치는 블록 */
export function hasEditableCells(block: Block): boolean {
  return !isWholeBlockEditable(block) && editableCells(block).length > 0;
}
