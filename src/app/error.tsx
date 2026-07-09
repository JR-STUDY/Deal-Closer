"use client";

import { useEffect } from "react";
import { TriangleAlert } from "lucide-react";
import { Button } from "@/components/ui/button";

/**
 * 전역 에러 바운더리 (정책 STATE_*) — 렌더/데이터 예외 시 흰 화면·크래시 대신 복구 UI 를 보인다.
 * MVP 는 콘솔로만 관측하고, 실서비스에서는 로깅 서비스로 전송하도록 교체한다.
 */
export default function Error({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error(error);
  }, [error]);

  return (
    <div className="flex min-h-svh flex-col items-center justify-center gap-5 p-8 text-center">
      <div className="flex size-14 items-center justify-center rounded-full bg-destructive/10">
        <TriangleAlert className="size-7 text-destructive" aria-hidden />
      </div>
      <div className="space-y-1.5">
        <h1 className="text-2xl font-semibold">문제가 발생했습니다</h1>
        <p className="text-sm text-muted-foreground">
          일시적인 오류일 수 있습니다. 잠시 후 다시 시도해 주세요.
        </p>
      </div>
      <Button onClick={reset}>다시 시도</Button>
    </div>
  );
}
