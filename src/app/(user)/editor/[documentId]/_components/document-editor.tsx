"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import type {
  Block,
  BlockType,
  EditorDoc,
  ZOrderAction,
} from "@/lib/editor-schema";
import { createBlock } from "@/lib/editor-schema";
import { Input } from "@/components/ui/input";
import { EditorCanvas } from "./editor-canvas";
import type { Geometry } from "./canvas-block";
import { BlockPalette } from "./block-palette";
import { BlockInspector } from "./block-inspector";
import { EditorToolbar } from "./editor-toolbar";

type Props = {
  documentId: string;
  initialTitle: string;
  initialDoc: EditorDoc;
};

export function DocumentEditor({
  documentId,
  initialTitle,
  initialDoc,
}: Props) {
  const [doc, setDoc] = useState<EditorDoc>(initialDoc);
  const [docTitle, setDocTitle] = useState(initialTitle);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [dirty, setDirty] = useState(false);
  const [saving, setSaving] = useState(false);

  const selectedBlock = useMemo(
    () => doc.blocks.find((b) => b.id === selectedId) ?? null,
    [doc.blocks, selectedId],
  );

  const handleAdd = useCallback(
    (type: BlockType, pos?: { x: number; y: number }) => {
      const block = createBlock(type, pos);
      setDoc((d) => ({ ...d, blocks: [...d.blocks, block] }));
      setSelectedId(block.id);
      setDirty(true);
    },
    [],
  );

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

  const handleTitleChange = useCallback((v: string) => {
    setDocTitle(v);
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

  return (
    <div className="flex flex-1 overflow-hidden">
      <BlockPalette onAdd={handleAdd} />
      <div className="flex flex-1 flex-col overflow-hidden">
        <div className="flex items-center justify-between gap-3 border-b bg-background px-4 py-2">
          <Input
            value={docTitle}
            onChange={(e) => handleTitleChange(e.target.value)}
            aria-label="문서 제목"
            placeholder="문서 제목"
            className="max-w-md font-medium"
          />
          <EditorToolbar
            documentId={documentId}
            dirty={dirty}
            saving={saving}
            onSave={handleSave}
          />
        </div>
        <EditorCanvas
          doc={doc}
          selectedId={selectedId}
          onSelect={setSelectedId}
          onGeometry={handleGeometry}
          onAddBlock={handleAdd}
          onRemove={handleRemove}
          onZOrder={handleZOrder}
        />
      </div>
      <BlockInspector
        block={selectedBlock}
        onChange={handleChangeBlock}
        onChangeProps={handleChangeProps}
        onRemove={handleRemove}
        onZOrder={handleZOrderSelected}
      />
    </div>
  );
}
