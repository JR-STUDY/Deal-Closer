/**
 * AI 부분 재작성(F-215)의 응답 스펙과 적용 로직.
 *
 * 전체 문서를 다시 생성하면 사용자가 손으로 고친 부분이 날아간다. 그래서
 * "어떤 블록의 무엇을 어떻게 바꿀지"만 받아서 기존 문서에 덮어쓴다.
 *
 * (서버·클라이언트 공용 순수 모듈)
 */

import { uid, type Block, type BlockPropsMap, type EditorDoc } from "@/lib/editor-schema";
import {
  itemTableHeight,
  labelMatches,
  type SpecItem,
  type SpecSummaryRow,
} from "./doc-spec";

export type TextEdit = { blockId: string; text: string };
export type FieldEdit = { blockId: string; label: string; value: string };
export type ItemTableEdit = {
  blockId: string;
  mode: "keep" | "replace";
  rows: SpecItem[];
  summaryRows: SpecSummaryRow[];
};

export type RevisionSpec = {
  summary: string;
  textEdits: TextEdit[];
  fieldEdits: FieldEdit[];
  itemTable: ItemTableEdit;
};

// ======================= JSON Schema =======================

export const REVISION_SPEC_SCHEMA: Record<string, unknown> = {
  type: "object",
  additionalProperties: false,
  required: ["summary", "textEdits", "fieldEdits", "itemTable"],
  properties: {
    summary: {
      type: "string",
      description: "무엇을 어떻게 바꿨는지 한 문장 (한국어 존댓말). 바꾼 것이 없으면 그 이유",
    },
    textEdits: {
      type: "array",
      description: "대제목·텍스트 블록의 전체 텍스트 교체 목록. 수정할 블록만 담는다",
      items: {
        type: "object",
        additionalProperties: false,
        required: ["blockId", "text"],
        properties: {
          blockId: { type: "string", description: "수정할 블록 id (목록에 있는 값만)" },
          text: { type: "string", description: "그 블록의 새 전체 텍스트" },
        },
      },
    },
    fieldEdits: {
      type: "array",
      description: "공급자·거래처 메타 블록의 개별 필드 값 교체 목록",
      items: {
        type: "object",
        additionalProperties: false,
        required: ["blockId", "label", "value"],
        properties: {
          blockId: { type: "string", description: "수정할 블록 id (목록에 있는 값만)" },
          label: { type: "string", description: "필드 라벨 (목록에 있는 라벨 그대로)" },
          value: { type: "string", description: "필드의 새 값" },
        },
      },
    },
    itemTable: {
      type: "object",
      additionalProperties: false,
      required: ["blockId", "mode", "rows", "summaryRows"],
      description: "품목표 변경. 품목·금액을 바꾸는 지시가 아니면 mode=keep 이고 배열은 비운다",
      properties: {
        blockId: {
          type: "string",
          description: "수정할 품목표 블록 id. 지정하지 않으면 빈 문자열",
        },
        mode: {
          type: "string",
          enum: ["keep", "replace"],
          description: "keep=품목표 유지 / replace=rows 로 전체 교체",
        },
        rows: {
          type: "array",
          description: "mode=replace 일 때의 변경 후 품목 전체",
          items: {
            type: "object",
            additionalProperties: false,
            required: ["name", "description", "quantity", "unitPrice"],
            properties: {
              name: { type: "string" },
              description: { type: "string" },
              quantity: { type: "integer" },
              unitPrice: { type: "integer", description: "원(KRW) 단위 정수" },
            },
          },
        },
        summaryRows: {
          type: "array",
          description: "mode=replace 일 때의 금액 요약행. 유지하려면 빈 배열",
          items: {
            type: "object",
            additionalProperties: false,
            required: ["label", "formula"],
            properties: {
              label: { type: "string" },
              formula: {
                type: "string",
                description: "변수 subtotal 과 + - * / ( ) 만 사용",
              },
            },
          },
        },
      },
    },
  },
};

// ========================= 파싱·검증 =========================

function str(value: unknown, max: number): string {
  return typeof value === "string" ? value.trim().slice(0, max) : "";
}

function int(value: unknown, fallback: number): number {
  const n = Math.trunc(Number(value));
  return Number.isFinite(n) && n >= 0 ? n : fallback;
}

function arr(value: unknown): unknown[] {
  return Array.isArray(value) ? value : [];
}

export function parseRevisionSpec(raw: unknown): RevisionSpec {
  const o = (typeof raw === "object" && raw !== null ? raw : {}) as Record<string, unknown>;
  const table = (
    typeof o.itemTable === "object" && o.itemTable !== null ? o.itemTable : {}
  ) as Record<string, unknown>;

  return {
    summary: str(o.summary, 500),
    textEdits: arr(o.textEdits)
      .slice(0, 40)
      .map((raw) => {
        const e = raw as Record<string, unknown>;
        return { blockId: str(e?.blockId, 80), text: str(e?.text, 6_000) };
      })
      .filter((e) => e.blockId.length > 0),
    fieldEdits: arr(o.fieldEdits)
      .slice(0, 60)
      .map((raw) => {
        const e = raw as Record<string, unknown>;
        return {
          blockId: str(e?.blockId, 80),
          label: str(e?.label, 40),
          value: str(e?.value, 300),
        };
      })
      .filter((e) => e.blockId.length > 0 && e.label.length > 0),
    itemTable: {
      blockId: str(table.blockId, 80),
      mode: table.mode === "replace" ? "replace" : "keep",
      rows: arr(table.rows)
        .slice(0, 200)
        .map((raw) => {
          const r = raw as Record<string, unknown>;
          return {
            name: str(r?.name, 120),
            description: str(r?.description, 300),
            quantity: Math.max(1, int(r?.quantity, 1)),
            unitPrice: int(r?.unitPrice, 0),
          };
        })
        .filter((r) => r.name.length > 0),
      summaryRows: arr(table.summaryRows)
        .slice(0, 10)
        .map((raw) => {
          const r = raw as Record<string, unknown>;
          return { label: str(r?.label, 40), formula: str(r?.formula, 200) };
        })
        .filter((r) => r.label.length > 0 && r.formula.length > 0),
    },
  };
}

// ========================== 적용 ==========================

/** 텍스트 줄 수에 맞춰 블록 높이를 늘린다 (줄이지는 않는다 — 사용자 배치 존중) */
function growTextBlock(block: Block, textValue: string): void {
  const lines = textValue.split("\n").length;
  block.h = Math.max(block.h, 22 + lines * 20);
}

/**
 * 재작성 스펙을 문서에 적용한 새 EditorDoc 을 만든다.
 * 목록에 없는 blockId·타입이 맞지 않는 수정은 조용히 무시한다(모델 실수 방어).
 * 반환값의 changed 가 false 면 실제로 바뀐 것이 없다는 뜻이다.
 */
export function applyRevision(
  doc: EditorDoc,
  spec: RevisionSpec,
): { doc: EditorDoc; changed: boolean } {
  const next = JSON.parse(JSON.stringify(doc)) as EditorDoc;
  const byId = new Map(next.blocks.map((b) => [b.id, b]));
  let changed = false;

  for (const edit of spec.textEdits) {
    const block = byId.get(edit.blockId);
    if (!block || (block.type !== "text" && block.type !== "title")) continue;
    const props = block.props as BlockPropsMap["text"];
    if (props.text === edit.text) continue;
    props.text = edit.text;
    growTextBlock(block, edit.text);
    changed = true;
  }

  for (const edit of spec.fieldEdits) {
    const block = byId.get(edit.blockId);
    if (!block || (block.type !== "supplier" && block.type !== "clientMeta")) continue;
    const props = block.props as BlockPropsMap["clientMeta"];
    if (!Array.isArray(props.fields)) continue;
    const target = props.fields.find((f) => labelMatches(f.label ?? "", edit.label));
    if (target) {
      if (target.value === edit.value) continue;
      target.value = edit.value;
    } else {
      props.fields = [
        ...props.fields,
        { id: uid(), label: edit.label, value: edit.value },
      ];
      block.h += 22;
    }
    changed = true;
  }

  if (spec.itemTable.mode === "replace" && spec.itemTable.rows.length > 0) {
    const target =
      (spec.itemTable.blockId ? byId.get(spec.itemTable.blockId) : undefined) ??
      next.blocks.find((b) => b.type === "itemTable");
    if (target?.type === "itemTable") {
      const props = target.props as BlockPropsMap["itemTable"];
      props.rows = spec.itemTable.rows.map((r) => ({
        id: uid(),
        name: r.name,
        description: r.description,
        quantity: r.quantity,
        unitPrice: r.unitPrice,
      }));
      if (spec.itemTable.summaryRows.length > 0) {
        props.summaryRows = spec.itemTable.summaryRows.map((r) => ({
          id: uid(),
          label: r.label,
          formula: r.formula,
        }));
      }
      target.h = itemTableHeight(props.rows.length, (props.summaryRows ?? []).length);
      changed = true;
    }
  }

  return { doc: next, changed };
}
