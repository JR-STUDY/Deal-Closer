"use client";

import { useState } from "react";
import { cn } from "@/lib/utils";
import { isHtmlSignature, signatureSrcDoc } from "@/lib/signature";

/**
 * 메일 서명 미리보기.
 * - 일반 텍스트: 줄바꿈을 살려 그대로 표시
 * - HTML: sandbox iframe 으로 렌더 (스크립트 비활성 → XSS 안전, 앱 스타일과 격리돼
 *   이메일 클라이언트처럼 정확히 보인다). onLoad 로 콘텐츠 높이에 맞춰 iframe 높이 조정.
 */
export function SignaturePreview({
  signature,
  className,
  bordered = true,
  scale = 1,
}: {
  signature: string;
  className?: string;
  /** 테두리·흰 배경 박스로 감쌀지 여부. 실제 메일처럼 흘려 보이려면 false */
  bordered?: boolean;
  /** 원본 비율을 유지한 채 균일 축소(<1). 실제 메일 미리보기에서 살짝 작게 보일 때 */
  scale?: number;
}) {
  const [height, setHeight] = useState(160);

  if (!signature.trim()) return null;

  if (!isHtmlSignature(signature)) {
    return (
      <p
        className={cn(
          "whitespace-pre-line text-sm text-muted-foreground",
          className,
        )}
      >
        {signature}
      </p>
    );
  }

  return (
    <iframe
      title="메일 서명 미리보기"
      // allow-same-origin(스크립트 미허용): 스크립트 실행은 막고 높이만 측정
      sandbox="allow-same-origin"
      // 내부 스크롤바 원천 차단 — 실제 메일처럼 콘텐츠 높이에 맞춰 통짜로 보인다
      scrolling="no"
      srcDoc={signatureSrcDoc(signature, scale)}
      onLoad={(e) => {
        try {
          const doc = e.currentTarget.contentWindow?.document;
          const h = Math.max(
            doc?.body?.scrollHeight ?? 0,
            doc?.documentElement?.scrollHeight ?? 0,
          );
          if (h) {
            // 측정 높이에 여유를 둬 마지막 줄이 잘리거나 스크롤이 남지 않게 한다.
            setHeight(Math.min(h + 16, 1200));
          }
        } catch {
          // 높이 측정 실패 시 기본 높이 유지
        }
      }}
      style={{ height }}
      className={cn(
        "block w-full",
        bordered && "rounded-md border bg-white",
        className,
      )}
    />
  );
}
