"use client";

import { useEffect, useState } from "react";
import { FileText, Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";
import { formatDate, formatKRW } from "@/lib/format";
import { DocTypeBadge, StatusBadge } from "@/components/status-badge";
import { Input } from "@/components/ui/input";

/**
 * 기회에 연결할 보관함 문서 선택 (기회-5 2번 · 기회-17).
 *
 * 등록 팝업과 기회 상세가 **같은 후보 목록**을 보도록 한 컴포넌트로 모은다.
 * 후보 규칙(아직 어느 기회에도 붙지 않음 · 폐기 아님)은 서버가 정한다 —
 * 화면이 스스로 거르면 서버가 거부하는 문서를 목록에 띄우게 된다.
 *
 * 선택은 실제 `<input type="checkbox">` 다. 목록을 흉내 낸 div 로 만들면 키보드 이동·
 * 화면 낭독기 안내를 전부 다시 만들어야 한다 (정책 ACC_*).
 */

export type LinkableDocumentItem = {
  id: string;
  title: string;
  type: string;
  status: string;
  /** 총액 (KRW 정수) — 이 문서가 확정되면 그대로 기회의 예상 금액이 된다 */
  amount: number;
  createdAt: string;
};

export function LinkableDocumentPicker({
  selectedIds,
  onChange,
  disabled,
}: {
  selectedIds: string[];
  onChange: (ids: string[]) => void;
  disabled?: boolean;
}) {
  const [documents, setDocuments] = useState<LinkableDocumentItem[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [query, setQuery] = useState("");

  // 후보는 한 번만 읽는다. 목록이 크지 않아 걸러내기는 화면에서 즉시 처리한다.
  useEffect(() => {
    const controller = new AbortController();

    (async () => {
      try {
        const res = await fetch("/api/documents?linkable=1", {
          signal: controller.signal,
        });
        const json = await res.json();
        if (!res.ok) throw new Error(json?.error);
        setDocuments(json.data as LinkableDocumentItem[]);
      } catch (err) {
        if (err instanceof DOMException && err.name === "AbortError") return;
        setError("문서 목록을 불러오지 못했습니다.");
      } finally {
        if (!controller.signal.aborted) setIsLoading(false);
      }
    })();

    return () => controller.abort();
  }, []);

  const keyword = query.trim().toLowerCase();
  const visible = keyword
    ? documents.filter((document) =>
        document.title.toLowerCase().includes(keyword),
      )
    : documents;

  const toggle = (id: string) => {
    onChange(
      selectedIds.includes(id)
        ? selectedIds.filter((one) => one !== id)
        : [...selectedIds, id],
    );
  };

  if (isLoading) {
    return (
      <p className="flex items-center gap-2 rounded-md border border-dashed p-4 text-sm text-muted-foreground">
        <Loader2 className="size-4 animate-spin" aria-hidden="true" />
        문서를 불러오는 중입니다…
      </p>
    );
  }

  if (error) {
    return (
      <p className="rounded-md border border-dashed p-4 text-sm text-destructive">
        {error}
      </p>
    );
  }

  if (documents.length === 0) {
    return (
      <p className="rounded-md border border-dashed p-4 text-sm text-muted-foreground">
        연결할 수 있는 문서가 없습니다. 보관함의 문서가 모두 다른 기회에
        연결되어 있거나 폐기된 상태입니다.
      </p>
    );
  }

  return (
    <div className="space-y-2">
      <Input
        type="search"
        value={query}
        aria-label="문서 제목으로 찾기"
        placeholder="문서 제목으로 찾기"
        disabled={disabled}
        onChange={(event) => setQuery(event.target.value)}
      />

      <ul className="max-h-56 divide-y overflow-auto rounded-md border">
        {visible.map((document) => {
          const isSelected = selectedIds.includes(document.id);
          return (
            <li key={document.id}>
              <label
                className={cn(
                  "flex cursor-pointer items-center gap-3 p-3 transition-colors hover:bg-muted/60",
                  isSelected && "bg-muted",
                )}
              >
                <input
                  type="checkbox"
                  className="size-4 shrink-0 accent-primary"
                  checked={isSelected}
                  disabled={disabled}
                  onChange={() => toggle(document.id)}
                />
                <FileText
                  className="size-4 shrink-0 text-muted-foreground"
                  aria-hidden="true"
                />
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-sm font-medium">
                    {document.title}
                  </span>
                  <span className="block text-xs text-muted-foreground">
                    {formatDate(document.createdAt)} 생성
                  </span>
                </span>
                <span className="flex shrink-0 items-center gap-2">
                  <span className="text-sm tabular-nums">
                    {formatKRW(document.amount)}
                  </span>
                  <DocTypeBadge type={document.type} />
                  <StatusBadge status={document.status} />
                </span>
              </label>
            </li>
          );
        })}

        {visible.length === 0 ? (
          <li className="p-4 text-center text-sm text-muted-foreground">
            &ldquo;{query.trim()}&rdquo; 와 일치하는 문서가 없습니다.
          </li>
        ) : null}
      </ul>
    </div>
  );
}
