"use client";

import { useId, useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { PAGE_PARAM, pageHref, parsePageInput } from "@/lib/pagination";

/**
 * 페이지 번호 직접 입력 이동 (4차 피드백 1).
 *
 * **번호 목록을 대체하지 않고 그 오른쪽에 붙인다.** 둘은 하는 일이 다르다 — 번호는 옆
 * 페이지로 가는 한 번의 클릭이고, 입력은 멀리 떨어진 페이지로 건너뛰는 길이다. 입력으로
 * 갈아치우면 2페이지로 가려고 숫자를 타이핑해야 하고, 번호만 두면 40페이지로 갈 방법이 없다.
 *
 * **진짜 `<form method="get">`** 이다 — JS 가 아직 붙지 않았거나 실패해도 브라우저가
 * `?page=` 를 붙여 이동시킨다. 지금 걸린 검색·필터·정렬은 hidden 으로 함께 실어 보내
 * 조건이 사라지지 않게 한다. JS 가 있으면 `onSubmit` 이 가로채 **먼저 검증**하고,
 * `pageHref` 로 1페이지의 `page` 파라미터를 지운 깔끔한 주소로 이동한다.
 * 입력 칸 안에서 Enter 를 누르면 폼이 제출되므로 키보드만으로 끝난다 (정책 ACC_*).
 *
 * 검증은 `@/lib/pagination` 의 `parsePageInput` 한 곳이 한다 — 화면은 판정하지 않고
 * 돌려받은 문구를 그대로 띄운다. 안내는 **입력 칸 위로 띄워** 표 아래 높이가 흔들리지
 * 않게 하고, `role="alert"` 로 스크린리더에도 즉시 읽힌다.
 */
export function ListPageJump({
  basePath,
  query,
  totalPages,
}: {
  /** 이동할 기준 경로 (예: `/accounts`) */
  basePath: string;
  /** 페이지를 옮겨도 유지할 현재 쿼리 (page 는 넣어도 무시된다) */
  query: Readonly<Record<string, string>>;
  /** 입력 가능한 최대 페이지 */
  totalPages: number;
}) {
  const router = useRouter();
  const inputId = useId();
  const errorId = useId();
  const [value, setValue] = useState("");
  const [error, setError] = useState<string | null>(null);

  // JS 가 없을 때 브라우저가 그대로 실어 보낼 현재 조건 (page 는 입력 칸이 담당한다)
  const hiddenEntries = Object.entries(query).filter(
    ([key, raw]) => key !== PAGE_PARAM && (raw?.trim() ?? "") !== "",
  );

  function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const result = parsePageInput(value, totalPages);
    if (!result.ok) {
      setError(result.message);
      return;
    }
    setError(null);
    setValue("");
    router.push(pageHref(basePath, query, result.page));
  }

  return (
    <form
      // JS 없이도 동작하는 기본 경로. `onSubmit` 이 살아 있으면 이쪽으로 오지 않는다.
      action={basePath}
      method="get"
      onSubmit={onSubmit}
      className="relative flex items-center gap-1.5"
    >
      {hiddenEntries.map(([key, raw]) => (
        <input key={key} type="hidden" name={key} value={raw.trim()} />
      ))}

      <label htmlFor={inputId} className="text-xs text-muted-foreground">
        페이지 이동
      </label>
      <input
        id={inputId}
        name={PAGE_PARAM}
        type="text"
        // 모바일에서 숫자 자판이 먼저 뜨게 한다. `type=number` 는 스피너가 붙어 폭이
        // 흔들리고 브라우저마다 다른 언어로 검증 문구를 띄운다 — 검증은 우리가 한다.
        inputMode="numeric"
        autoComplete="off"
        value={value}
        onChange={(event) => {
          setValue(event.target.value);
          // 고치기 시작하면 지난 경고는 즉시 거둔다 (남겨 두면 지금 값에 대한 말로 읽힌다)
          if (error) setError(null);
        }}
        placeholder="번호"
        aria-label={`이동할 페이지 번호 (1부터 ${totalPages}까지)`}
        aria-invalid={error ? true : undefined}
        aria-describedby={error ? errorId : undefined}
        className="h-8 w-16 rounded-md border bg-transparent px-2 text-center text-sm tabular-nums transition-colors placeholder:text-muted-foreground/70 focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none aria-invalid:border-destructive aria-invalid:ring-destructive/30"
      />
      <span className="text-xs text-muted-foreground tabular-nums">
        / {totalPages}
      </span>

      {/*
        버튼은 **글자**다. 앞서 쓰던 Enter(↵) 아이콘은 "Enter 를 누르라"는 안내인지
        "눌러서 이동하라"는 버튼인지 읽는 사람마다 갈렸다 — 실제로는 둘 다 되지만,
        아이콘 하나로 두 뜻을 겸하면 어느 쪽도 분명하지 않다. 글자는 오해가 없다.
      */}
      <button
        type="submit"
        className="flex h-8 items-center justify-center rounded-md border px-2.5 text-sm transition-colors hover:bg-accent hover:text-accent-foreground focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
      >
        이동
      </button>

      {error ? (
        // 위로 띄운다 — 아래에 끼워 넣으면 경고가 뜰 때마다 표 아래가 밀려 내려간다
        <p
          id={errorId}
          role="alert"
          className="absolute right-0 bottom-full mb-1.5 rounded-md bg-destructive px-2 py-1 text-xs whitespace-nowrap text-primary-foreground shadow-md"
        >
          {error}
        </p>
      ) : null}
    </form>
  );
}
