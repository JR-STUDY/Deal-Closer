"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import type {
  Block,
  BlockType,
  EditorDoc,
  ZOrderAction,
  CatalogOption,
  AnyBlockProps,
} from "@/lib/editor-schema";
import {
  createBlock,
  uid,
  defaultProps,
  deriveAmount,
  reorderZ,
  BLOCK_LABELS,
} from "@/lib/editor-schema";
import { formatKRW } from "@/lib/format";
import {
  amountChangeMessage,
  type AmountSync,
} from "@/components/opportunity/confirmed-document-actions";
import {
  getCustomBlocks,
  saveCustomBlock,
  deleteCustomBlock,
  getTemplates,
  saveTemplate,
  deleteTemplate,
  getBaseDefaults,
  saveBaseDefault,
  type CustomBlock,
  type DocTemplate,
  type BaseDefaults,
} from "./template-store";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogFooter,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { EditorCanvas } from "./editor-canvas";
import type { Geometry } from "./canvas-block";
import { EditorSidebar } from "./editor-sidebar";
import { EditorToolbar } from "./editor-toolbar";
import { EditorPreview } from "./editor-preview";
import { BlockInspector, ContentForm } from "./block-inspector";
import { useDocHistory } from "./use-doc-history";
import { useCreateVersion } from "./use-create-version";
import type { DocumentEditLock } from "@/lib/document-edit";
import { Lock } from "lucide-react";
import { DocumentStatusControl } from "./document-status-control";
import { DocumentVersionControl } from "./document-version-control";
import type { AiModelOption } from "@/lib/ai/models";

type Props = {
  documentId: string;
  initialTitle: string;
  initialStatus: string;
  initialDoc: EditorDoc;
  /** 저장된 Document.amount — 저장으로 금액이 0 이 되는지 판단하는 기준 */
  initialAmount: number;
  catalog: CatalogOption[];
  /** 현재 문서의 버전 번호 (F-214) */
  version: number;
  /** 확정본 여부 (F-214) */
  isConfirmed: boolean;
  /** 본문 편집 잠금 (발송·계약완료·확정본·폐기) — 서버 PATCH 와 같은 판정 */
  lock: DocumentEditLock;
  /** 선택 가능한 AI 모델 (AI 부분 재작성용) */
  models: AiModelOption[];
  defaultModel: string;
  mockProvider: boolean;
};

export function DocumentEditor({
  documentId,
  initialTitle,
  initialStatus,
  initialDoc,
  initialAmount,
  catalog,
  version,
  isConfirmed,
  lock,
  models,
  defaultModel,
  mockProvider,
}: Props) {
  // 문서 상태는 되돌리기 히스토리가 함께 관리한다 (진단 2)
  const { doc, setDoc, replaceDoc, undo, redo, canUndo, canRedo } =
    useDocHistory(initialDoc);
  const [docTitle, setDocTitle] = useState(initialTitle);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [sidebarTab, setSidebarTab] = useState<"palette" | "inspector">(
    "palette",
  );
  const [dirty, setDirty] = useState(false);
  const [saving, setSaving] = useState(false);
  const [navTarget, setNavTarget] = useState<string | null>(null);
  // 저장된 금액 — 저장으로 금액이 사라지는지 판단하는 기준. 저장 성공 시 서버 값으로 갱신한다.
  // 화면에 그리지 않고 핸들러에서만 읽고 쓰므로 ref 로 둔다 (rerender-state-only-in-handlers).
  // 확인창에 보여줄 값은 zeroWarning.from 으로 복사해 넘긴다.
  const savedAmountRef = useRef(initialAmount);
  // 금액이 0 으로 떨어지는 저장을 확인받는다. `then` 은 확인 후 이동할 곳(이탈 흐름).
  const [zeroWarning, setZeroWarning] = useState<{
    from: number;
    then: string | null;
  } | null>(null);
  const [previewOpen, setPreviewOpen] = useState(false);
  const [editModalOpen, setEditModalOpen] = useState(false);
  const [namePrompt, setNamePrompt] = useState<{
    label: string;
    onConfirm: (v: string) => void;
  } | null>(null);
  const [nameValue, setNameValue] = useState("");
  // 팔레트로 블록 추가 시 놓을 y (현재 보이는 화면 기준) — editor-canvas 스크롤에서 갱신
  const addYRef = useRef(40);
  // 에디터는 ssr:false(클라이언트 전용)라 초기화 시 localStorage 를 안전하게 읽는다 (#3)
  const [customBlocks, setCustomBlocks] = useState<CustomBlock[]>(() =>
    getCustomBlocks(),
  );
  const [templates, setTemplates] = useState<DocTemplate[]>(() =>
    getTemplates(),
  );
  // 기본 블록 사용자 지정 기본 속성 (블록 추가 탭에서 수정) — 화면에 표시되지 않고
  // 핸들러에서만 읽고 쓰므로 useRef 로 보관해 불필요한 재렌더를 피한다
  // (rerender-state-only-in-handlers). lazy-init 으로 localStorage 는 최초 1회만 읽는다.
  const baseDefaultsRef = useRef<BaseDefaults | null>(null);
  if (baseDefaultsRef.current === null) {
    baseDefaultsRef.current = getBaseDefaults();
  }
  const [editBase, setEditBase] = useState<{
    type: BlockType;
    props: AnyBlockProps;
  } | null>(null);
  const router = useRouter();

  /*
   * 잠긴 문서(발송·계약완료·확정본·폐기)는 본문을 고치지 않는다 (진단 3).
   * 모든 편집을 이 래퍼 한 곳으로 모아 통과시킨다 — 핸들러마다 검사를 흩어 두면
   * 하나를 빠뜨렸을 때 그 경로로만 조용히 편집된다. UI 비활성은 안내이고,
   * 실제 방어선은 이 래퍼와 서버의 PATCH 판정이다.
   */
  const locked = lock.locked;
  const editDoc = useCallback(
    (updater: (previous: EditorDoc) => EditorDoc, options?: { coalesceKey?: string }) => {
      if (locked) {
        toast.error(lock.reason);
        return;
      }
      setDoc(updater, options);
      setDirty(true);
    },
    [locked, lock.reason, setDoc],
  );

  /*
   * 잘린 블록 집계 (진단 4). 툴바가 "잘린 블록 N개" 를 띄우고, 저장할 때 남아 있으면
   * 알린다(막지는 않는다 — 일부러 잘라 두는 경우도 있다).
   * 측정은 각 CanvasBlock 이 하고 여기서는 id 만 모은다.
   */
  const [clippedIds, setClippedIds] = useState<ReadonlySet<string>>(
    () => new Set(),
  );
  const handleClippedChange = useCallback((id: string, clipped: boolean) => {
    setClippedIds((current) => {
      if (clipped === current.has(id)) return current;
      const next = new Set(current);
      if (clipped) next.add(id);
      else next.delete(id);
      return next;
    });
  }, []);

  /**
   * 잘린 내용에 맞춰 블록 높이를 늘린다.
   * 늘린 결과가 페이지 경계를 넘으면 알린다 — 넘긴 부분은 다음 장에서 잘려 이어진다.
   */
  const handleFit = useCallback(
    (id: string, contentHeight: number) => {
      editDoc((d) => ({
        ...d,
        blocks: d.blocks.map((b) =>
          b.id === id && contentHeight > b.h ? { ...b, h: contentHeight } : b,
        ),
      }));
      const block = doc.blocks.find((b) => b.id === id);
      if (!block) return;
      const pageH = doc.canvas.h;
      const wasPage = Math.floor(block.y / pageH);
      const nowPage = Math.floor((block.y + contentHeight - 1) / pageH);
      if (nowPage > wasPage) {
        toast.warning(
          "블록을 늘리니 페이지 경계를 넘습니다. 위치를 옮기거나 페이지를 추가해 주세요.",
        );
      }
    },
    [editDoc, doc.blocks, doc.canvas.h],
  );

  /** 잘린 블록을 한 번에 맞춘다 — 하나씩 누르지 않게 (자동 확장 대신 주는 편의) */
  const handleFitAll = useCallback(() => {
    const heights = new Map<string, number>();
    for (const id of clippedIds) {
      const node = document.querySelector<HTMLElement>(`[data-block-id="${id}"]`);
      if (node) heights.set(id, Math.ceil(node.scrollHeight));
    }
    if (heights.size === 0) return;
    editDoc((d) => ({
      ...d,
      blocks: d.blocks.map((b) => {
        const h = heights.get(b.id);
        return h !== undefined && h > b.h ? { ...b, h } : b;
      }),
    }));
    toast.success(`잘린 블록 ${heights.size}개를 내용에 맞췄습니다.`);
  }, [clippedIds, editDoc]);

  /*
   * 캔버스 인라인 편집 (진단 5) — 더블클릭으로 들어가고 blur·⌘Enter 로 저장, Esc 로 되돌린다.
   * 편집 세션 하나가 되돌리기 한 건이 되도록 coalesceKey 없이 커밋한다
   * (편집 중에는 DOM 이 값을 들고 있고, 끝날 때 한 번만 문서에 반영한다).
   */
  const [editingId, setEditingId] = useState<string | null>(null);
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

  const selectedBlock = useMemo(
    () => doc.blocks.find((b) => b.id === selectedId) ?? null,
    [doc.blocks, selectedId],
  );

  // 블록을 선택하면 속성 탭으로 자동 전환
  const handleSelect = useCallback((id: string | null) => {
    setSelectedId(id);
    if (id) setSidebarTab("inspector");
  }, []);

  const handleAdd = useCallback(
    (type: BlockType, pos?: { x: number; y: number }) => {
      if (locked) {
        toast.error(lock.reason);
        return;
      }
      // 팔레트 클릭 추가는 현재 보이는 화면 기준 위치에 놓는다
      const block = createBlock(type, pos ?? { x: 40, y: addYRef.current });
      // 사용자가 '블록 추가' 탭에서 수정한 기본 속성이 있으면 그걸로 시작
      const override = baseDefaultsRef.current?.[type];
      if (override) block.props = structuredClone(override);
      editDoc((d) => ({ ...d, blocks: [...d.blocks, block] }));
      setSelectedId(block.id);
      setSidebarTab("inspector");
    },
    [editDoc, locked, lock.reason],
  );

  // '블록 추가' 탭의 기본 블록 수정 (#3) — 타입별 기본 속성 편집
  const handleEditBase = useCallback(
    (type: BlockType) => {
      setEditBase({
        type,
        props: structuredClone(
          baseDefaultsRef.current?.[type] ?? defaultProps(type),
        ),
      });
    },
    [],
  );

  function saveEditBase() {
    if (!editBase) return;
    baseDefaultsRef.current = saveBaseDefault(editBase.type, editBase.props);
    setEditBase(null);
    toast.success("기본 블록을 수정했습니다.");
  }

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

  const handleRemove = useCallback(
    (id: string) => {
      if (locked) {
        toast.error(lock.reason);
        return;
      }
      editDoc((d) => ({ ...d, blocks: d.blocks.filter((b) => b.id !== id) }));
      setSelectedId(null);
      // 삭제는 확인창 없이 즉시 일어난다 — 되돌릴 수 있다는 사실을 여기서 알린다
      toast.success("블록을 삭제했습니다.", {
        action: { label: "되돌리기", onClick: () => undo() },
      });
    },
    [editDoc, undo, locked, lock.reason],
  );

  // 겹친 블록의 앞뒤 순서(z) 조작 (#4) — 규칙은 editor-schema 의 reorderZ 가 단일 기준이다.
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

  // ── 사용자 지정 블록 (#3) ──
  const handleAddCustomBlock = useCallback((cb: CustomBlock) => {
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
    if (locked) {
      toast.error(lock.reason);
      return;
    }
    editDoc((d) => ({ ...d, blocks: [...d.blocks, block] }));
    setSelectedId(block.id);
    setSidebarTab("inspector");
  }, [editDoc, locked, lock.reason]);

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

  const handleEditBlock = useCallback((id: string) => {
    setSelectedId(id);
    setEditModalOpen(true);
  }, []);

  const handleDeleteCustomBlock = useCallback((id: string) => {
    setCustomBlocks(deleteCustomBlock(id));
  }, []);

  // ── 문서 템플릿 (#3) ──
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

  function confirmName() {
    const v = nameValue.trim();
    if (!v || !namePrompt) return;
    namePrompt.onConfirm(v);
    setNamePrompt(null);
  }

  const handleLoadTemplate = useCallback((t: DocTemplate) => {
    if (locked) {
      toast.error(lock.reason);
      return;
    }
    // 문서를 통째로 갈아치우므로 되돌리기 히스토리도 새로 시작한다
    replaceDoc({
      version: 1,
      canvas: t.canvas ?? { w: 794, h: 1123 },
      blocks: t.blocks.map((b) => ({ ...b, id: uid() })),
    });
    setSelectedId(null);
    setDirty(true);
    toast.success(`템플릿 '${t.name}'을(를) 불러왔습니다.`);
  }, [replaceDoc, locked, lock.reason]);

  const handleDeleteTemplate = useCallback((id: string) => {
    setTemplates(deleteTemplate(id));
  }, []);

  const handleTitleChange = useCallback(
    (v: string) => {
      if (locked) return;
      setDocTitle(v);
      setDirty(true);
    },
    [locked],
  );

  // ── 페이지 (#8) ──
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

  /** 실제 저장. 성공 여부를 돌려준다 (이탈 시 저장→이동 판단에 쓴다). */
  const performSave = useCallback(async (): Promise<boolean> => {
    setSaving(true);
    try {
      const res = await fetch(`/api/documents/${documentId}`, {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          contentJson: JSON.stringify(doc),
          title: docTitle,
        }),
      });
      const json = await res.json().catch(() => null);
      if (!res.ok) throw new Error(json?.error ?? "save failed");
      setDirty(false);
      // 금액 기준은 **서버가 재계산한 값**으로 갱신한다 (정책 VAL: 클라이언트 총액을 신뢰하지 않는다)
      if (typeof json?.data?.amount === "number") {
        savedAmountRef.current = json.data.amount;
      }
      toast.success("저장되었습니다.");
      /*
       * 본문 금액이 바뀌면 연결된 기회의 예상 금액도 따라 바뀐다 (기회-6 ①).
       * 그 사실을 알리지 않으면 금액이 소리 없이 달라진다 — 기회 화면과 같은 문구를 쓴다.
       */
      const sync = (json?.data?.amountSync ?? null) as AmountSync | null;
      const message = sync ? amountChangeMessage(sync) : null;
      if (message) toast.info(message);
      // 잘린 블록이 남아 있으면 알린다 — 그대로 발송하면 PDF 에서도 잘린다 (막지는 않는다)
      if (clippedIds.size > 0) {
        toast.warning(
          `내용이 잘린 블록이 ${clippedIds.size}개 있습니다. 발송 전에 확인해 주세요.`,
        );
      }
      return true;
    } catch {
      toast.error("저장에 실패했습니다. 다시 시도해주세요.");
      return false;
    } finally {
      setSaving(false);
    }
  }, [doc, docTitle, documentId, clippedIds]);

  /**
   * 저장 전에 **금액이 사라지는지** 확인한다.
   *
   * 품목표를 다 지운 채 저장하면 문서 금액이 0 이 되고, 이 문서가 확정 문서라면
   * 기회 예상 금액까지 0 으로 내려간다 — 되돌릴 수 없는 조작이므로 결과를 미리 말한다.
   * (품목표 블록이 아예 없으면 서버가 저장된 금액을 보존하므로 물어볼 것이 없다.)
   */
  const handleSave = useCallback(async () => {
    if (locked) {
      toast.error(lock.reason);
      return;
    }
    if (deriveAmount(doc) === 0 && savedAmountRef.current > 0) {
      setZeroWarning({ from: savedAmountRef.current, then: null });
      return;
    }
    await performSave();
  }, [doc, performSave, locked, lock.reason]);

  /** AI 재작성·새 버전 저장 입력으로 쓰는 현재 본문 스냅샷 */
  const getContentJson = useCallback(() => JSON.stringify(doc), [doc]);

  /**
   * 다른 버전(또는 새로 만든 버전)으로 이동한다.
   * 새 버전에는 지금 편집 내용이 이미 담겨 있으므로 미저장 경고를 띄우지 않는다.
   */
  const goToVersion = useCallback(
    (nextDocumentId: string) => {
      setDirty(false);
      router.push(`/editor/${nextDocumentId}`);
    },
    [router],
  );

  /*
   * 잠긴 문서를 고치는 **유일한 길** — 지금 내용을 새 버전(초안)으로 떠서 그리로 이동한다.
   * 버전 이력 다이얼로그의 "새 버전으로 저장"과 같은 훅을 써 동작·문구를 맞춘다.
   */
  const { createVersion, saving: creatingVersion } = useCreateVersion({
    documentId,
    getContentJson,
    onNavigate: goToVersion,
  });

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

  /** 되돌리기·다시 실행 — 저장된 내용과 달라지므로 미저장 상태로 표시한다 */
  const handleUndo = useCallback(() => {
    undo();
    setDirty(true);
  }, [undo]);

  const handleRedo = useCallback(() => {
    redo();
    setDirty(true);
  }, [redo]);

  // 단축키: ⌘Z/⌘⇧Z=되돌리기·다시 실행, 선택된 블록에 Backspace/Delete=삭제, Esc=선택해제, 방향키=이동
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      // 인라인 편집 중에는 캔버스 단축키를 전부 양보한다 (Backspace 가 블록을 지우면 안 된다)
      if (editingId) return;
      const t = e.target as HTMLElement | null;
      if (
        t &&
        (t.isContentEditable ||
          t.tagName === "INPUT" ||
          t.tagName === "TEXTAREA" ||
          t.tagName === "SELECT")
      ) {
        // 입력 중에는 무시 — ⌘Z 도 브라우저 기본 되돌리기에 양보한다
        return;
      }

      // 되돌리기는 **선택된 블록이 없어도** 동작해야 한다 (블록을 지운 직후가 그렇다)
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "z") {
        e.preventDefault();
        if (e.shiftKey) handleRedo();
        else handleUndo();
        return;
      }
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "y") {
        e.preventDefault();
        handleRedo();
        return;
      }

      if (!selectedId) return;
      if (e.key === "Backspace" || e.key === "Delete") {
        e.preventDefault();
        handleRemove(selectedId);
      } else if (e.key === "Escape") {
        setSelectedId(null);
      } else if (e.key.startsWith("Arrow")) {
        const b = doc.blocks.find((x) => x.id === selectedId);
        if (!b) return;
        const step = e.shiftKey ? 10 : 1;
        const dx =
          e.key === "ArrowLeft" ? -step : e.key === "ArrowRight" ? step : 0;
        const dy =
          e.key === "ArrowUp" ? -step : e.key === "ArrowDown" ? step : 0;
        if (dx || dy) {
          e.preventDefault();
          handleGeometry(selectedId, {
            x: Math.max(0, b.x + dx),
            y: Math.max(0, b.y + dy),
            w: b.w,
            h: b.h,
          });
        }
      }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [
    selectedId,
    editingId,
    doc.blocks,
    handleRemove,
    handleGeometry,
    handleUndo,
    handleRedo,
  ]);

  // 미저장 상태에서 앱 내 링크 이동 시 가로채기 (#7) — 사이드바/발송 링크 포함
  useEffect(() => {
    if (!dirty) return;
    function onClick(e: MouseEvent) {
      if (
        e.defaultPrevented ||
        e.button !== 0 ||
        e.metaKey ||
        e.ctrlKey ||
        e.shiftKey ||
        e.altKey
      ) {
        return;
      }
      const anchor = (e.target as HTMLElement | null)?.closest("a");
      if (!anchor) return;
      const href = anchor.getAttribute("href");
      if (
        !href ||
        !href.startsWith("/") ||
        anchor.target === "_blank" ||
        anchor.hasAttribute("download")
      ) {
        return;
      }
      e.preventDefault();
      setNavTarget(href);
    }
    document.addEventListener("click", onClick, true);
    return () => document.removeEventListener("click", onClick, true);
  }, [dirty]);

  async function saveAndGo() {
    const target = navTarget;
    setNavTarget(null);
    // 금액이 사라지는 저장이면 확인창으로 넘긴다 — 확인 후 원래 가려던 곳으로 보낸다.
    if (deriveAmount(doc) === 0 && savedAmountRef.current > 0) {
      setZeroWarning({ from: savedAmountRef.current, then: target });
      return;
    }
    if (await performSave()) {
      if (target) router.push(target);
    }
  }

  async function confirmZeroSave() {
    const target = zeroWarning?.then ?? null;
    setZeroWarning(null);
    if (await performSave()) {
      if (target) router.push(target);
    }
  }

  function discardAndGo() {
    const target = navTarget;
    setNavTarget(null);
    setDirty(false);
    if (target) router.push(target);
  }

  return (
    <>
      <div className="flex min-h-0 flex-1 overflow-hidden">
        <div className="flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden">
        <div className="flex flex-col gap-2 border-b bg-background px-4 py-2">
          <div className="flex items-center gap-3">
            <Input
              value={docTitle}
              onChange={(e) => handleTitleChange(e.target.value)}
              aria-label="문서 제목"
              placeholder="문서 제목"
              className="h-auto min-w-0 flex-1 border-transparent bg-transparent px-2 py-1 text-xl font-semibold tracking-tight shadow-none hover:border-input focus-visible:border-input"
            />
            {/* 버전 이력·확정본 (F-214) */}
            <DocumentVersionControl
              documentId={documentId}
              version={version}
              isConfirmed={isConfirmed}
              getContentJson={getContentJson}
              onNavigate={goToVersion}
            />
            <DocumentStatusControl
              documentId={documentId}
              status={initialStatus}
            />
          </div>
          {/* 잠긴 문서 안내 + 고치는 유일한 길 (진단 3) */}
          {locked ? (
            <div className="flex flex-wrap items-center gap-x-3 gap-y-2 rounded-md border border-amber-500/40 bg-amber-50 px-3 py-2 text-sm text-amber-900 dark:bg-amber-950/40 dark:text-amber-100">
              <Lock className="size-4 shrink-0" aria-hidden />
              <p className="min-w-0 flex-1">{lock.reason}</p>
              <Button
                size="sm"
                variant="outline"
                onClick={createVersion}
                disabled={creatingVersion}
                className="shrink-0 bg-background"
              >
                {creatingVersion
                  ? "새 버전 만드는 중…"
                  : "이 내용으로 새 버전 만들어 편집"}
              </Button>
            </div>
          ) : null}
          <EditorToolbar
            documentId={documentId}
            locked={locked}
            dirty={dirty}
            saving={saving}
            onSave={handleSave}
            canUndo={canUndo}
            canRedo={canRedo}
            onUndo={handleUndo}
            onRedo={handleRedo}
            clippedCount={clippedIds.size}
            onFitAll={handleFitAll}
            pages={doc.canvas.pages ?? 1}
            onAddPage={handleAddPage}
            onRemovePage={handleRemovePage}
            onPreview={() => setPreviewOpen(true)}
            getContentJson={getContentJson}
            onRevised={goToVersion}
            models={models}
            defaultModel={defaultModel}
            mockProvider={mockProvider}
          />
        </div>
        <EditorCanvas
          doc={doc}
          locked={locked}
          selectedId={selectedId}
          onSelect={handleSelect}
          onGeometry={handleGeometry}
          onAddBlock={handleAdd}
          onRemove={handleRemove}
          onZOrder={handleZOrder}
          onEdit={handleEditBlock}
          onViewTop={(y) => {
            addYRef.current = y;
          }}
          onFit={handleFit}
          onClippedChange={handleClippedChange}
          editingId={editingId}
          onEditingChange={setEditingId}
          onInlineCommit={handleInlineCommit}
        />
      </div>
      <EditorSidebar
        tab={sidebarTab}
        locked={locked}
        lockReason={lock.reason}
        onTabChange={(v) => setSidebarTab(v as "palette" | "inspector")}
        onAdd={handleAdd}
        onEditBase={handleEditBase}
        catalog={catalog}
        block={selectedBlock}
        onChange={handleChangeBlock}
        onChangeProps={handleChangeProps}
        onRemove={handleRemove}
        onZOrder={handleZOrderSelected}
        customBlocks={customBlocks}
        onAddCustom={handleAddCustomBlock}
        onDeleteCustom={handleDeleteCustomBlock}
        onSaveAsCustom={handleSaveAsCustom}
        templates={templates}
        onSaveTemplate={handleSaveTemplate}
        onLoadTemplate={handleLoadTemplate}
        onDeleteTemplate={handleDeleteTemplate}
      />
      </div>

      <Dialog
        open={navTarget !== null}
        onOpenChange={(o) => {
          if (!o) setNavTarget(null);
        }}
      >
        <DialogContent>
          <DialogHeader className="gap-6">
            <DialogTitle>저장하지 않은 변경사항이 있습니다</DialogTitle>
            <DialogDescription>
              이 페이지를 떠나기 전에 변경사항을 저장하시겠습니까?
            </DialogDescription>
          </DialogHeader>
          <DialogFooter className="p-3">
            <Button variant="outline" onClick={discardAndGo}>
              저장하지 않음
            </Button>
            <Button onClick={saveAndGo} disabled={saving}>
              {saving ? "저장 중…" : "저장"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* 금액이 사라지는 저장 — 되돌릴 수 없으므로 결과를 미리 말한다 (기회-6) */}
      <AlertDialog
        open={zeroWarning !== null}
        onOpenChange={(o) => {
          if (!o) setZeroWarning(null);
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>금액이 ₩0 으로 저장됩니다</AlertDialogTitle>
            <AlertDialogDescription>
              품목표가 비어 있어 이 문서의 금액이{" "}
              {formatKRW(zeroWarning?.from ?? 0)} 에서 ₩0 으로 바뀝니다. 이 문서가
              연결된 기회의 확정 문서라면 예상 금액도 ₩0 이 됩니다. 그대로
              저장하시겠습니까?
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>취소</AlertDialogCancel>
            <AlertDialogAction onClick={confirmZeroSave}>
              ₩0 으로 저장
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <EditorPreview
        open={previewOpen}
        onOpenChange={setPreviewOpen}
        doc={doc}
        title={docTitle}
      />

      {/* 이름 입력 다이얼로그 (#4) */}
      <Dialog
        open={namePrompt !== null}
        onOpenChange={(o) => {
          if (!o) setNamePrompt(null);
        }}
      >
        <DialogContent className="sm:max-w-sm">
          <DialogHeader>
            <DialogTitle>{namePrompt?.label ?? "이름"}</DialogTitle>
          </DialogHeader>
          <Input
            autoFocus
            value={nameValue}
            onChange={(e) => setNameValue(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") confirmName();
            }}
            placeholder="이름을 입력하세요"
          />
          <DialogFooter>
            <Button variant="outline" onClick={() => setNamePrompt(null)}>
              취소
            </Button>
            <Button onClick={confirmName} disabled={!nameValue.trim()}>
              저장
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* 블록 수정 모달 (#1) */}
      <Dialog open={editModalOpen} onOpenChange={setEditModalOpen}>
        <DialogContent className="flex max-h-[85vh] flex-col overflow-hidden sm:max-w-md">
          <DialogHeader>
            <DialogTitle>블록 수정</DialogTitle>
          </DialogHeader>
          <div className="min-h-0 flex-1 overflow-auto">
            <BlockInspector
              readOnly={locked}
              readOnlyReason={lock.reason}
              block={selectedBlock}
              catalog={catalog}
              onChange={handleChangeBlock}
              onChangeProps={handleChangeProps}
              onRemove={(id) => {
                handleRemove(id);
                setEditModalOpen(false);
              }}
              onZOrder={handleZOrderSelected}
              onSaveAsCustom={handleSaveAsCustom}
            />
          </div>
        </DialogContent>
      </Dialog>

      {/* 기본 블록 수정 모달 (#3) — 블록 추가 탭에서 진입, 타입별 속성 편집 */}
      <Dialog
        open={editBase !== null}
        onOpenChange={(o) => {
          if (!o) setEditBase(null);
        }}
      >
        <DialogContent className="flex max-h-[85vh] flex-col overflow-hidden sm:max-w-md">
          <DialogHeader>
            <DialogTitle>
              기본 블록 수정{editBase ? ` · ${BLOCK_LABELS[editBase.type]}` : ""}
            </DialogTitle>
            <DialogDescription>
              이 블록을 추가할 때 사용할 기본 속성입니다.
            </DialogDescription>
          </DialogHeader>
          <div className="min-h-0 flex-1 overflow-auto">
            {editBase ? (
              <ContentForm
                block={
                  {
                    id: "base",
                    type: editBase.type,
                    x: 0,
                    y: 0,
                    w: 0,
                    h: 0,
                    z: 1,
                    locked: false,
                    props: editBase.props,
                  } as Block
                }
                catalog={catalog}
                onChangeProps={(patch) =>
                  setEditBase((eb) =>
                    eb ? { ...eb, props: { ...eb.props, ...patch } } : eb,
                  )
                }
              />
            ) : null}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setEditBase(null)}>
              취소
            </Button>
            <Button onClick={saveEditBase}>저장</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
