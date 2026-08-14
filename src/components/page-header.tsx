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
 */
export type Crumb = { label: string; href?: string; caption?: string };

type PageHeaderProps = {
  title: string;
  description?: string;
  actions?: ReactNode;
  /** 지정하면 제목 왼쪽에 뒤로 가기 버튼을 표시한다(히스토리 우선, 없으면 이 경로로 이동) */
  backHref?: string;
  /** 지정하면 제목 대신 경로(브레드크럼)를 표시한다 (파일 탐색기 스타일) */
  breadcrumb?: Crumb[];
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
 * 스크린리더에는 `거래처 다올테크, 기회 인프라 증설 1차` 로 읽힌다 — 라벨과 값을 같은
 * `<li>` 로 묶었기 때문이다. 구분자는 시각 장식이라 `aria-hidden` 이다 (정책 ACC_*).
 */
function CaptionedBreadcrumb({ crumbs }: { crumbs: Crumb[] }) {
  return (
    <nav aria-label="현재 위치">
      <ol className="flex min-w-0 items-end gap-2">
        {crumbs.map((crumb, index) => {
          const isLast = index === crumbs.length - 1;
          const isLink = Boolean(crumb.href) && !isLast;
          return (
            <Fragment key={crumb.href ?? crumb.label}>
              {index > 0 ? (
                // 구분자는 값 줄 높이에 맞춰 내린다 (라벨 줄에는 두지 않는다)
                <li aria-hidden="true" className="mb-1 shrink-0">
                  <ChevronRight className="size-5 text-muted-foreground" />
                </li>
              ) : null}
              <li className={isLast ? "flex min-w-0 flex-col" : "flex flex-col"}>
                {crumb.caption ? (
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
            <p className="mt-0.5 text-sm text-muted-foreground">{description}</p>
          ) : null}
        </div>
      </div>
      {actions ? (
        <div className="flex shrink-0 items-center gap-2">{actions}</div>
      ) : null}
    </header>
  );
}
