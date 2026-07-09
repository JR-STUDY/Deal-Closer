"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import type {
  Block,
  BlockType,
  EditorDoc,
  ZOrderAction,
  CatalogOption,
} from "@/lib/editor-schema";
import { createBlock } from "@/lib/editor-schema";
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
  const [sidebarTab, setSidebarTab] = useState<"palette" | "inspector">(
    "palette",
  );
  const [dirty, setDirty] = useState(false);
  const [saving, setSaving] = useState(false);
  const [navTarget, setNavTarget] = useState<string | null>(null);
  const [catalog, setCatalog] = useState<CatalogOption[]>([]);
  const router = useRouter();

  // 카탈로그(마스터 데이터) 로드 — 품목표 드롭다운용 (#6)
  useEffect(() => {
    let alive = true;
    fetch("/api/catalog")
      .then((r) => r.json())
      .then((d) => {
        if (alive && Array.isArray(d?.data)) setCatalog(d.data);
      })
      .catch(() => {});
    return () => {
      alive = false;
    };
  }, []);

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
      const block = createBlock(type, pos);
      setDoc((d) => ({ ...d, blocks: [...d.blocks, block] }));
      setSelectedId(block.id);
      setSidebarTab("inspector");
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
      <div className="flex flex-1 overflow-hidden">
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
          onSelect={handleSelect}
          onGeometry={handleGeometry}
          onAddBlock={handleAdd}
          onRemove={handleRemove}
          onZOrder={handleZOrder}
        />
      </div>
      <EditorSidebar
        tab={sidebarTab}
        onTabChange={(v) => setSidebarTab(v as "palette" | "inspector")}
        onAdd={handleAdd}
        catalog={catalog}
        block={selectedBlock}
        onChange={handleChangeBlock}
        onChangeProps={handleChangeProps}
        onRemove={handleRemove}
        onZOrder={handleZOrderSelected}
      />
      </div>

      <Dialog
        open={navTarget !== null}
        onOpenChange={(o) => {
          if (!o) setNavTarget(null);
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>저장하지 않은 변경사항이 있습니다</DialogTitle>
            <DialogDescription>
              이 페이지를 떠나기 전에 변경사항을 저장하시겠습니까?
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setNavTarget(null)}>
              취소
            </Button>
            <Button variant="outline" onClick={discardAndGo}>
              저장 안 함
            </Button>
            <Button onClick={saveAndGo} disabled={saving}>
              {saving ? "저장 중…" : "저장 후 이동"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
