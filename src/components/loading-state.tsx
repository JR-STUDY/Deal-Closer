import { Loader2 } from "lucide-react";

/** 라우트 전환·데이터 로딩 중 콘텐츠 영역에 표시하는 공용 로딩 상태 (정책 STATE_*) */
export function LoadingState({ label = "불러오는 중…" }: { label?: string }) {
  return (
    <div className="flex flex-1 flex-col items-center justify-center gap-3 p-8 text-muted-foreground">
      <Loader2 className="size-6 animate-spin" aria-hidden />
      <p className="text-sm">{label}</p>
      <span className="sr-only" role="status">
        {label}
      </span>
    </div>
  );
}
