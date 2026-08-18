"use client";

import { useCallback, useState } from "react";
import { toast } from "sonner";
import { Lock } from "lucide-react";
import type { EditorDoc, CatalogOption } from "@/lib/editor-schema";
import type { DocumentEditLock } from "@/lib/document-edit";
import type { AiModelOption } from "@/lib/ai/models";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { EditorCanvas } from "./editor-canvas";
import { EditorSidebar } from "./editor-sidebar";
import { EditorToolbar } from "./editor-toolbar";
import { EditorPreview } from "./editor-preview";
import { DocumentStatusControl } from "./document-status-control";
import { DocumentVersionControl } from "./document-version-control";
import { useDocHistory } from "./use-doc-history";
import { useCreateVersion } from "./use-create-version";
import { useClippedBlocks } from "./use-clipped-blocks";
import { useBlockClipboard } from "./use-block-clipboard";
import { useBlockLibrary } from "./use-block-library";
import { useDocumentSave } from "./use-document-save";
import { useEditorShortcuts } from "./use-editor-shortcuts";
import { useBlockEditing } from "./use-block-editing";
import { useBlockSelection } from "./use-block-selection";
import type { EditTarget } from "./blocks";
import {
  BaseBlockDialog,
  BlockEditDialog,
  NamePromptDialog,
  UnsavedChangesDialog,
  ZeroAmountDialog,
} from "./editor-dialogs";

/**
 * 블록 캔버스 에디터 본체.
 *
 * 이 컴포넌트가 하는 일은 **문서 상태를 들고 편집 동작을 배선하는 것**뿐이다.
 * 곁가지는 각각 훅·컴포넌트로 나뉘어 있다.
 *  - `use-doc-history` 되돌리기 · `use-document-save` 저장·이탈
 *  - `use-clipped-blocks` 잘림 감지·맞추기 · `use-block-clipboard` 복제·복사
 *  - `use-block-library` 내 블록·템플릿(localStorage) · `use-editor-shortcuts` 단축키
 *  - `editor-dialogs` 다이얼로그 5개
 *
 * 문서를 바꾸는 모든 경로는 `editDoc` 한 곳을 지난다 (잠금 판정 + 미저장 표시).
 */

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
  const [sidebarTab, setSidebarTab] = useState<"palette" | "inspector">(
    "palette",
  );
  /** 캔버스에서 직접 편집 중인 대상 (더블클릭 진입) — 블록 전체 또는 표의 한 칸 */
  const [editTarget, setEditTarget] = useState<EditTarget | null>(null);
  /*
   * 미저장 표시는 **본체가 들고 있다.** 저장 훅에 두면 순환이 생긴다 —
   * editDoc 이 setDirty 를 쓰고, 저장 훅은 잘린 블록 수를 쓰고,
   * 잘림 훅은 다시 editDoc 을 쓴다. 가장 바깥 값인 dirty 를 여기 두어 고리를 끊는다.
   */
  const [dirty, setDirty] = useState(false);
  /** 확대 배율 — "fit" 은 보이는 폭에 맞춘다. 794px 캔버스는 1280 폭에서 넘친다 */
  const [zoom, setZoom] = useState<number | "fit">("fit");
  const [previewOpen, setPreviewOpen] = useState(false);
  const [editModalOpen, setEditModalOpen] = useState(false);

  const locked = lock.locked;

  // 선택 상태 (다중선택) — 무엇을 골랐는지만 안다, 문서는 바꾸지 않는다
  const showInspector = useCallback(() => setSidebarTab("inspector"), []);
  const {
    selectedIds,
    setSelectedIds,
    selectedBlock,
    select: handleSelect,
    selectMany: handleSelectMany,
    selectAll: handleSelectAll,
    clear: deselect,
    targetsFrom,
  } = useBlockSelection({ blocks: doc.blocks, onShowInspector: showInspector });

  /*
   * 문서를 바꾸는 **유일한 통로**.
   * 잠긴 문서(발송·계약완료·확정본·폐기)는 여기서 막는다 — 핸들러마다 검사를 흩어 두면
   * 하나를 빠뜨렸을 때 그 경로로만 조용히 편집된다. UI 비활성은 안내이고, 실제 방어선은
   * 이 래퍼와 서버의 PATCH 판정이다.
   */
  const editDoc = useCallback(
    (
      updater: (previous: EditorDoc) => EditorDoc,
      options?: { coalesceKey?: string },
    ) => {
      if (locked) {
        toast.error(lock.reason);
        return;
      }
      setDoc(updater, options);
      setDirty(true);
    },
    [locked, lock.reason, setDoc],
  );

  /** 되돌리기·다시 실행 — 저장된 내용과 달라지므로 미저장 상태로 표시한다 */
  const handleUndo = useCallback(() => {
    undo();
    setDirty(true);
  }, [undo]);

  const handleRedo = useCallback(() => {
    redo();
    setDirty(true);
  }, [redo]);

  // 잘린 블록 집계 · 맞추기 (진단 4) — 저장 알림이 개수를 쓰므로 저장 훅보다 앞에 온다
  const {
    clippedCount,
    handleClippedChange,
    handleFit,
    handleFitAll,
    handleFitSelected,
  } = useClippedBlocks({ doc, editDoc });

  // 저장 · 미저장 이탈 (진단 1·3)
  const save = useDocumentSave({
    documentId,
    doc,
    docTitle,
    initialAmount,
    locked,
    lockReason: lock.reason,
    clippedCount,
    dirty,
    setDirty,
  });

  // 내 블록 · 템플릿 · 기본 블록 속성 (localStorage)
  const {
    customBlocks,
    templates,
    baseDefaultsFor,
    handleSaveAsCustom,
    handleDeleteCustomBlock,
    handleSaveTemplate,
    handleDeleteTemplate,
    editBase,
    handleEditBase,
    patchEditBase,
    saveEditBase,
    closeEditBase,
    namePrompt,
    nameValue,
    setNameValue,
    confirmName,
    closeNamePrompt,
  } = useBlockLibrary({ doc, docTitle, selectedBlock });

  /** 새로 만든 블록을 선택해 바로 고칠 수 있게 한다 (복제·붙여넣기는 여러 개다) */
  const handleInserted = useCallback(
    (ids: string[]) => {
      setSelectedIds(ids);
      showInspector();
    },
    [setSelectedIds, showInspector],
  );

  // 복제 · 복사/붙여넣기 (진단 5)
  const {
    duplicate: handleDuplicate,
    copy: handleCopy,
    paste: handlePaste,
  } = useBlockClipboard({ doc, editDoc, onInserted: handleInserted });

  // 블록 편집 동작 (추가·이동·속성·삭제·겹침 순서·페이지·템플릿)
  const {
    setViewTop,
    handleAdd,
    handleAddCustomBlock,
    handleGeometry,
    handleChangeBlock,
    handleChangeProps,
    handleInlineCommit,
    handleCellCommit,
    handleItemCommit,
    handleResizeColumn,
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
  } = useBlockEditing({
    editDoc,
    replaceDoc,
    locked,
    lockReason: lock.reason,
    selectedIds,
    setSelectedIds,
    setDirty,
    onInserted: handleInserted,
    baseDefaultsFor,
  });

  /** 연필 아이콘·컨텍스트 메뉴의 "수정" — 그 블록만 대상으로 삼는다 */
  const handleEditBlock = useCallback(
    (id: string) => {
      setSelectedIds([id]);
      setEditModalOpen(true);
    },
    [setSelectedIds],
  );

  const handleTitleChange = useCallback(
    (v: string) => {
      if (locked) return;
      setDocTitle(v);
      setDirty(true);
    },
    [locked],
  );

  /* 단축키·아이콘·메뉴가 쓰는 얇은 래퍼 — 대상 목록(선택 or 누른 블록)만 정해 넘긴다 */
  const duplicateSelected = useCallback(
    () => handleDuplicate(selectedIds),
    [handleDuplicate, selectedIds],
  );
  const copySelected = useCallback(
    () => handleCopy(selectedIds),
    [handleCopy, selectedIds],
  );
  const removeSelected = useCallback(
    () => handleRemoveMany(selectedIds),
    [handleRemoveMany, selectedIds],
  );
  const removeFrom = useCallback(
    (id: string) => handleRemoveMany(targetsFrom(id)),
    [handleRemoveMany, targetsFrom],
  );
  const duplicateFrom = useCallback(
    (id: string) => handleDuplicate(targetsFrom(id)),
    [handleDuplicate, targetsFrom],
  );
  const copyFrom = useCallback(
    (id: string) => handleCopy(targetsFrom(id)),
    [handleCopy, targetsFrom],
  );
  const fitSelected = useCallback(
    () => handleFitSelected(selectedIds),
    [handleFitSelected, selectedIds],
  );
  /** 방향키 연속 이동은 한 건으로 묶는다 — 글자마다 되돌아가면 되돌리기가 쓸모없다 */
  const translateSelected = useCallback(
    (dx: number, dy: number) => handleTranslate(dx, dy, "move:selection"),
    [handleTranslate],
  );

  useEditorShortcuts({
    // 표 칸을 고치는 중에도 캔버스 단축키는 양보해야 한다 (Backspace 가 블록을 지운다)
    editingId: editTarget?.blockId ?? null,
    selectedIds,
    blocks: doc.blocks,
    onUndo: handleUndo,
    onRedo: handleRedo,
    onPaste: handlePaste,
    onSelectAll: handleSelectAll,
    onDuplicate: duplicateSelected,
    onCopy: copySelected,
    onRemove: removeSelected,
    onDeselect: deselect,
    onTranslate: translateSelected,
  });

  /** AI 재작성·새 버전 저장 입력으로 쓰는 현재 본문 스냅샷 */
  const getContentJson = useCallback(() => JSON.stringify(doc), [doc]);

  /*
   * 잠긴 문서를 고치는 **유일한 길** — 지금 내용을 새 버전(초안)으로 떠서 그리로 이동한다.
   * 버전 이력 다이얼로그의 "새 버전으로 저장"과 같은 훅을 써 동작·문구를 맞춘다.
   */
  const { createVersion, saving: creatingVersion } = useCreateVersion({
    documentId,
    getContentJson,
    onNavigate: save.goToVersion,
  });

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
                onNavigate={save.goToVersion}
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
              saving={save.saving}
              onSave={save.handleSave}
              canUndo={canUndo}
              canRedo={canRedo}
              onUndo={handleUndo}
              onRedo={handleRedo}
              clippedCount={clippedCount}
              onFitAll={handleFitAll}
              zoom={zoom}
              onZoomChange={setZoom}
              pages={doc.canvas.pages ?? 1}
              onAddPage={handleAddPage}
              onRemovePage={handleRemovePage}
              onPreview={() => setPreviewOpen(true)}
              getContentJson={getContentJson}
              onRevised={save.goToVersion}
              models={models}
              defaultModel={defaultModel}
              mockProvider={mockProvider}
            />
          </div>

          <EditorCanvas
            doc={doc}
            locked={locked}
            selectedIds={selectedIds}
            onSelect={handleSelect}
            onSelectMany={handleSelectMany}
            onGeometry={handleGeometry}
            onTranslateSelected={handleTranslate}
            onAddBlock={handleAdd}
            onRemove={removeFrom}
            onZOrder={handleZOrder}
            onEdit={handleEditBlock}
            onViewTop={setViewTop}
            onFit={handleFit}
            onClippedChange={handleClippedChange}
            editTarget={editTarget}
            onEditingChange={setEditTarget}
            onInlineCommit={handleInlineCommit}
            onCellCommit={handleCellCommit}
            onItemCommit={handleItemCommit}
            onResizeColumn={handleResizeColumn}
            zoom={zoom}
            onDuplicate={duplicateFrom}
            onCopy={copyFrom}
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
          selectedCount={selectedIds.length}
          onChange={handleChangeBlock}
          onChangeProps={handleChangeProps}
          onRemove={handleRemove}
          onZOrder={handleZOrderSelected}
          onAlign={handleAlign}
          onDistribute={handleDistribute}
          onRemoveSelected={removeSelected}
          onFitSelected={fitSelected}
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

      <UnsavedChangesDialog
        open={save.navTarget !== null}
        saving={save.saving}
        onOpenChange={(open) => {
          if (!open) save.closeNavPrompt();
        }}
        onSave={save.saveAndGo}
        onDiscard={save.discardAndGo}
      />

      <ZeroAmountDialog
        warning={save.zeroWarning}
        onOpenChange={(open) => {
          if (!open) save.closeZeroWarning();
        }}
        onConfirm={save.confirmZeroSave}
      />

      <EditorPreview
        open={previewOpen}
        onOpenChange={setPreviewOpen}
        doc={doc}
        title={docTitle}
      />

      <NamePromptDialog
        label={namePrompt?.label ?? null}
        value={nameValue}
        onValueChange={setNameValue}
        onConfirm={confirmName}
        onOpenChange={(open) => {
          if (!open) closeNamePrompt();
        }}
      />

      <BlockEditDialog
        open={editModalOpen}
        onOpenChange={setEditModalOpen}
        block={selectedBlock}
        catalog={catalog}
        readOnly={locked}
        readOnlyReason={lock.reason}
        onChange={handleChangeBlock}
        onChangeProps={handleChangeProps}
        onRemove={handleRemove}
        onZOrder={handleZOrderSelected}
        onSaveAsCustom={handleSaveAsCustom}
      />

      <BaseBlockDialog
        editBase={editBase}
        catalog={catalog}
        onChangeProps={patchEditBase}
        onSave={saveEditBase}
        onOpenChange={(open) => {
          if (!open) closeEditBase();
        }}
      />
    </>
  );
}
