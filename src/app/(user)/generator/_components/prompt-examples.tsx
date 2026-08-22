"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import {
  Copy,
  Loader2,
  MessageSquareText,
  Pencil,
  Plus,
  Settings2,
  Trash2,
} from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  DEFAULT_PROMPT_PRESETS,
  PROMPT_PRESET_LIMIT_MESSAGE,
  PROMPT_PRESET_MAX_LENGTH,
  canAddPromptPreset,
  parsePromptPreset,
  promptPresetItems,
  type PromptPresetDTO,
} from "@/lib/prompt-preset";
import { cn } from "@/lib/utils";

/**
 * 예시 지시문 — 컴포저 **오른쪽**에 세로로 둔다.
 *
 * 예전에는 폼 카드 **아래**에 3열 카드로 있었다. 지시문을 적다가 예시를 보려면 아래로
 * 스크롤해야 했고, 카드가 커서 화면 한 뷰를 더 잡아먹었다. 예시는 "적는 동안 곁눈질하는 것"
 * 이므로 입력칸과 **같은 높이에** 있어야 한다.
 *
 * ## 기본 예시와 내 예시
 *
 * 기본 셋은 코드에 있어 **지울 수 없다**(`DEFAULT_PROMPT_PRESETS`) — 새 담당자가 무엇을
 * 어떻게 적는지 배우는 유일한 단서라, 지워질 수 있으면 빈 레일만 남는 날이 온다. 대신
 * 마음에 들지 않으면 **복사해서 내 예시로** 가져와 고친다(원본은 남는다).
 * 내 예시만 서버에 저장되고 자유롭게 고치거나 지운다. 화면은 둘을 구분해 그린다 —
 * 고칠 수 있는 것과 없는 것을 같게 보여 주면 왜 어떤 것에는 × 가 없는지 알 수 없다.
 *
 * 누르면 지시문을 **덮어쓴다**(이어붙이지 않는다) — 예시는 출발점이지 조각이 아니고,
 * 이어붙이면 두 지시가 섞인 문장이 만들어진다. 이미 적어 둔 내용이 있으면 확인을 받는다.
 */
export function PromptExamples({
  presets,
  onPick,
  hasDraft,
  disabled,
}: {
  /** 서버에서 내려온 내 예시 (기본 예시는 코드에 있다) */
  presets: PromptPresetDTO[];
  onPick: (example: string) => void;
  /** 지시문에 이미 적어 둔 내용이 있는지 — 덮어쓰기 전에 알린다 */
  hasDraft: boolean;
  disabled: boolean;
}) {
  const [isManaging, setIsManaging] = useState(false);
  const items = promptPresetItems(presets);

  const pick = (example: string) => {
    if (
      hasDraft &&
      !window.confirm("적어 두신 지시문을 예시로 바꿉니다. 계속하시겠습니까?")
    ) {
      return;
    }
    onPick(example);
  };

  return (
    <aside className="space-y-2" aria-labelledby="prompt-examples-heading">
      <div className="flex items-center gap-2">
        <h2
          id="prompt-examples-heading"
          className="flex items-center gap-1.5 text-xs font-medium text-muted-foreground"
        >
          <MessageSquareText className="size-3.5" aria-hidden="true" />
          이렇게 말해보세요
        </h2>
        <Button
          type="button"
          variant="ghost"
          size="sm"
          className="ml-auto h-7 px-2 text-xs"
          onClick={() => setIsManaging(true)}
        >
          <Settings2 className="size-3.5" aria-hidden="true" />
          편집
        </Button>
      </div>

      <ul className="space-y-1.5">
        {items.map((item) => (
          <li key={item.kind === "custom" ? item.id : `default-${item.text}`}>
            <button
              type="button"
              disabled={disabled}
              onClick={() => pick(item.text)}
              className={cn(
                "w-full rounded-md border px-3 py-2 text-left text-xs leading-relaxed transition-colors",
                "hover:border-primary/50 hover:bg-muted/50",
                "focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none",
                "disabled:cursor-not-allowed disabled:opacity-60",
                // 내 예시는 왼쪽 굵은 선으로 구분한다 — 색만으로 구분하지 않는다 (ACC_*)
                item.kind === "custom"
                  ? "border-l-2 border-l-primary bg-card"
                  : "bg-card",
              )}
            >
              {item.text}
            </button>
          </li>
        ))}
      </ul>

      {isManaging ? (
        <ManagePresetsDialog
          presets={presets}
          onClose={() => setIsManaging(false)}
        />
      ) : null}
    </aside>
  );
}

/**
 * 예시 관리 — 추가·수정·삭제.
 *
 * 레일이 좁아 항목마다 아이콘을 붙이면 문구가 두 글자씩 접힌다. 그래서 편집은 다이얼로그
 * 한 곳에서 하고 레일은 **누르면 쓰는** 자리로만 둔다.
 *
 * 다이얼로그 규칙(AGENTS.md): 껍데기는 `overflow-hidden`, 본문만 스크롤시킨다. 목록 높이가
 * 늘고 줄어드는 자리라 스크롤 상자를 **고정 높이**로 잡는다 — `max-h` 면 항목을 하나
 * 지울 때마다 다이얼로그가 위아래로 튄다(`LinkableDocumentPicker` 에서 배운 것과 같다).
 */
function ManagePresetsDialog({
  presets,
  onClose,
}: {
  presets: PromptPresetDTO[];
  onClose: () => void;
}) {
  const router = useRouter();
  const [draft, setDraft] = useState("");
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editingText, setEditingText] = useState("");
  const [busy, setBusy] = useState(false);

  const atLimit = !canAddPromptPreset(presets.length);

  /** 요청 하나를 보내고 결과를 화면에 반영한다 — 실패하면 이유를 그대로 알린다 */
  const send = async (
    input: RequestInfo,
    init: RequestInit,
    onDone: () => void,
  ) => {
    setBusy(true);
    try {
      const res = await fetch(input, init);
      const json = await res.json().catch(() => null);
      if (!res.ok) {
        toast.error(json?.error ?? "저장에 실패했습니다.");
        return;
      }
      onDone();
      // 서버 컴포넌트가 목록을 다시 내려 준다 — 화면과 저장값이 갈라지지 않게
      router.refresh();
    } catch {
      toast.error("네트워크 오류로 저장에 실패했습니다.");
    } finally {
      setBusy(false);
    }
  };

  const add = () => {
    const parsed = parsePromptPreset(draft, {
      existing: presets.map((preset) => preset.text),
    });
    if (!parsed.ok) {
      toast.error(parsed.error);
      return;
    }
    void send(
      "/api/prompt-presets",
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text: parsed.text }),
      },
      () => {
        setDraft("");
        toast.success("예시를 추가했습니다.");
      },
    );
  };

  const saveEdit = (id: string) => {
    const parsed = parsePromptPreset(editingText, {
      existing: presets.filter((p) => p.id !== id).map((p) => p.text),
    });
    if (!parsed.ok) {
      toast.error(parsed.error);
      return;
    }
    void send(
      `/api/prompt-presets/${id}`,
      {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text: parsed.text }),
      },
      () => {
        setEditingId(null);
        toast.success("예시를 수정했습니다.");
      },
    );
  };

  const remove = (preset: PromptPresetDTO) => {
    if (
      !window.confirm(
        `이 예시를 지웁니다. 되돌릴 수 없습니다.\n\n${preset.text.slice(0, 80)}`,
      )
    ) {
      return;
    }
    void send(
      `/api/prompt-presets/${preset.id}`,
      { method: "DELETE" },
      () => toast.success("예시를 지웠습니다."),
    );
  };

  /** 기본 예시를 내 예시로 가져온다 — 원본은 남는다 */
  const copyDefault = (text: string) => {
    setDraft(text);
    toast.info("아래 입력칸에 담았습니다. 고쳐서 추가해 주세요.");
  };

  return (
    <Dialog open onOpenChange={(next) => (next ? null : onClose())}>
      <DialogContent className="flex max-h-[90svh] flex-col overflow-hidden sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>예시 지시문 관리</DialogTitle>
          <DialogDescription>
            자주 쓰는 지시문을 저장해 두시면 생성 화면 오른쪽에서 눌러 바로 쓸 수 있습니다.
            기본 예시는 지울 수 없고, 복사해서 고쳐 쓰실 수 있습니다.
          </DialogDescription>
        </DialogHeader>

        <div className="min-h-0 flex-1 space-y-4 overflow-y-auto">
          <section className="space-y-2">
            <h3 className="text-xs font-medium text-muted-foreground">기본 예시</h3>
            <ul className="space-y-1.5">
              {DEFAULT_PROMPT_PRESETS.map((text) => (
                <li
                  key={text}
                  className="flex items-start gap-2 rounded-md border bg-muted/30 px-3 py-2 text-xs leading-relaxed"
                >
                  <span className="min-w-0 flex-1">{text}</span>
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    className="size-7 shrink-0"
                    disabled={busy}
                    aria-label="이 예시를 복사해 내 예시로 만들기"
                    onClick={() => copyDefault(text)}
                  >
                    <Copy className="size-3.5" aria-hidden="true" />
                  </Button>
                </li>
              ))}
            </ul>
          </section>

          <section className="space-y-2">
            <h3 className="text-xs font-medium text-muted-foreground">
              내 예시 {presets.length > 0 ? `${presets.length}개` : ""}
            </h3>
            {presets.length === 0 ? (
              <p className="rounded-md border border-dashed px-3 py-4 text-center text-xs text-muted-foreground">
                아직 저장한 예시가 없습니다. 아래에서 추가해 주세요.
              </p>
            ) : (
              <ul className="space-y-1.5">
                {presets.map((preset) => (
                  <li key={preset.id} className="rounded-md border px-3 py-2">
                    {editingId === preset.id ? (
                      <div className="space-y-2">
                        <Textarea
                          value={editingText}
                          onChange={(e) =>
                            setEditingText(e.target.value.slice(0, PROMPT_PRESET_MAX_LENGTH))
                          }
                          disabled={busy}
                          aria-label="예시 수정"
                          className="min-h-20 text-xs"
                        />
                        <div className="flex justify-end gap-1.5">
                          <Button
                            type="button"
                            variant="ghost"
                            size="sm"
                            disabled={busy}
                            onClick={() => setEditingId(null)}
                          >
                            취소
                          </Button>
                          <Button
                            type="button"
                            size="sm"
                            disabled={busy}
                            onClick={() => saveEdit(preset.id)}
                          >
                            {busy ? <Loader2 className="size-3.5 animate-spin" /> : null}
                            저장
                          </Button>
                        </div>
                      </div>
                    ) : (
                      <div className="flex items-start gap-2 text-xs leading-relaxed">
                        <span className="min-w-0 flex-1 whitespace-pre-wrap">
                          {preset.text}
                        </span>
                        <Button
                          type="button"
                          variant="ghost"
                          size="icon"
                          className="size-7 shrink-0"
                          disabled={busy}
                          aria-label="예시 수정"
                          onClick={() => {
                            setEditingId(preset.id);
                            setEditingText(preset.text);
                          }}
                        >
                          <Pencil className="size-3.5" aria-hidden="true" />
                        </Button>
                        <Button
                          type="button"
                          variant="ghost"
                          size="icon"
                          className="size-7 shrink-0"
                          disabled={busy}
                          aria-label="예시 삭제"
                          onClick={() => remove(preset)}
                        >
                          <Trash2 className="size-3.5" aria-hidden="true" />
                        </Button>
                      </div>
                    )}
                  </li>
                ))}
              </ul>
            )}
          </section>

          <section className="space-y-2">
            <h3 className="text-xs font-medium text-muted-foreground">예시 추가</h3>
            <Textarea
              value={draft}
              onChange={(e) => setDraft(e.target.value.slice(0, PROMPT_PRESET_MAX_LENGTH))}
              disabled={busy || atLimit}
              aria-label="새 예시 지시문"
              placeholder="예: B사 연간 유지보수 갱신 견적서, 작년 대비 5% 인상"
              className="min-h-20 text-sm"
            />
            {atLimit ? (
              <p className="text-xs text-muted-foreground">{PROMPT_PRESET_LIMIT_MESSAGE}</p>
            ) : null}
          </section>
        </div>

        <DialogFooter>
          <Button type="button" variant="outline" onClick={onClose} disabled={busy}>
            닫기
          </Button>
          <Button type="button" onClick={add} disabled={busy || atLimit || !draft.trim()}>
            {busy ? (
              <Loader2 className="size-4 animate-spin" />
            ) : (
              <Plus className="size-4" />
            )}
            예시 추가
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
