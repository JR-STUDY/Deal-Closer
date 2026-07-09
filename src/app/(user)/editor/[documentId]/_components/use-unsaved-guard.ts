import { useEffect } from "react";

/**
 * 미저장 변경이 있을 때 브라우저 이탈(새로고침·탭 닫기·뒤로가기)을 확인창으로 막는다
 * (정책 STATE_*). App Router 는 앱 내 네비게이션 차단 API 를 제공하지 않으므로,
 * 표준 `beforeunload` 로 브라우저 레벨 이탈만 가드한다.
 */
export function useUnsavedGuard(isDirty: boolean) {
  useEffect(() => {
    if (!isDirty) return;

    const handler = (event: BeforeUnloadEvent) => {
      event.preventDefault();
      event.returnValue = "";
    };
    window.addEventListener("beforeunload", handler);
    return () => window.removeEventListener("beforeunload", handler);
  }, [isDirty]);
}
