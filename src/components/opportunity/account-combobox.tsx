"use client";

import { useEffect, useId, useRef, useState } from "react";
import { Check, Loader2, Plus } from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { Input } from "@/components/ui/input";
import type { OpportunityAccountOption } from "@/lib/opportunity";

/**
 * 거래처 자동완성 입력 (기회-16).
 *
 * 셀렉트는 거래처가 몇 곳일 때만 쓸 만하다. 목록이 길어지면 스크롤에서 찾아야 하고,
 * **아직 없는 거래처**를 만나면 팝업을 닫고 거래처 화면으로 갔다 와야 한다.
 * 그래서 입력하며 좁히고, 없으면 **그 자리에서 만든다**.
 *
 * - 검색은 기존 `GET /api/accounts?q=` 를 그대로 쓴다 (목록 화면과 같은 조건).
 * - 인라인 생성은 `POST /api/accounts` 로 회사명만 넘긴다 — 나머지는 거래처 상세에서 채운다.
 * - 마우스 없이도 쓸 수 있어야 한다 (정책 ACC_*): ↑↓ 로 이동, Enter 로 선택·생성, Esc 로 닫기.
 *   `role="combobox"` + `aria-activedescendant` 로 화면 낭독기가 현재 후보를 읽는다.
 */

/** 입력이 멈춘 뒤 검색을 보낼 때까지의 대기 (타이핑마다 요청하면 목록이 깜빡인다) */
const SEARCH_DEBOUNCE_MS = 250;
/** 한 번에 보여줄 후보 수 — 더 좁히도록 유도하고 목록이 화면을 덮지 않게 한다 */
const MAX_RESULTS = 8;

type AccountComboboxProps = {
  /** `<label htmlFor>` 과 잇는다 */
  id: string;
  /** 현재 선택된 거래처 (없으면 null) */
  value: OpportunityAccountOption | null;
  /** 선택·생성·해제 시 호출 */
  onChange: (account: OpportunityAccountOption | null) => void;
  disabled?: boolean;
  "aria-describedby"?: string;
};

export function AccountCombobox({
  id,
  value,
  onChange,
  disabled,
  "aria-describedby": describedBy,
}: AccountComboboxProps) {
  const listboxId = useId();
  const [query, setQuery] = useState(() => value?.companyName ?? "");
  const [results, setResults] = useState<OpportunityAccountOption[]>([]);
  const [isOpen, setIsOpen] = useState(false);
  const [isSearching, setIsSearching] = useState(false);
  const [isCreating, setIsCreating] = useState(false);
  const [activeIndex, setActiveIndex] = useState(0);
  const blurTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const trimmed = query.trim();
  // 이름이 정확히 같은 거래처가 이미 있으면 "새로 등록" 을 권하지 않는다 (같은 회사가 둘이 된다)
  const hasExactMatch = results.some(
    (account) => account.companyName.toLowerCase() === trimmed.toLowerCase(),
  );
  const canCreate = trimmed.length > 0 && !hasExactMatch && !isSearching;
  const optionCount = results.length + (canCreate ? 1 : 0);
  const createIndex = canCreate ? results.length : -1;

  // 검색 — 입력이 멈추면 보낸다. 이전 요청은 취소해 늦게 온 응답이 목록을 덮어쓰지 않게 한다.
  useEffect(() => {
    if (!isOpen) return;

    const controller = new AbortController();
    const timer = setTimeout(async () => {
      setIsSearching(true);
      try {
        const res = await fetch(
          `/api/accounts?q=${encodeURIComponent(trimmed)}`,
          { signal: controller.signal },
        );
        const json = await res.json();
        if (!res.ok) throw new Error(json?.error);
        const items = (json.data as OpportunityAccountOption[]).slice(
          0,
          MAX_RESULTS,
        );
        setResults(items);
        setActiveIndex(0);
      } catch (error) {
        // 취소는 정상 흐름이다 — 사용자가 계속 입력하고 있다는 뜻이라 알리지 않는다.
        if (error instanceof DOMException && error.name === "AbortError") return;
        setResults([]);
      } finally {
        if (!controller.signal.aborted) setIsSearching(false);
      }
    }, SEARCH_DEBOUNCE_MS);

    return () => {
      clearTimeout(timer);
      controller.abort();
    };
  }, [trimmed, isOpen]);

  // 언마운트 시 닫기 타이머를 정리한다 (사라진 뒤 상태를 건드리지 않도록)
  useEffect(
    () => () => {
      if (blurTimer.current) clearTimeout(blurTimer.current);
    },
    [],
  );

  const select = (account: OpportunityAccountOption) => {
    onChange(account);
    setQuery(account.companyName);
    setIsOpen(false);
  };

  const createAccount = async () => {
    if (!trimmed || isCreating) return;
    setIsCreating(true);
    try {
      const res = await fetch("/api/accounts", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ companyName: trimmed }),
      });
      const json = await res.json().catch(() => null);
      if (!res.ok) {
        toast.error(json?.error ?? "거래처를 등록하지 못했습니다.");
        return;
      }
      const created = json.data as OpportunityAccountOption;
      select(created);
      toast.success(`"${created.companyName}" 을(를) 새 거래처로 등록했습니다.`);
    } catch {
      toast.error("거래처를 등록하지 못했습니다.");
    } finally {
      setIsCreating(false);
    }
  };

  const commitActive = () => {
    if (activeIndex === createIndex) {
      createAccount();
      return;
    }
    const account = results[activeIndex];
    if (account) select(account);
  };

  const handleKeyDown = (event: React.KeyboardEvent<HTMLInputElement>) => {
    if (event.key === "ArrowDown" || event.key === "ArrowUp") {
      event.preventDefault();
      if (!isOpen) {
        setIsOpen(true);
        return;
      }
      if (optionCount === 0) return;
      const step = event.key === "ArrowDown" ? 1 : -1;
      setActiveIndex((current) => (current + step + optionCount) % optionCount);
      return;
    }
    if (event.key === "Enter" && isOpen) {
      // 후보를 고르는 Enter 가 폼 제출로 새지 않게 막는다
      event.preventDefault();
      commitActive();
      return;
    }
    if (event.key === "Escape" && isOpen) {
      event.preventDefault();
      setIsOpen(false);
    }
  };

  return (
    <div className="relative">
      <Input
        id={id}
        role="combobox"
        autoComplete="off"
        aria-expanded={isOpen}
        aria-controls={listboxId}
        aria-autocomplete="list"
        aria-activedescendant={
          isOpen && optionCount > 0 ? `${listboxId}-${activeIndex}` : undefined
        }
        aria-describedby={describedBy}
        disabled={disabled}
        placeholder="회사명을 입력해 찾거나 새로 등록해주세요"
        value={query}
        onChange={(event) => {
          setQuery(event.target.value);
          setIsOpen(true);
          // 이름을 고치는 순간 선택은 풀린다 — 화면의 글자와 저장될 거래처가 달라지면 안 된다.
          if (value) onChange(null);
        }}
        onFocus={() => setIsOpen(true)}
        onKeyDown={handleKeyDown}
        onBlur={() => {
          // 후보를 마우스로 누르는 중에도 blur 가 먼저 오므로 한 박자 늦춰 닫는다
          blurTimer.current = setTimeout(() => setIsOpen(false), 120);
        }}
      />

      {value ? (
        <Check
          aria-hidden="true"
          className="pointer-events-none absolute top-1/2 right-3 size-4 -translate-y-1/2 text-emerald-600 dark:text-emerald-400"
        />
      ) : null}

      {isOpen ? (
        <ul
          id={listboxId}
          role="listbox"
          aria-label="거래처 후보"
          className="absolute z-50 mt-1 max-h-64 w-full overflow-auto rounded-md border bg-popover p-1 shadow-md"
        >
          {results.map((account, index) => (
            <li key={account.id}>
              <button
                type="button"
                id={`${listboxId}-${index}`}
                role="option"
                aria-selected={activeIndex === index}
                className={cn(
                  "w-full truncate rounded-sm px-2 py-1.5 text-left text-sm",
                  activeIndex === index && "bg-accent text-accent-foreground",
                )}
                // 마우스로 훑을 때도 키보드와 같은 위치가 강조되도록 맞춘다
                onMouseEnter={() => setActiveIndex(index)}
                onMouseDown={(event) => event.preventDefault()}
                onClick={() => select(account)}
              >
                {account.companyName}
              </button>
            </li>
          ))}

          {canCreate ? (
            <li>
              <button
                type="button"
                id={`${listboxId}-${createIndex}`}
                role="option"
                aria-selected={activeIndex === createIndex}
                disabled={isCreating}
                className={cn(
                  "flex w-full items-center gap-1.5 rounded-sm px-2 py-1.5 text-left text-sm",
                  activeIndex === createIndex &&
                    "bg-accent text-accent-foreground",
                )}
                onMouseEnter={() => setActiveIndex(createIndex)}
                onMouseDown={(event) => event.preventDefault()}
                onClick={createAccount}
              >
                {isCreating ? (
                  <Loader2
                    className="size-3.5 shrink-0 animate-spin"
                    aria-hidden="true"
                  />
                ) : (
                  <Plus className="size-3.5 shrink-0" aria-hidden="true" />
                )}
                <span className="truncate">
                  &ldquo;{trimmed}&rdquo; 을(를) 새 거래처로 등록
                </span>
              </button>
            </li>
          ) : null}

          {optionCount === 0 ? (
            <li className="px-2 py-3 text-center text-sm text-muted-foreground">
              {isSearching ? "찾는 중입니다…" : "회사명을 입력해주세요."}
            </li>
          ) : null}
        </ul>
      ) : null}
    </div>
  );
}
