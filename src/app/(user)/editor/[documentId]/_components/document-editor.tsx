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
  BLOCK_LABELS,
} from "@/lib/editor-schema";
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
import { EditorCanvas } from "./editor-canvas";
import type { Geometry } from "./canvas-block";
import { EditorSidebar } from "./editor-sidebar";
import { EditorToolbar } from "./editor-toolbar";
import { EditorPreview } from "./editor-preview";
import { BlockInspector, ContentForm } from "./block-inspector";
import { DocumentStatusControl } from "./document-status-control";

type Props = {
  documentId: string;
  initialTitle: string;
  initialStatus: string;
  initialDoc: EditorDoc;
  catalog: CatalogOption[];
};

export function DocumentEditor({
  documentId,
  initialTitle,
  initialStatus,
  initialDoc,
  catalog,
}: Props) {
  const [doc, setDoc] = useState<EditorDoc>(initialDoc);
  const [docTitle, setDocTitle] = useState(initialTitle);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [sidebarTab, setSidebarTab] = useState<"palette" | "inspector">(
    "palette",
  );
  const [dirty, setDirty] = useState(false);
  const [saving, setSaving] = useState(false);
  const [navTarget, setNavTarget] = useState<string | null>(null);
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
      // 팔레트 클릭 추가는 현재 보이는 화면 기준 위치에 놓는다
      const block = createBlock(type, pos ?? { x: 40, y: addYRef.current });
      // 사용자가 '블록 추가' 탭에서 수정한 기본 속성이 있으면 그걸로 시작
      const override = baseDefaultsRef.current?.[type];
      if (override) block.props = structuredClone(override);
      setDoc((d) => ({ ...d, blocks: [...d.blocks, block] }));
      setSelectedId(block.id);
      setSidebarTab("inspector");
      setDirty(true);
    },
    [],
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

  const handleGeometry = useCallback((id: string, geo: Geometry) => {
    setDoc((d) => ({
      ...d,
      blocks: d.blocks.map((b) => (b.id === id ? { ...b, ...geo } : b)),
    }));
    setDirty(true);
  }, []);

  const handleChangeBlock = useCallback(
    (patch: Partial<Block>) => {
      if (!selectedId) return;
      setDoc((d) => ({
        ...d,
        blocks: d.blocks.map((b) =>
          b.id === selectedId ? { ...b, ...patch } : b,
        ),
      }));
      setDirty(true);
    },
    [selectedId],
  );

  const handleChangeProps = useCallback(
    (propsPatch: Record<string, unknown>) => {
      if (!selectedId) return;
      setDoc((d) => ({
        ...d,
        blocks: d.blocks.map((b) =>
          b.id === selectedId
            ? { ...b, props: { ...b.props, ...propsPatch } }
            : b,
        ),
      }));
      setDirty(true);
    },
    [selectedId],
  );

  const handleRemove = useCallback((id: string) => {
    setDoc((d) => ({ ...d, blocks: d.blocks.filter((b) => b.id !== id) }));
    setSelectedId(null);
    setDirty(true);
  }, []);

  // 겹친 블록의 앞뒤 순서(z) 조작 (#4)
  const handleZOrder = useCallback((id: string, action: ZOrderAction) => {
    setDoc((d) => {
      const zs = d.blocks.map((b) => b.z);
      const maxZ = Math.max(1, ...zs);
      const minZ = Math.min(1, ...zs);
      return {
        ...d,
        blocks: d.blocks.map((b) => {
          if (b.id !== id) return b;
          const z =
            action === "front"
              ? maxZ + 1
              : action === "back"
                ? minZ - 1
                : action === "forward"
                  ? b.z + 1
                  : b.z - 1;
          return { ...b, z };
        }),
      };
    });
    setDirty(true);
  }, []);

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
    setDoc((d) => ({ ...d, blocks: [...d.blocks, block] }));
    setSelectedId(block.id);
    setSidebarTab("inspector");
    setDirty(true);
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
    setDoc({
      version: 1,
      canvas: t.canvas ?? { w: 794, h: 1123 },
      blocks: t.blocks.map((b) => ({ ...b, id: uid() })),
    });
    setSelectedId(null);
    setDirty(true);
    toast.success(`템플릿 '${t.name}'을(를) 불러왔습니다.`);
  }, []);

  const handleDeleteTemplate = useCallback((id: string) => {
    setTemplates(deleteTemplate(id));
  }, []);

  const handleTitleChange = useCallback((v: string) => {
    setDocTitle(v);
    setDirty(true);
  }, []);

  // ── 페이지 (#8) ──
  const handleAddPage = useCallback(() => {
    setDoc((d) => ({
      ...d,
      canvas: { ...d.canvas, pages: (d.canvas.pages ?? 1) + 1 },
    }));
    setDirty(true);
  }, []);

  const handleRemovePage = useCallback(() => {
    setDoc((d) => ({
      ...d,
      canvas: { ...d.canvas, pages: Math.max(1, (d.canvas.pages ?? 1) - 1) },
    }));
    setDirty(true);
  }, []);

  const handleSave = useCallback(async () => {
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
      if (!res.ok) throw new Error("save failed");
      setDirty(false);
      toast.success("저장되었습니다.");
    } catch {
      toast.error("저장에 실패했습니다. 다시 시도해주세요.");
    } finally {
      setSaving(false);
    }
  }, [doc, docTitle, documentId]);

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

  // 블록 단축키 (#5): 선택된 블록에 Backspace/Delete=삭제, Esc=선택해제, 방향키=이동
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (!selectedId) return;
      const t = e.target as HTMLElement | null;
      if (
        t &&
        (t.isContentEditable ||
          t.tagName === "INPUT" ||
          t.tagName === "TEXTAREA" ||
          t.tagName === "SELECT")
      ) {
        return; // 입력 중에는 무시
      }
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
  }, [selectedId, doc.blocks, handleRemove, handleGeometry]);

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
    await handleSave();
    const target = navTarget;
    setNavTarget(null);
    if (target) router.push(target);
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
            <DocumentStatusControl
              documentId={documentId}
              status={initialStatus}
            />
          </div>
          <EditorToolbar
            documentId={documentId}
            dirty={dirty}
            saving={saving}
            onSave={handleSave}
            pages={doc.canvas.pages ?? 1}
            onAddPage={handleAddPage}
            onRemovePage={handleRemovePage}
            onPreview={() => setPreviewOpen(true)}
          />
        </div>
        <EditorCanvas
          doc={doc}
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
        />
      </div>
      <EditorSidebar
        tab={sidebarTab}
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
