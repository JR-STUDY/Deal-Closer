import type { ReactNode } from "react";
import { BackButton } from "@/components/back-button";

type PageHeaderProps = {
  title: string;
  description?: string;
  actions?: ReactNode;
  /** 지정하면 제목 왼쪽에 뒤로 가기 버튼을 표시한다(히스토리 우선, 없으면 이 경로로 이동) */
  backHref?: string;
};

/** 콘솔 콘텐츠 상단의 공통 페이지 헤더 */
export function PageHeader({
  title,
  description,
  actions,
  backHref,
}: PageHeaderProps) {
  return (
    <header className="flex items-center justify-between gap-4 border-b px-8 py-4">
      <div className="flex min-w-0 items-center gap-3">
        {backHref ? <BackButton fallbackHref={backHref} /> : null}
        <div className="min-w-0">
          <h1 className="truncate text-xl font-semibold tracking-tight">
            {title}
          </h1>
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
