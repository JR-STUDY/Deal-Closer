"use client";

import {
  BLOCK_LABELS,
  type AnyBlockProps,
  type Block,
  type BlockType,
  type CatalogOption,
  type ZOrderAction,
} from "@/lib/editor-schema";
import { formatKRW } from "@/lib/format";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
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
import { BlockInspector, ContentForm } from "./block-inspector";
import type { ZeroAmountWarning } from "./use-document-save";

/**
 * 에디터의 다이얼로그 모음 — 본체(`document-editor`)에서 분리한 표시 전용 컴포넌트다.
 *
 * 상태는 모두 부모(또는 부모가 쓰는 훅)가 들고 있고 여기서는 그리고 알리기만 한다.
 * 캔버스·툴바 로직과 다이얼로그 JSX 가 한 파일에 섞여 있어 본체를 읽기 어려웠다.
 */

/** 미저장 이탈 확인 (정책 STATE_) */
export function UnsavedChangesDialog({
  open,
  saving,
  onOpenChange,
  onSave,
  onDiscard,
}: {
  open: boolean;
  saving: boolean;
  onOpenChange: (open: boolean) => void;
  onSave: () => void;
  onDiscard: () => void;
}) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader className="gap-6">
          <DialogTitle>저장하지 않은 변경사항이 있습니다</DialogTitle>
          <DialogDescription>
            이 페이지를 떠나기 전에 변경사항을 저장하시겠습니까?
          </DialogDescription>
        </DialogHeader>
        <DialogFooter className="p-3">
          <Button variant="outline" onClick={onDiscard}>
            저장하지 않음
          </Button>
          <Button onClick={onSave} disabled={saving}>
            {saving ? "저장 중…" : "저장"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

/**
 * 금액이 사라지는 저장 확인 (기회-6).
 * 되돌릴 수 없는 조작이므로 **바뀔 금액을 미리 말한다.**
 */
export function ZeroAmountDialog({
  warning,
  onOpenChange,
  onConfirm,
}: {
  warning: ZeroAmountWarning | null;
  onOpenChange: (open: boolean) => void;
  onConfirm: () => void;
}) {
  return (
    <AlertDialog open={warning !== null} onOpenChange={onOpenChange}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>금액이 ₩0 으로 저장됩니다</AlertDialogTitle>
          <AlertDialogDescription>
            품목표가 비어 있어 이 문서의 금액이 {formatKRW(warning?.from ?? 0)} 에서
            ₩0 으로 바뀝니다. 이 문서가 연결된 기회의 확정 문서라면 예상 금액도 ₩0 이
            됩니다. 그대로 저장하시겠습니까?
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>취소</AlertDialogCancel>
          <AlertDialogAction onClick={onConfirm}>₩0 으로 저장</AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}

/** 이름 입력 (내 블록·템플릿 저장 공용) */
export function NamePromptDialog({
  label,
  value,
  onValueChange,
  onConfirm,
  onOpenChange,
}: {
  /** null 이면 닫힘 */
  label: string | null;
  value: string;
  onValueChange: (value: string) => void;
  onConfirm: () => void;
  onOpenChange: (open: boolean) => void;
}) {
  return (
    <Dialog open={label !== null} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-sm">
        <DialogHeader>
          <DialogTitle>{label ?? "이름"}</DialogTitle>
        </DialogHeader>
        <Input
          autoFocus
          value={value}
          onChange={(e) => onValueChange(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") onConfirm();
          }}
          placeholder="이름을 입력하세요"
        />
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            취소
          </Button>
          <Button onClick={onConfirm} disabled={!value.trim()}>
            저장
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

/** 블록 수정 모달 — 캔버스 블록의 연필 아이콘·컨텍스트 메뉴에서 진입 */
export function BlockEditDialog({
  open,
  onOpenChange,
  block,
  catalog,
  readOnly,
  readOnlyReason,
  onChange,
  onChangeProps,
  onRemove,
  onZOrder,
  onSaveAsCustom,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  block: Block | null;
  catalog: CatalogOption[];
  readOnly: boolean;
  readOnlyReason: string;
  onChange: (patch: Partial<Block>) => void;
  onChangeProps: (patch: Record<string, unknown>) => void;
  onRemove: (id: string) => void;
  onZOrder: (action: ZOrderAction) => void;
  onSaveAsCustom: () => void;
}) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="flex max-h-[85vh] flex-col overflow-hidden sm:max-w-md">
        <DialogHeader>
          <DialogTitle>블록 수정</DialogTitle>
        </DialogHeader>
        <div className="min-h-0 flex-1 overflow-auto">
          <BlockInspector
            readOnly={readOnly}
            readOnlyReason={readOnlyReason}
            block={block}
            catalog={catalog}
            onChange={onChange}
            onChangeProps={onChangeProps}
            onRemove={(id) => {
              onRemove(id);
              onOpenChange(false);
            }}
            onZOrder={onZOrder}
            onSaveAsCustom={onSaveAsCustom}
          />
        </div>
      </DialogContent>
    </Dialog>
  );
}

/**
 * 기본 블록 수정 모달 (#3) — '블록 추가' 탭에서 진입해 **타입별 기본 속성**을 편집한다.
 * 실제 문서 블록이 아니라 앞으로 추가할 블록의 기본값이므로 좌표는 의미가 없다.
 */
export function BaseBlockDialog({
  editBase,
  catalog,
  onChangeProps,
  onSave,
  onOpenChange,
}: {
  /** null 이면 닫힘 */
  editBase: { type: BlockType; props: AnyBlockProps } | null;
  catalog: CatalogOption[];
  onChangeProps: (patch: Record<string, unknown>) => void;
  onSave: () => void;
  onOpenChange: (open: boolean) => void;
}) {
  return (
    <Dialog open={editBase !== null} onOpenChange={onOpenChange}>
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
              onChangeProps={onChangeProps}
            />
          ) : null}
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            취소
          </Button>
          <Button onClick={onSave}>저장</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
