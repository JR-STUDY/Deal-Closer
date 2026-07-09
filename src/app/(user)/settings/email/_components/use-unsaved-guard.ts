import { useEffect } from "react";

/**
 * 미저장 변경 이탈 경고 (정책 STATE_*).
 * - `beforeunload`: 브라우저 레벨 이탈(새로고침·탭/창 닫기·주소 직접 이동)
 * - 캡처 단계 클릭 가로채기: 앱 내 링크(사이드바 등) 이동도 confirm 으로 막는다.
 *   App Router 는 클라이언트 라우팅 차단 API 를 제공하지 않으므로, 내부 앵커 클릭을
 *   가로채 확인창을 띄우고 취소 시 이동을 중단한다.
 */
export function useUnsavedGuard(
  isDirty: boolean,
  message = "저장하지 않은 변경사항이 있습니다. 이 페이지를 떠나시겠습니까?",
) {
  useEffect(() => {
    if (!isDirty) return;

    const onBeforeUnload = (event: BeforeUnloadEvent) => {
      event.preventDefault();
      event.returnValue = "";
    };
    window.addEventListener("beforeunload", onBeforeUnload);

    const onClickCapture = (event: MouseEvent) => {
      // 좌클릭·수식키 없는 클릭만 (새 탭 등은 브라우저/beforeunload 가 처리)
      if (
        event.defaultPrevented ||
        event.button !== 0 ||
        event.metaKey ||
        event.ctrlKey ||
        event.shiftKey ||
        event.altKey
      ) {
        return;
      }
      const anchor = (event.target as HTMLElement | null)?.closest?.("a");
      const href = anchor?.getAttribute("href");
      if (!href || href.startsWith("#")) return;
      if (anchor?.target && anchor.target !== "_self") return;

      const url = new URL(anchor!.href, window.location.href);
      // 외부 도메인은 beforeunload 가 담당, 동일 경로는 이동 아님
      if (url.origin !== window.location.origin) return;
      if (
        url.pathname === window.location.pathname &&
        url.search === window.location.search
      ) {
        return;
      }

      if (!window.confirm(message)) {
        event.preventDefault();
        event.stopPropagation();
      }
    };
    document.addEventListener("click", onClickCapture, true);

    return () => {
      window.removeEventListener("beforeunload", onBeforeUnload);
      document.removeEventListener("click", onClickCapture, true);
    };
  }, [isDirty, message]);
}
