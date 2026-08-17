"use client";

import { memo, useEffect, useRef } from "react";
import { Rnd } from "react-rnd";
import type { Block, ZOrderAction } from "@/lib/editor-schema";
import { BLOCK_LABELS } from "@/lib/editor-schema";
import {
  ContextMenu,
  ContextMenuTrigger,
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuSeparator,
} from "@/components/ui/context-menu";
import { Pencil, Trash2, AlertTriangle } from "lucide-react";
import { RenderBlock, isInlineEditable } from "./blocks";
import { useOverflow } from "./use-overflow";

export type Geometry = { x: number; y: number; w: number; h: number };

type Props = {
  block: Block;
  /** 본문이 잠긴 문서 — 선택·미리보기는 되지만 옮기고 고칠 수는 없다 (진단 3) */
  locked: boolean;
  selected: boolean;
  /** `additive` 면 선택에 더하거나 뺀다 (⇧·⌘ 클릭) */
  onSelect: (id: string, additive: boolean) => void;
  onRemove: (id: string) => void;
  onZOrder: (id: string, action: ZOrderAction) => void;
  onEdit: (id: string) => void;
  onDragMove: (block: Block, x: number, y: number) => void;
  onDragEnd: (block: Block, x: number, y: number) => void;
  /** 잘린 내용에 맞춰 블록 높이를 늘린다 (진단 4) */
  onFit: (id: string, contentHeight: number) => void;
  /** 잘림 여부를 부모에 보고한다 — 툴바가 "잘린 블록 N개" 를 세고 저장 시 알린다 */
  onClippedChange: (id: string, clipped: boolean) => void;
  /** 캔버스에서 직접 편집 중인 블록 id (진단 5) */
  editingId: string | null;
  onEditingChange: (id: string | null) => void;
  /** 인라인 편집 결과 저장 */
  onInlineCommit: (id: string, text: string) => void;
  /**
   * 캔버스 확대 배율. Rnd 에 넘기지 않으면 확대 상태에서 마우스 이동량과 블록 이동량이
   * 어긋나 블록이 커서를 따라오지 않는다.
   */
  scale: number;
  /** 캔버스 크기(문서 좌표) — 리사이즈가 캔버스를 넘지 않게 가둔다 */
  canvas: { w: number; h: number };
  /** 리사이즈 중 정렬 가이드 · 놓을 때 스냅 (진단 5) */
  onResizeMove: (block: Block, geo: Geometry) => void;
  onResizeEnd: (block: Block, geo: Geometry) => void;
  /** 블록 복제·복사 (진단 5) */
  onDuplicate: (id: string) => void;
  onCopy: (id: string) => void;
};

function CanvasBlockImpl({
  block,
  locked,
  selected,
  onSelect,
  onRemove,
  onZOrder,
  onEdit,
  onDragMove,
  onDragEnd,
  onFit,
  onClippedChange,
  editingId,
  onEditingChange,
  onInlineCommit,
  scale,
  canvas,
  onResizeMove,
  onResizeEnd,
  onDuplicate,
  onCopy,
}: Props) {
  const editing = editingId === block.id;
  const canInlineEdit = !locked && isInlineEditable(block);
  /*
   * ⇧클릭으로 선택에서 **뺄 때** 이 드래그를 무시한다.
   * Rnd 는 mousedown 에 이미 드래그를 시작하므로, 선택에서 빼려던 클릭이 조금만 흔들려도
   * 블록이 함께 움직인다. 놓을 때까지 이 제스처의 이동을 버린다(위치는 controlled prop
   * 이라 다시 그려지며 제자리로 돌아온다).
   */
  const suppressDragRef = useRef(false);
  /*
   * 이미 골라 둔 블록을 (수식키 없이) 누르면 **선택을 무너뜨리지 않는다** —
   * 그래야 3개를 골라 두고 그중 하나를 끌어 그룹째 옮길 수 있다.
   * 움직이지 않고 놓으면(=클릭) 그때 그 블록만 남긴다.
   */
  const collapseOnClickRef = useRef(false);
  // 내용이 상자를 넘쳤는지 — 상자 변화는 관측자가, 내용 변화는 block 이 잡는다
  const [overflowRef, overflow] = useOverflow(block);

  // 잘림 상태가 바뀔 때만 부모에 알린다 (부모는 개수를 세고 저장 시 안내한다)
  useEffect(() => {
    onClippedChange(block.id, overflow.clipped);
  }, [block.id, overflow.clipped, onClippedChange]);

  // 블록이 사라질 때 집계에서도 빠져야 한다 — 안 그러면 유령 경고가 남는다
  useEffect(
    () => () => onClippedChange(block.id, false),
    [block.id, onClippedChange],
  );

  return (
    <Rnd
      size={{ width: block.w, height: block.h }}
      position={{ x: block.x, y: block.y }}
      /*
       * bounds="parent" 는 쓰지 않는다 — 확대 배율이 걸리면 react-rnd 가 경계를
       * 배율 적용 크기로 재고 위치는 문서 좌표로 비교해, 150% 에서 블록이 아예
       * 움직이지 않았다. 경계는 놓는 순간 editor-canvas 가 문서 좌표로 클램프한다.
       */
      scale={scale}
      disableDragging={locked || editing}
      enableResizing={!locked}
      dragHandleClassName="block-drag-handle"
      onMouseDown={(e) => {
        const additive = e.shiftKey || e.metaKey || e.ctrlKey;
        suppressDragRef.current = additive && selected;
        collapseOnClickRef.current = false;
        if (additive) {
          onSelect(block.id, true);
        } else if (selected) {
          // 선택을 그대로 두고 드래그를 기다린다 (놓을 때 클릭이면 이 블록만 남긴다)
          collapseOnClickRef.current = true;
        } else {
          onSelect(block.id, false);
        }
      }}
      onDrag={(_e, d) => {
        if (suppressDragRef.current) return;
        onDragMove(block, d.x, d.y);
      }}
      onDragStop={(_e, d) => {
        if (suppressDragRef.current) {
          suppressDragRef.current = false;
          return;
        }
        const moved =
          Math.round(d.x) !== block.x || Math.round(d.y) !== block.y;
        if (!moved && collapseOnClickRef.current) {
          onSelect(block.id, false);
        }
        collapseOnClickRef.current = false;
        onDragEnd(block, d.x, d.y);
      }}
      onResize={(_e, _dir, ref, _delta, pos) =>
        onResizeMove(block, {
          x: pos.x,
          y: pos.y,
          w: ref.offsetWidth,
          h: ref.offsetHeight,
        })
      }
      onResizeStop={(_e, _dir, ref, _delta, pos) => {
        // bounds 를 쓰지 않으므로(배율 충돌) 캔버스 안으로 가두는 일을 여기서 한다
        const x = Math.max(0, Math.round(pos.x));
        const y = Math.max(0, Math.round(pos.y));
        onResizeEnd(block, {
          x,
          y,
          w: Math.max(8, Math.min(ref.offsetWidth, canvas.w - x)),
          h: Math.max(8, Math.min(ref.offsetHeight, canvas.h - y)),
        });
      }}
      style={{ zIndex: block.z }}
      className={
        overflow.clipped
          ? "outline outline-2 outline-dashed outline-amber-500"
          : selected
            ? "outline outline-2 outline-primary"
            : "outline outline-1 outline-transparent hover:outline-border"
      }
    >
      <div className="group relative h-full w-full">
        {/* 내용이 잘렸다는 표시 + 한 번에 맞추기 (진단 4).
            색만으로 구분하지 않는다 — 점선 외곽선·경고 아이콘·문구를 함께 쓴다 (ACC_*) */}
        {overflow.clipped ? (
          <div
            className="absolute -bottom-3 left-0 z-20 flex items-center gap-1 rounded bg-amber-500 px-1.5 py-0.5 text-[10px] font-medium text-amber-950 shadow"
            onMouseDown={(e) => e.stopPropagation()}
          >
            <AlertTriangle className="size-3" aria-hidden />
            <span>내용이 잘렸습니다</span>
            {locked ? null : (
              <button
                type="button"
                className="rounded bg-amber-950/15 px-1 underline-offset-2 hover:underline"
                onClick={() => onFit(block.id, overflow.contentHeight)}
              >
                맞추기
              </button>
            )}
          </div>
        ) : null}

        {/* 블록 액션 아이콘 (선택/hover 시 노출) — 드래그와 겹치지 않게 mousedown 전파 차단 */}
        <div
          className={`absolute -top-3 right-0 z-20 gap-1 ${
            locked ? "hidden" : selected ? "flex" : "hidden group-hover:flex"
          }`}
          onMouseDown={(e) => e.stopPropagation()}
        >
          <button
            type="button"
            aria-label="블록 수정"
            title="수정"
            onClick={() => onEdit(block.id)}
            /* 정책 ACC_*: 터치 타깃 44px. 아이콘은 작게 두고 히트 영역만 넓힌다 —
               버튼 자체를 44px 로 키우면 작은 블록을 덮어 내용이 안 보인다. */
            className="relative flex size-6 items-center justify-center rounded bg-primary text-primary-foreground shadow before:absolute before:-inset-[10px] before:content-[''] hover:opacity-90"
          >
            <Pencil className="size-3.5" />
          </button>
          <button
            type="button"
            aria-label="블록 삭제"
            title="삭제"
            onClick={() => onRemove(block.id)}
            className="relative flex size-6 items-center justify-center rounded bg-destructive text-white shadow before:absolute before:-inset-[10px] before:content-[''] hover:opacity-90"
          >
            <Trash2 className="size-3.5" />
          </button>
        </div>
        <ContextMenu>
          <ContextMenuTrigger asChild>
            <div
              ref={overflowRef}
              data-block-id={block.id}
              /*
               * 캔버스는 블록을 고르는 목록이고 각 블록은 그 항목이다 (role=listbox/option).
               * 예전에는 role="button" 이었는데 ① 누르는 것이 아니라 **고르는** 것이라
               * 의미가 맞지 않고 ② 실제 <button> 으로 바꿀 수도 없다 — 블록 안에 표·이미지가
               * 들어가 대화형 요소 중첩이 된다. option 은 선택 상태(aria-selected)까지 전한다.
               */
              role="option"
              aria-selected={selected}
              tabIndex={0}
              aria-label={`${BLOCK_LABELS[block.type]} 블록`}
              /*
               * Tab 으로 옮겨 온 포커스는 하나씩 보는 동작이므로 **단일 선택**으로 바꾼다.
               * 다만 마우스 클릭도 포커스를 만드는데, 그때는 바로 위 `onMouseDown` 이 이미
               * (⇧ 여부까지 반영해) 선택을 정했다 — 여기서 다시 단일 선택으로 덮으면
               * ⇧클릭이 **더하지 않고 교체**된다. `:focus-visible` 은 키보드 포커스에만
               * 붙으므로(마우스 클릭에는 붙지 않는다) 그 차이를 이 조건으로 가른다.
               */
              onFocus={(e) => {
                if (!e.currentTarget.matches(":focus-visible")) return;
                onSelect(block.id, false);
              }}
              onDoubleClick={() => {
                if (canInlineEdit) onEditingChange(block.id);
              }}
              className={`block-drag-handle h-full w-full overflow-hidden bg-background outline-none ${
                editing ? "cursor-text" : locked ? "cursor-default" : "cursor-move"
              }`}
            >
              <RenderBlock
                block={block}
                editing={editing}
                onCommit={(text) => {
                  onInlineCommit(block.id, text);
                  onEditingChange(null);
                }}
                onCancel={() => onEditingChange(null)}
              />
            </div>
          </ContextMenuTrigger>
        {/* 잠긴 문서에서는 편집 메뉴를 내놓지 않는다 — 눌러도 막히는 항목을 보여주지 않는다 */}
        {locked ? null : (
        <ContextMenuContent>
          <ContextMenuItem onSelect={() => onEdit(block.id)}>
            수정
          </ContextMenuItem>
          <ContextMenuItem onSelect={() => onDuplicate(block.id)}>
            복제 <span className="ml-auto text-xs text-muted-foreground">⌘D</span>
          </ContextMenuItem>
          <ContextMenuItem onSelect={() => onCopy(block.id)}>
            복사 <span className="ml-auto text-xs text-muted-foreground">⌘C</span>
          </ContextMenuItem>
          <ContextMenuSeparator />
          <ContextMenuItem onSelect={() => onZOrder(block.id, "front")}>
            맨 앞으로
          </ContextMenuItem>
          <ContextMenuItem onSelect={() => onZOrder(block.id, "forward")}>
            앞으로
          </ContextMenuItem>
          <ContextMenuItem onSelect={() => onZOrder(block.id, "backward")}>
            뒤로
          </ContextMenuItem>
          <ContextMenuItem onSelect={() => onZOrder(block.id, "back")}>
            맨 뒤로
          </ContextMenuItem>
          <ContextMenuSeparator />
          <ContextMenuItem
            className="text-destructive"
            onSelect={() => onRemove(block.id)}
          >
            삭제
          </ContextMenuItem>
        </ContextMenuContent>
        )}
      </ContextMenu>
      </div>
    </Rnd>
  );
}

export const CanvasBlock = memo(CanvasBlockImpl);
