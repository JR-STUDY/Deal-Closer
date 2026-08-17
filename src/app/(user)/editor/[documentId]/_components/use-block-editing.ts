"use client";

import { useCallback, useRef } from "react";
import { toast } from "sonner";
import {
  createBlock,
  reorderZ,
  uid,
  type AnyBlockProps,
  type Block,
  type BlockType,
  type EditorDoc,
  type ZOrderAction,
} from "@/lib/editor-schema";
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
  selectedId: string | null;
  setSelectedId: (id: string | null) => void;
  setDirty: (dirty: boolean) => void;
  /** 새로 넣은 블록을 선택해 바로 고칠 수 있게 한다 */
  onInserted: (id: string) => void;
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
    selectedId,
    setSelectedId,
    setDirty,
    onInserted,
    baseDefaultsFor,
    onUndo,
  } = options;

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
      onInserted(block.id);
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
      onInserted(block.id);
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
      if (!selectedId) return;
      // 인스펙터의 x·y·w·h 숫자 입력은 글자마다 호출된다 — 한 건으로 묶는다
      editDoc(
        (d) => ({
          ...d,
          blocks: d.blocks.map((b) =>
            b.id === selectedId ? { ...b, ...patch } : b,
          ),
        }),
        { coalesceKey: `block:${selectedId}:${Object.keys(patch).join(",")}` },
      );
    },
    [selectedId, editDoc],
  );

  const handleChangeProps = useCallback(
    (propsPatch: Record<string, unknown>) => {
      if (!selectedId) return;
      // 같은 속성을 이어서 고치면(텍스트 타이핑 등) 한 건, 다른 속성으로 옮기면 새 건
      editDoc(
        (d) => ({
          ...d,
          blocks: d.blocks.map((b) =>
            b.id === selectedId
              ? { ...b, props: { ...b.props, ...propsPatch } }
              : b,
          ),
        }),
        {
          coalesceKey: `props:${selectedId}:${Object.keys(propsPatch).join(",")}`,
        },
      );
    },
    [selectedId, editDoc],
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

  const handleRemove = useCallback(
    (id: string) => {
      editDoc((d) => ({ ...d, blocks: d.blocks.filter((b) => b.id !== id) }));
      setSelectedId(null);
      // 삭제는 확인창 없이 즉시 일어난다 — 되돌릴 수 있다는 사실을 여기서 알린다
      // (잠긴 문서라면 editDoc 이 이미 거부 안내를 띄웠으므로 성공 문구를 겹치지 않는다)
      if (!locked) {
        toast.success("블록을 삭제했습니다.", {
          action: { label: "되돌리기", onClick: onUndo },
        });
      }
    },
    [editDoc, setSelectedId, locked, onUndo],
  );

  // 겹침 순서(z) — 규칙은 editor-schema 의 reorderZ 가 단일 기준이다.
  // 여기서 직접 계산하던 예전 코드는 z 를 음수까지 내려 블록이 흰 배경 뒤로 사라졌다.
  const handleZOrder = useCallback(
    (id: string, action: ZOrderAction) => {
      editDoc((d) => ({ ...d, blocks: reorderZ(d.blocks, id, action) }));
    },
    [editDoc],
  );

  const handleZOrderSelected = useCallback(
    (action: ZOrderAction) => {
      if (selectedId) handleZOrder(selectedId, action);
    },
    [selectedId, handleZOrder],
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
      setSelectedId(null);
      setDirty(true);
      toast.success(`템플릿 '${t.name}'을(를) 불러왔습니다.`);
    },
    [replaceDoc, locked, lockReason, setSelectedId, setDirty],
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
    handleZOrder,
    handleZOrderSelected,
    handleAddPage,
    handleRemovePage,
    handleLoadTemplate,
  };
}
