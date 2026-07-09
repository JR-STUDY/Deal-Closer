"use client";

import { useEffect, useRef, useState } from "react";
import { cn } from "@/lib/utils";
import { signatureSrcDoc } from "@/lib/signature";

/**
 * HTML 서명 인라인 편집기 (WYSIWYG).
 * sandbox iframe(스크립트 비활성) 안의 본문을 contentEditable 로 만들어,
 * 사용자가 HTML 소스를 건드리지 않고 렌더된 서명의 값(이름·연락처 등)을 직접 고친다.
 * - 스크립트 실행은 여전히 차단되어 안전하다 (편집은 브라우저 네이티브 기능).
 * - `html` 은 문서에 실리는 값. 인라인 편집 중에는 부모가 이 값을 바꾸지 않으므로
 *   srcDoc 이 그대로라 iframe 이 리로드되지 않는다(커서 유지).
 */
export function SignatureHtmlEditor({
  html,
  onChange,
  className,
}: {
  html: string;
  onChange: (html: string) => void;
  className?: string;
}) {
  const iframeRef = useRef<HTMLIFrameElement>(null);
  const [height, setHeight] = useState(180);

  // 최신 onChange 를 effect 재구독 없이 참조 (ref 는 렌더가 아닌 effect 에서 갱신)
  const onChangeRef = useRef(onChange);
  useEffect(() => {
    onChangeRef.current = onChange;
  }, [onChange]);

  useEffect(() => {
    const iframe = iframeRef.current;
    if (!iframe) return;

    const setup = () => {
      const doc = iframe.contentWindow?.document;
      // 문서당 1회만 설정 (load 이벤트/즉시 호출 중복 방지)
      if (!doc?.body || doc.body.dataset.ceReady) return;
      doc.body.dataset.ceReady = "1";
      doc.body.contentEditable = "true";
      doc.body.spellcheck = false;
      doc.body.style.outline = "none";
      const measure = () =>
        setHeight(Math.min(doc.body.scrollHeight + 8, 640));
      measure();
      doc.addEventListener("input", () => {
        onChangeRef.current(doc.body.innerHTML);
        // 매 입력마다 강제 reflow 대신 다음 프레임에 높이 측정
        requestAnimationFrame(measure);
      });
    };

    iframe.addEventListener("load", setup);
    // srcDoc 이 이미 로드된 경우(리스너 부착 전 로드 완료) 대비
    if (iframe.contentWindow?.document?.readyState === "complete") setup();
    return () => iframe.removeEventListener("load", setup);
  }, [html]);

  return (
    <iframe
      ref={iframeRef}
      title="메일 서명 편집"
      sandbox="allow-same-origin"
      srcDoc={signatureSrcDoc(html)}
      style={{ height }}
      className={cn(
        "block w-full rounded-md border bg-white ring-offset-2 focus-within:ring-2 focus-within:ring-ring",
        className,
      )}
    />
  );
}
