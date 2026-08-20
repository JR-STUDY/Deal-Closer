import { Fragment, type ReactNode } from "react";
import Link from "next/link";
import { ChevronRight } from "lucide-react";
import { cn } from "@/lib/utils";
import { BackButton } from "@/components/back-button";

/**
 * 브레드크럼 세그먼트 — 마지막(현재 위치)은 링크 없이 강조 표시된다.
 *
 * `caption` 을 주면 그 칸이 **무엇인지** 알려주는 작은 글씨가 값 위에 붙는다
 * (예: `거래처` / `다올테크`). 한 칸이라도 caption 이 있으면 브레드크럼 전체가
 * **라벨 위 · 값 아래** 2줄 구조로 그려지고, `>` 는 값 줄 사이에만 놓인다 (기회-7).
 * caption 이 하나도 없으면 기존 한 줄 표기를 그대로 쓴다.
 *
 * `captionHref` 를 주면 **라벨도 링크**가 되어 그 분류의 목록으로 간다 (4차 피드백 1).
 * 라벨과 값은 서로 다른 곳을 가리키므로 한 칸 안에 링크가 둘이다.
 */
export type Crumb = {
  label: string;
  href?: string;
  caption?: string;
  /**
   * 라벨(caption)을 눌렀을 때 갈 곳 — **경로를 아는 화면이 직접 준다.**
   *
   * 주지 않으면 라벨은 링크가 되지 않고 그냥 글씨로 남는다. 예전에는 공용 컴포넌트가
   * `거래처`·`기회` 라벨을 보고 목록 경로를 채워 주는 기본값 맵을 들고 있었는데, 그러면
   * **공용 UI 가 한국어 낱말과 라우트의 대응을 알아야** 하고 라벨 문구를 `발주처` 로 바꾸는
   * 순간 링크가 조용히 사라진다(`Record<string, string>` 이라 타입도 막아주지 못했다).
   * 라우트를 아는 쪽은 그 화면이므로 지식도 그쪽에 둔다.
   */
  captionHref?: string;
};

type PageHeaderProps = {
  title: string;
  description?: string;
  actions?: ReactNode;
  /** 지정하면 제목 왼쪽에 뒤로 가기 버튼을 표시한다(히스토리 우선, 없으면 이 경로로 이동) */
  backHref?: string;
  /** 지정하면 제목 대신 경로(브레드크럼)를 표시한다 (파일 탐색기 스타일) */
  breadcrumb?: Crumb[];
  /**
   * 헤더 **우측 아래**에 작게 놓는 부차 정보 (등록·최근 수정 일시 등, 4차 피드백 W-C 2).
   *
   * `description` 과 자리를 바꿔 쓰는 것이 아니다 — `description` 은 그 화면이 무엇을 하는
   * 곳인지 알려 주는 **본문 안내**라 제목 아래(왼쪽)가 맞고, 여기 오는 것은 "언제 만들어졌나"
   * 처럼 **찾을 때만 보면 되는 값**이라 시선이 먼저 닿지 않는 자리에 작게 둔다.
   *
   * **주지 않으면 아무것도 그리지 않는다.** 화면마다 필요 여부가 다르므로(거래처 상세는
   * 일시를 싣지 않기로 했다 — 3차 피드백) 공용 컴포넌트가 기본값으로 넣어 주지 않는다.
   */
  meta?: ReactNode;
};

/**
 * 라벨 위 · 값 아래의 2줄 브레드크럼 (기회-7).
 *
 * ```
 *  거래처                 기회
 *  다올테크        >      인프라 증설 1차
 * ```
 *
 * 값을 나열하기만 하면 `거래처 > 다올테크 > 인프라 증설 1차` 처럼 **분류와 값이 같은 줄에
 * 뒤섞여** 어느 것이 목록이고 어느 것이 이름인지 알 수 없다. 위 줄은 그 칸이 무엇인지,
 * 아래 줄은 실제 값이다. `>` 는 값끼리의 관계를 나타내므로 **값 줄에만** 둔다.
 *
 * 라벨은 그 분류의 **목록으로 가는 링크**다 (4차 피드백 1) — `거래처` 를 누르면 거래처
 * 목록, `기회` 를 누르면 기회 목록이다. **경로는 화면이 `captionHref` 로 준다** — 이 컴포넌트는
 * 라벨 문구로 라우트를 추측하지 않는다. 한 칸 안에 링크가 둘(라벨·값)이고 서로 다른 곳으로
 * 가므로, 라벨 링크에는 `aria-label="거래처 목록으로 이동"` 처럼 **가는 곳을 밝힌 접근
 * 이름**을 준다. 눈에 보이는 글자(`거래처`)를 접근 이름이 그대로 품으므로 음성 입력으로
 * "거래처" 라고 말해도 이 링크가 잡힌다(WCAG 2.5.3 Label in Name).
 *
 * 스크린리더에는 `거래처 목록으로 이동(링크), 다올테크` 처럼 읽힌다 — 라벨과 값을 같은
 * `<li>` 로 묶어 어느 값이 어느 분류의 것인지 함께 읽히게 했다.
 * 구분자는 시각 장식이라 `aria-hidden` 이다 (정책 ACC_*).
 */
function CaptionedBreadcrumb({ crumbs }: { crumbs: Crumb[] }) {
  return (
    <nav aria-label="현재 위치">
      <ol className="flex min-w-0 items-end gap-2">
        {crumbs.map((crumb, index) => {
          const isLast = index === crumbs.length - 1;
          const isLink = Boolean(crumb.href) && !isLast;
          // 라벨은 마지막 칸(현재 위치)에서도 링크다 — 값은 여기지만 분류의 목록은 다른 곳이다.
          // 경로는 화면이 준 것만 쓴다(공용 컴포넌트가 라벨로 추측하지 않는다)
          const captionHref = crumb.captionHref;
          return (
            <Fragment key={crumb.href ?? crumb.label}>
              {index > 0 ? (
                // 구분자는 값 줄 높이에 맞춰 내린다 (라벨 줄에는 두지 않는다)
                <li aria-hidden="true" className="mb-1 shrink-0">
                  <ChevronRight className="size-5 text-muted-foreground" />
                </li>
              ) : null}
              <li
                className={isLast ? "flex min-w-0 flex-col" : "flex flex-col"}
              >
                {crumb.caption && captionHref ? (
                  <Link
                    href={captionHref}
                    // 링크 영역을 글자에 맞춘다 — flex 열에서 늘어나면 옆의 빈 칸을 눌러도 이동한다
                    aria-label={`${crumb.caption} 목록으로 이동`}
                    className="w-fit rounded text-xs leading-4 font-medium text-muted-foreground transition-colors hover:text-foreground hover:underline focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
                  >
                    {crumb.caption}
                  </Link>
                ) : crumb.caption ? (
                  <span className="text-xs leading-4 font-medium text-muted-foreground">
                    {crumb.caption}
                  </span>
                ) : (
                  // 캡션이 없는 칸도 값 줄 높이를 맞춰 둔다 (읽히지 않게 감춘다)
                  <span aria-hidden="true" className="text-xs leading-4">
                    &nbsp;
                  </span>
                )}
                {isLink && crumb.href ? (
                  <Link
                    href={crumb.href}
                    className="shrink-0 rounded text-xl font-semibold tracking-tight text-foreground/70 transition-colors hover:text-foreground hover:underline focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
                  >
                    {crumb.label}
                  </Link>
                ) : (
                  <span
                    className={cn(
                      "text-xl font-semibold tracking-tight",
                      isLast ? "truncate" : "shrink-0",
                    )}
                  >
                    {crumb.label}
                  </span>
                )}
              </li>
            </Fragment>
          );
        })}
      </ol>
    </nav>
  );
}

/** 콘솔 콘텐츠 상단의 공통 페이지 헤더 */
export function PageHeader({
  title,
  description,
  actions,
  backHref,
  breadcrumb,
  meta,
}: PageHeaderProps) {
  return (
    <header className="flex items-center justify-between gap-4 border-b px-8 py-4">
      <div className="flex min-w-0 items-center gap-3">
        {backHref ? <BackButton fallbackHref={backHref} /> : null}
        <div className="min-w-0">
          {breadcrumb && breadcrumb.some((crumb) => crumb.caption) ? (
            <CaptionedBreadcrumb crumbs={breadcrumb} />
          ) : breadcrumb && breadcrumb.length > 0 ? (
            <nav
              aria-label="현재 위치"
              className="flex min-w-0 items-center gap-1 text-xl font-semibold tracking-tight"
            >
              {breadcrumb.map((crumb, i) => {
                const isLast = i === breadcrumb.length - 1;
                return (
                  <span
                    key={crumb.href ?? crumb.label}
                    className="flex min-w-0 items-center gap-1"
                  >
                    {i > 0 ? (
                      <ChevronRight className="size-4 shrink-0 text-muted-foreground" />
                    ) : null}
                    {crumb.href && !isLast ? (
                      <Link
                        href={crumb.href}
                        className="shrink-0 text-muted-foreground transition-colors hover:text-foreground"
                      >
                        {crumb.label}
                      </Link>
                    ) : (
                      <span className={isLast ? "truncate" : "shrink-0"}>
                        {crumb.label}
                      </span>
                    )}
                  </span>
                );
              })}
            </nav>
          ) : (
            <h1 className="truncate text-xl font-semibold tracking-tight">
              {title}
            </h1>
          )}
          {description ? (
            <p className="mt-0.5 text-sm text-muted-foreground">
              {description}
            </p>
          ) : null}
        </div>
      </div>
      {/*
        우측 열은 위가 조작(actions), 아래가 부차 정보(meta)다. `meta` 를 넘기지 않는 화면은
        예전과 같이 버튼 한 줄만 그려진다 (감싸는 열이 한 겹 생기지만 자식이 하나뿐이라
        결과가 같다). `shrink-0` 이라 제목이 길어져도 이 열이 눌리지 않고, 대신 왼쪽 제목이
        `truncate` 로 줄어든다 — 좁은 화면에서 둘이 겹치거나 뭉개지지 않는다.
      */}
      {actions || meta ? (
        <div className="flex shrink-0 flex-col items-end gap-1.5">
          {actions ? (
            <div className="flex items-center gap-2">{actions}</div>
          ) : null}
          {meta ? (
            <div className="text-xs whitespace-nowrap text-muted-foreground">
              {meta}
            </div>
          ) : null}
        </div>
      ) : null}
    </header>
  );
}
