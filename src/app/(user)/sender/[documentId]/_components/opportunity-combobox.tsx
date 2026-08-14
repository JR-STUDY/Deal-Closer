"use client";

import { useEffect, useId, useRef, useState } from "react";
import { Loader2, X } from "lucide-react";
import { cn } from "@/lib/utils";
import { Input } from "@/components/ui/input";
import {
  OPPORTUNITY_STAGE_LABELS,
  type OpportunityStage,
} from "@/lib/constants";

/**
 * 영업 기회 자동완성 입력 (발송-11).
 *
 * `@/components/opportunity/account-combobox` 와 **같은 골격**이다 — 검색 debounce·↑↓ 이동·
 * Enter 선택·Esc 닫기·`role="combobox"` + `aria-activedescendant` 까지 동작이 같아야
 * 두 자동완성을 매번 다시 배우지 않는다 (정책 ACC_*).
 *
 * 거래처와 다른 점 둘:
 *  - **인라인 생성이 없다.** 발송 화면은 새 기회를 만들 자리가 아니다(거래처·담당자·마감일을
 *    여기서 물을 수 없다). 없으면 기회 화면에서 만들고 돌아온다.
 *  - **연결 해제가 있다.** 기회 연결은 선택이라 "고른 값을 무르는" 길이 필요하다.
 *    입력 오른쪽의 ✕ 버튼은 Tab 으로 닿고 Enter 로 눌린다.
 *
 * 검색은 기존 `GET /api/opportunities?q=` 를 그대로 쓴다 — 기회명·거래처명 부분 일치이고
 * orgId 스코프는 그 라우트가 건다(목록 화면과 같은 조건).
 */

/** 입력이 멈춘 뒤 검색을 보낼 때까지의 대기 (타이핑마다 요청하면 목록이 깜빡인다) */
const SEARCH_DEBOUNCE_MS = 250;
/** 한 번에 보여줄 후보 수 — 더 좁히도록 유도하고 목록이 화면을 덮지 않게 한다 */
const MAX_RESULTS = 8;

/** 자동완성이 다루는 최소 기회 정보 (`GET /api/opportunities` 응답의 부분집합) */
export type OpportunitySuggestion = {
  id: string;
  name: string;
  accountName: string;
  stage: OpportunityStage;
};

type OpportunityComboboxProps = {
  /** `<label htmlFor>` 과 잇는다 */
  id: string;
  /** 현재 연결된 기회 (없으면 null) */
  value: OpportunitySuggestion | null;
  /** 후보 선택 시 호출 (해제는 onClear) */
  onSelect: (opportunity: OpportunitySuggestion) => void;
  /** 연결 해제 시 호출 */
  onClear: () => void;
  disabled?: boolean;
  "aria-describedby"?: string;
};

/** 후보 한 줄의 표시 문구 — 목록·선택 후 입력값이 같은 모양이어야 무엇을 골랐는지 알 수 있다 */
function describe(opportunity: OpportunitySuggestion): string {
  return `${opportunity.name} · ${opportunity.accountName}`;
}

export function OpportunityCombobox({
  id,
  value,
  onSelect,
  onClear,
  disabled,
  "aria-describedby": describedBy,
}: OpportunityComboboxProps) {
  const listboxId = useId();
  const [query, setQuery] = useState(() => (value ? describe(value) : ""));
  const [results, setResults] = useState<OpportunitySuggestion[]>([]);
  const [isOpen, setIsOpen] = useState(false);
  const [isSearching, setIsSearching] = useState(false);
  const [activeIndex, setActiveIndex] = useState(0);
  const blurTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const trimmed = query.trim();

  // 검색 — 입력이 멈추면 보낸다. 이전 요청은 취소해 늦게 온 응답이 목록을 덮어쓰지 않게 한다.
  useEffect(() => {
    if (!isOpen) return;

    const controller = new AbortController();
    const timer = setTimeout(async () => {
      setIsSearching(true);
      try {
        const res = await fetch(
          `/api/opportunities?q=${encodeURIComponent(trimmed)}`,
          { signal: controller.signal },
        );
        const json = await res.json();
        if (!res.ok) throw new Error(json?.error);
        const items = (json.data as OpportunitySuggestion[])
          .map((item) => ({
            id: item.id,
            name: item.name,
            accountName: item.accountName,
            stage: item.stage,
          }))
          .slice(0, MAX_RESULTS);
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

  // 상위가 쥔 연결값이 바뀌면 입력 글자도 따라간다 — 화면의 글자와 실제 연결이 어긋나면
  // 무엇이 붙어 있는지 알 수 없다. 효과가 아니라 **렌더 중 조정**이라 한 번 더 그리지 않는다
  // (React 공식 "props 가 바뀔 때 state 조정" 패턴).
  const [syncedId, setSyncedId] = useState<string | null>(value?.id ?? null);
  if ((value?.id ?? null) !== syncedId) {
    setSyncedId(value?.id ?? null);
    setQuery(value ? describe(value) : "");
  }

  // 언마운트 시 닫기 타이머를 정리한다 (사라진 뒤 상태를 건드리지 않도록)
  useEffect(
    () => () => {
      if (blurTimer.current) clearTimeout(blurTimer.current);
    },
    [],
  );

  const select = (opportunity: OpportunitySuggestion) => {
    setQuery(describe(opportunity));
    setIsOpen(false);
    onSelect(opportunity);
  };

  const handleKeyDown = (event: React.KeyboardEvent<HTMLInputElement>) => {
    if (event.key === "ArrowDown" || event.key === "ArrowUp") {
      event.preventDefault();
      if (!isOpen) {
        setIsOpen(true);
        return;
      }
      if (results.length === 0) return;
      const step = event.key === "ArrowDown" ? 1 : -1;
      setActiveIndex(
        (current) => (current + step + results.length) % results.length,
      );
      return;
    }
    if (event.key === "Enter" && isOpen) {
      // 후보를 고르는 Enter 가 폼 제출로 새지 않게 막는다
      event.preventDefault();
      const opportunity = results[activeIndex];
      if (opportunity) select(opportunity);
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
          isOpen && results.length > 0
            ? `${listboxId}-${activeIndex}`
            : undefined
        }
        aria-describedby={describedBy}
        disabled={disabled}
        placeholder="기회명 또는 거래처명을 입력해 찾아주세요"
        className={value ? "pr-9" : undefined}
        value={query}
        onChange={(event) => {
          setQuery(event.target.value);
          setIsOpen(true);
        }}
        onFocus={() => setIsOpen(true)}
        onKeyDown={handleKeyDown}
        onBlur={() => {
          // 후보를 마우스로 누르는 중에도 blur 가 먼저 오므로 한 박자 늦춰 닫는다
          blurTimer.current = setTimeout(() => {
            setIsOpen(false);
            // 입력을 떠나면 글자는 실제 연결값으로 되돌린다 — 고르다 만 글자나 저장에
            // 실패한 글자가 남으면 붙어 있지도 않은 기회가 붙은 것처럼 보인다.
            setQuery(value ? describe(value) : "");
          }, 120);
        }}
      />

      {value ? (
        <button
          type="button"
          aria-label="영업 기회 연결 해제"
          title="연결 해제"
          disabled={disabled}
          className="absolute top-1/2 right-2 -translate-y-1/2 rounded-sm p-1 text-muted-foreground hover:bg-accent hover:text-foreground focus-visible:ring-[3px] focus-visible:ring-ring/50 focus-visible:outline-none disabled:opacity-50"
          onClick={() => {
            setQuery("");
            setIsOpen(false);
            onClear();
          }}
        >
          <X className="size-4" aria-hidden="true" />
        </button>
      ) : null}

      {isOpen ? (
        <ul
          id={listboxId}
          role="listbox"
          aria-label="영업 기회 후보"
          className="absolute z-50 mt-1 max-h-64 w-full overflow-auto rounded-md border bg-popover p-1 shadow-md"
        >
          {results.map((opportunity, index) => (
            <li key={opportunity.id}>
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
                onClick={() => select(opportunity)}
              >
                {describe(opportunity)}{" "}
                <span className="text-muted-foreground">
                  ({OPPORTUNITY_STAGE_LABELS[opportunity.stage]})
                </span>
              </button>
            </li>
          ))}

          {results.length === 0 ? (
            <li className="flex items-center justify-center gap-1.5 px-2 py-3 text-center text-sm text-muted-foreground">
              {isSearching ? (
                <>
                  <Loader2
                    className="size-3.5 animate-spin"
                    aria-hidden="true"
                  />
                  찾는 중입니다…
                </>
              ) : trimmed ? (
                "일치하는 영업 기회가 없습니다."
              ) : (
                "기회명 또는 거래처명을 입력해주세요."
              )}
            </li>
          ) : null}
        </ul>
      ) : null}
    </div>
  );
}
