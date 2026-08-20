"use client";

import { useCallback, useMemo, useState } from "react";
import type { Block } from "@/lib/editor-schema";

/**
 * 캔버스 블록 선택 상태 (다중선택).
 *
 * 선택은 **여러 개**지만 속성 편집은 하나를 대상으로 한다 — 그래서 `selectedBlock` 을
 * "정확히 1개일 때"만 준다. 인스펙터·수정 모달·내 블록 저장이 모두 이 값을 보므로,
 * 이 규칙 하나로 1개 선택일 때의 동작이 예전과 똑같이 유지된다.
 *
 * 이 훅은 문서를 바꾸지 않는다 — 무엇을 골랐는지만 안다.
 */
export function useBlockSelection(options: {
  blocks: Block[];
  /** 선택이 생기면 사이드바를 속성/정렬 탭으로 돌린다 */
  onShowInspector: () => void;
}) {
  const { blocks, onShowInspector } = options;
  const [selectedIds, setSelectedIds] = useState<string[]>([]);

  /** 여러 개를 고르면 "이 블록의 속성" 이라는 것이 없다 */
  const selectedBlock = useMemo(
    () =>
      selectedIds.length === 1
        ? blocks.find((b) => b.id === selectedIds[0]) ?? null
        : null,
    [blocks, selectedIds],
  );

  /** `additive`(⇧·⌘ 클릭)면 골라 둔 것에 더하거나 뺀다 */
  const select = useCallback(
    (id: string | null, additive: boolean) => {
      if (!id) {
        setSelectedIds([]);
        return;
      }
      setSelectedIds((previous) =>
        additive
          ? previous.includes(id)
            ? previous.filter((k) => k !== id)
            : [...previous, id]
          : [id],
      );
      onShowInspector();
    },
    [onShowInspector],
  );

  /** 마퀴로 한 번에 여러 개 */
  const selectMany = useCallback(
    (ids: string[], additive: boolean) => {
      setSelectedIds((previous) => {
        if (!additive) return ids;
        // 배열을 매번 훑지 않도록 Set 으로 본다 (react-doctor js-set-map-lookups)
        const have = new Set(previous);
        return [...previous, ...ids.filter((id) => !have.has(id))];
      });
      if (ids.length > 0) onShowInspector();
    },
    [onShowInspector],
  );

  const selectAll = useCallback(() => {
    setSelectedIds(blocks.map((b) => b.id));
    onShowInspector();
  }, [blocks, onShowInspector]);

  const clear = useCallback(() => setSelectedIds([]), []);

  /**
   * 블록 아이콘·우클릭 메뉴의 대상.
   * 누른 블록이 **선택에 포함되면 선택 전체**를, 아니면 그 블록만 대상으로 한다 —
   * 5개를 골라 두고 그중 하나를 우클릭해 지울 때 하나만 사라지면 헷갈린다.
   * 몇 개가 처리됐는지는 toast 가 말한다.
   */
  const targetsFrom = useCallback(
    (id: string) => (selectedIds.includes(id) ? selectedIds : [id]),
    [selectedIds],
  );

  return {
    selectedIds,
    setSelectedIds,
    selectedBlock,
    select,
    selectMany,
    selectAll,
    clear,
    targetsFrom,
  };
}
