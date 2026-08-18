"use client";

import { useCallback, useRef } from "react";
import { toast } from "sonner";
import {
  createBlock,
  pageCount,
  reorderZ,
  reorderZMany,
  uid,
  type AnyBlockProps,
  type Block,
  type BlockType,
  type EditorDoc,
  type ZOrderAction,
} from "@/lib/editor-schema";
import {
  alignBlocks,
  distributeBlocks,
  translateBlocks,
  type AlignMode,
  type DistributeAxis,
} from "@/lib/block-align";
import type { Geometry } from "./canvas-block";
import type { DocTemplate } from "./template-store";
import type { DocUpdater, SetDocOptions } from "./use-doc-history";

/**
 * 블록 편집 동작 모음 — 추가·이동·속성 변경·삭제·겹침 순서·페이지·템플릿.
 *
 * 문서를 바꾸는 경로는 모두 호출측이 넘겨준 `editDoc` 하나를 지난다(잠금 판정 + 미저장 표시).
 * 여기서는 **무엇을 어떻게 바꿀지**만 정하고 잠금 여부를 다시 판단하지 않는다.
 *
 * `coalesceKey` 를 어디에 붙이는지가 되돌리기 품질을 결정한다 — 방향키 이동과 인스펙터
 * 숫자 입력은 누를 때마다 호출되므로 묶어야 ⌘Z 가 한 동작씩 되돌아간다.
 */
export function useBlockEditing(options: {
  editDoc: (updater: DocUpdater, options?: SetDocOptions) => void;
  replaceDoc: (next: EditorDoc) => void;
  locked: boolean;
  lockReason: string;
  /** 선택된 블록들 (다중선택). 속성 편집은 정확히 1개일 때만 의미가 있다 */
  selectedIds: string[];
  setSelectedIds: (ids: string[]) => void;
  setDirty: (dirty: boolean) => void;
  /** 새로 넣은 블록을 선택해 바로 고칠 수 있게 한다 (복제·붙여넣기는 여러 개다) */
  onInserted: (ids: string[]) => void;
  /** '블록 추가' 탭에서 사용자가 고쳐 둔 기본 속성 */
  baseDefaultsFor: (type: BlockType) => AnyBlockProps | undefined;
  /** 블록 삭제 toast 의 [되돌리기] */
  onUndo: () => void;
}) {
  const {
    editDoc,
    replaceDoc,
    locked,
    lockReason,
    selectedIds,
    setSelectedIds,
    setDirty,
    onInserted,
    baseDefaultsFor,
    onUndo,
  } = options;

  /** 속성 편집(인스펙터)은 한 블록을 대상으로 한다 — 여러 개면 대상이 없다 */
  const singleId = selectedIds.length === 1 ? selectedIds[0] : null;

  /** 팔레트로 블록을 추가할 때 놓을 y (현재 보이는 화면 기준) — 캔버스 스크롤에서 갱신 */
  const addYRef = useRef(40);
  const setViewTop = useCallback((y: number) => {
    addYRef.current = y;
  }, []);

  const handleAdd = useCallback(
    (type: BlockType, pos?: { x: number; y: number }) => {
      // 팔레트 클릭 추가는 지금 보이는 화면 안에 놓는다 (스크롤 밖에 생기면 못 찾는다)
      const block = createBlock(type, pos ?? { x: 40, y: addYRef.current });
      const override = baseDefaultsFor(type);
      if (override) block.props = structuredClone(override);
      editDoc((d) => ({ ...d, blocks: [...d.blocks, block] }));
      onInserted([block.id]);
    },
    [editDoc, baseDefaultsFor, onInserted],
  );

  /** 내 블록을 캔버스에 올린다 (저장된 좌표가 없으므로 기본 위치에 놓는다) */
  const handleAddCustomBlock = useCallback(
    (cb: { type: BlockType; w: number; h: number; props: Block["props"] }) => {
      const block: Block = {
        id: uid(),
        type: cb.type,
        x: 40,
        y: 40,
        w: cb.w,
        h: cb.h,
        z: 1,
        locked: false,
        props: structuredClone(cb.props),
      };
      editDoc((d) => ({ ...d, blocks: [...d.blocks, block] }));
      onInserted([block.id]);
    },
    [editDoc, onInserted],
  );

  const handleGeometry = useCallback(
    (id: string, geo: Geometry) => {
      // 방향키 이동은 누를 때마다 호출된다 — 연속 이동을 되돌리기 한 건으로 묶는다
      editDoc(
        (d) => ({
          ...d,
          blocks: d.blocks.map((b) => (b.id === id ? { ...b, ...geo } : b)),
        }),
        { coalesceKey: `move:${id}` },
      );
    },
    [editDoc],
  );

  const handleChangeBlock = useCallback(
    (patch: Partial<Block>) => {
      if (!singleId) return;
      // 인스펙터의 x·y·w·h 숫자 입력은 글자마다 호출된다 — 한 건으로 묶는다
      editDoc(
        (d) => ({
          ...d,
          blocks: d.blocks.map((b) =>
            b.id === singleId ? { ...b, ...patch } : b,
          ),
        }),
        { coalesceKey: `block:${singleId}:${Object.keys(patch).join(",")}` },
      );
    },
    [singleId, editDoc],
  );

  const handleChangeProps = useCallback(
    (propsPatch: Record<string, unknown>) => {
      if (!singleId) return;
      // 같은 속성을 이어서 고치면(텍스트 타이핑 등) 한 건, 다른 속성으로 옮기면 새 건
      editDoc(
        (d) => ({
          ...d,
          blocks: d.blocks.map((b) =>
            b.id === singleId
              ? { ...b, props: { ...b.props, ...propsPatch } }
              : b,
          ),
        }),
        {
          coalesceKey: `props:${singleId}:${Object.keys(propsPatch).join(",")}`,
        },
      );
    },
    [singleId, editDoc],
  );

  /** 캔버스 인라인 편집 결과 — 편집 세션 하나가 되돌리기 한 건이므로 묶지 않는다 */
  const handleInlineCommit = useCallback(
    (id: string, text: string) => {
      editDoc((d) => ({
        ...d,
        blocks: d.blocks.map((b) =>
          b.id === id ? { ...b, props: { ...b.props, text } } : b,
        ),
      }));
    },
    [editDoc],
  );

  /**
   * 블록을 지운다 — 몇 개든 **한 번의 `editDoc`** 이라 ⌘Z 한 번으로 전부 돌아온다.
   * 하나씩 나눠 지우면 되돌리기를 개수만큼 눌러야 한다.
   *
   * 삭제는 확인창 없이 즉시 일어나므로 **몇 개를 지웠는지 말하고** 되돌릴 길을 준다.
   * (잠긴 문서라면 editDoc 이 이미 거부 안내를 띄웠으므로 성공 문구를 겹치지 않는다)
   */
  const handleRemoveMany = useCallback(
    (ids: string[]) => {
      if (ids.length === 0) return;
      const set = new Set(ids);
      editDoc((d) => ({ ...d, blocks: d.blocks.filter((b) => !set.has(b.id)) }));
      setSelectedIds([]);
      if (!locked) {
        toast.success(
          ids.length === 1
            ? "블록을 삭제했습니다."
            : `블록 ${ids.length}개를 삭제했습니다.`,
          { action: { label: "되돌리기", onClick: onUndo } },
        );
      }
    },
    [editDoc, setSelectedIds, locked, onUndo],
  );

  /** 인스펙터의 삭제 버튼 — 대상이 한 블록으로 정해져 있다 */
  const handleRemove = useCallback(
    (id: string) => handleRemoveMany([id]),
    [handleRemoveMany],
  );

  /** 선택 블록을 서로 맞춘다 — 계산은 `@/lib/block-align` 순수 함수가 단일 기준이다 */
  const handleAlign = useCallback(
    (mode: AlignMode) => {
      editDoc((d) => ({ ...d, blocks: alignBlocks(d.blocks, selectedIds, mode) }));
    },
    [selectedIds, editDoc],
  );

  const handleDistribute = useCallback(
    (axis: DistributeAxis) => {
      editDoc((d) => ({
        ...d,
        blocks: distributeBlocks(d.blocks, selectedIds, axis),
      }));
    },
    [selectedIds, editDoc],
  );

  /**
   * 선택 블록을 함께 옮긴다 (방향키 · 그룹 드래그 확정).
   * `translateBlocks` 가 **묶음째** 캔버스 안으로 가둔다 — 각자 가두면 배치가 찌그러진다.
   */
  const handleTranslate = useCallback(
    (dx: number, dy: number, coalesceKey?: string) => {
      editDoc(
        (d) => ({
          ...d,
          // 세로 경계는 전체 페이지 높이다 (한 장이 아니라 문서 전체 길이)
          blocks: translateBlocks(d.blocks, selectedIds, dx, dy, {
            w: d.canvas.w,
            h: d.canvas.h * pageCount(d),
          }),
        }),
        coalesceKey ? { coalesceKey } : undefined,
      );
    },
    [selectedIds, editDoc],
  );

  // 겹침 순서(z) — 규칙은 editor-schema 의 reorderZ 가 단일 기준이다.
  // 여기서 직접 계산하던 예전 코드는 z 를 음수까지 내려 블록이 흰 배경 뒤로 사라졌다.
  const handleZOrder = useCallback(
    (id: string, action: ZOrderAction) => {
      editDoc((d) => ({ ...d, blocks: reorderZ(d.blocks, id, action) }));
    },
    [editDoc],
  );

  /**
   * 선택 전체의 겹침 순서. 여러 개면 `reorderZMany` 로 **묶음째** 옮긴다 —
   * id 마다 `reorderZ` 를 반복하면 선택 내부 순서가 뒤집힌다(block-align.test 참고).
   */
  const handleZOrderSelected = useCallback(
    (action: ZOrderAction) => {
      if (selectedIds.length === 0) return;
      editDoc((d) => ({ ...d, blocks: reorderZMany(d.blocks, selectedIds, action) }));
    },
    [selectedIds, editDoc],
  );

  const handleAddPage = useCallback(() => {
    editDoc((d) => ({
      ...d,
      canvas: { ...d.canvas, pages: (d.canvas.pages ?? 1) + 1 },
    }));
  }, [editDoc]);

  const handleRemovePage = useCallback(() => {
    editDoc((d) => ({
      ...d,
      canvas: { ...d.canvas, pages: Math.max(1, (d.canvas.pages ?? 1) - 1) },
    }));
  }, [editDoc]);

  /**
   * 템플릿을 불러온다 — 문서를 통째로 갈아치우므로 `editDoc` 이 아니라 `replaceDoc` 이고,
   * 되돌리기 히스토리도 새로 시작한다(이전 문서로 ⌘Z 되돌아가면 혼란스럽다).
   * 그래서 잠금 판정을 여기서 직접 한다 — editDoc 을 지나지 않는 유일한 경로다.
   */
  const handleLoadTemplate = useCallback(
    (t: DocTemplate) => {
      if (locked) {
        toast.error(lockReason);
        return;
      }
      replaceDoc({
        version: 1,
        canvas: t.canvas ?? { w: 794, h: 1123, pages: 1 },
        blocks: t.blocks.map((b) => ({ ...b, id: uid() })),
      });
      setSelectedIds([]);
      setDirty(true);
      toast.success(`템플릿 '${t.name}'을(를) 불러왔습니다.`);
    },
    [replaceDoc, locked, lockReason, setSelectedIds, setDirty],
  );

  return {
    setViewTop,
    handleAdd,
    handleAddCustomBlock,
    handleGeometry,
    handleChangeBlock,
    handleChangeProps,
    handleInlineCommit,
    handleRemove,
    handleRemoveMany,
    handleAlign,
    handleDistribute,
    handleTranslate,
    handleZOrder,
    handleZOrderSelected,
    handleAddPage,
    handleRemovePage,
    handleLoadTemplate,
  };
}
