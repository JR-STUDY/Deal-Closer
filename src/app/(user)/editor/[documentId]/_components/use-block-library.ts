"use client";

import { useCallback, useRef, useState } from "react";
import { toast } from "sonner";
import {
  defaultProps,
  uid,
  type AnyBlockProps,
  type Block,
  type BlockType,
  type EditorDoc,
} from "@/lib/editor-schema";
import {
  deleteCustomBlock,
  deleteTemplate,
  getBaseDefaults,
  getCustomBlocks,
  getTemplates,
  saveBaseDefault,
  saveCustomBlock,
  saveTemplate,
  type BaseDefaults,
  type CustomBlock,
  type DocTemplate,
} from "./template-store";

/**
 * 내 블록 · 문서 템플릿 · 기본 블록 속성 (#3) — 전부 브라우저 localStorage 다.
 *
 * 이름을 받아야 저장할 수 있는 것들(내 블록·템플릿)이 있어서 **이름 입력 프롬프트도
 * 여기서 함께 관리한다** — 저장 요청과 이름 입력이 갈라지면 어느 쪽에 이름을 넘길지
 * 매번 배선해야 한다.
 *
 * 문서를 바꾸는 동작(템플릿 불러오기·내 블록 추가)은 여기 없다 — 잠금 판정과
 * 되돌리기 히스토리를 거쳐야 하므로 에디터가 `editDoc`/`replaceDoc` 으로 처리한다.
 */
export function useBlockLibrary(options: {
  doc: EditorDoc;
  docTitle: string;
  /** "내 블록으로 저장" 대상 */
  selectedBlock: Block | null;
}) {
  const { doc, docTitle, selectedBlock } = options;

  // 에디터는 ssr:false(클라이언트 전용)라 초기화 시 localStorage 를 안전하게 읽는다
  const [customBlocks, setCustomBlocks] = useState<CustomBlock[]>(() =>
    getCustomBlocks(),
  );
  const [templates, setTemplates] = useState<DocTemplate[]>(() => getTemplates());

  // 기본 블록 사용자 지정 속성 — 화면에 표시되지 않고 핸들러에서만 읽고 쓰므로 ref 로 보관해
  // 불필요한 재렌더를 피한다 (rerender-state-only-in-handlers).
  // lazy-init 으로 localStorage 는 최초 1회만 읽는다.
  const baseDefaultsRef = useRef<BaseDefaults | null>(null);
  if (baseDefaultsRef.current === null) {
    baseDefaultsRef.current = getBaseDefaults();
  }

  /** 기본 블록 수정 모달의 편집 중인 값 */
  const [editBase, setEditBase] = useState<{
    type: BlockType;
    props: AnyBlockProps;
  } | null>(null);

  /** 이름 입력 프롬프트 — 내 블록·템플릿 저장이 공유한다 */
  const [namePrompt, setNamePrompt] = useState<{
    label: string;
    onConfirm: (v: string) => void;
  } | null>(null);
  const [nameValue, setNameValue] = useState("");

  /** 블록을 새로 추가할 때 쓸 기본 속성 (사용자가 고쳐 둔 것이 있으면 그것) */
  const baseDefaultsFor = useCallback(
    (type: BlockType): AnyBlockProps | undefined => baseDefaultsRef.current?.[type],
    [],
  );

  const handleEditBase = useCallback((type: BlockType) => {
    setEditBase({
      type,
      props: structuredClone(
        baseDefaultsRef.current?.[type] ?? defaultProps(type),
      ),
    });
  }, []);

  const patchEditBase = useCallback((patch: Record<string, unknown>) => {
    setEditBase((current) =>
      current ? { ...current, props: { ...current.props, ...patch } } : current,
    );
  }, []);

  const saveEditBase = useCallback(() => {
    setEditBase((current) => {
      if (!current) return null;
      baseDefaultsRef.current = saveBaseDefault(current.type, current.props);
      toast.success("기본 블록을 수정했습니다.");
      return null;
    });
  }, []);

  const handleSaveAsCustom = useCallback(() => {
    if (!selectedBlock) return;
    setNameValue(selectedBlock.type);
    setNamePrompt({
      label: "내 블록 이름",
      onConfirm: (name) => {
        setCustomBlocks(
          saveCustomBlock({
            id: uid(),
            name,
            type: selectedBlock.type,
            w: selectedBlock.w,
            h: selectedBlock.h,
            props: structuredClone(selectedBlock.props),
          }),
        );
        toast.success("내 블록으로 저장했습니다.");
      },
    });
  }, [selectedBlock]);

  const handleDeleteCustomBlock = useCallback((id: string) => {
    setCustomBlocks(deleteCustomBlock(id));
  }, []);

  const handleSaveTemplate = useCallback(() => {
    setNameValue(docTitle);
    setNamePrompt({
      label: "템플릿 이름",
      onConfirm: (name) => {
        setTemplates(
          saveTemplate({
            id: uid(),
            name,
            canvas: doc.canvas,
            blocks: doc.blocks,
          }),
        );
        toast.success("현재 배치를 템플릿으로 저장했습니다.");
      },
    });
  }, [doc, docTitle]);

  const handleDeleteTemplate = useCallback((id: string) => {
    setTemplates(deleteTemplate(id));
  }, []);

  const confirmName = useCallback(() => {
    const value = nameValue.trim();
    if (!value || !namePrompt) return;
    namePrompt.onConfirm(value);
    setNamePrompt(null);
  }, [nameValue, namePrompt]);

  return {
    customBlocks,
    templates,
    baseDefaultsFor,
    handleSaveAsCustom,
    handleDeleteCustomBlock,
    handleSaveTemplate,
    handleDeleteTemplate,
    // 기본 블록 수정 모달
    editBase,
    handleEditBase,
    patchEditBase,
    saveEditBase,
    closeEditBase: () => setEditBase(null),
    // 이름 입력 프롬프트
    namePrompt,
    nameValue,
    setNameValue,
    confirmName,
    closeNamePrompt: () => setNamePrompt(null),
  };
}
