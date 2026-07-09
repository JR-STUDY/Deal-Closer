import type { ReactNode } from "react";
import Link from "next/link";
import { ChevronRight } from "lucide-react";
import { BackButton } from "@/components/back-button";

/** 브레드크럼 세그먼트 — 마지막(현재 위치)은 링크 없이 강조 표시된다 */
export type Crumb = { label: string; href?: string };

type PageHeaderProps = {
  title: string;
  description?: string;
  actions?: ReactNode;
  /** 지정하면 제목 왼쪽에 뒤로 가기 버튼을 표시한다(히스토리 우선, 없으면 이 경로로 이동) */
  backHref?: string;
  /** 지정하면 제목 대신 경로(브레드크럼)를 표시한다 (파일 탐색기 스타일) */
  breadcrumb?: Crumb[];
};

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
          {breadcrumb && breadcrumb.length > 0 ? (
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
