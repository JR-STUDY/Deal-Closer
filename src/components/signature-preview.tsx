"use client";

import { useState } from "react";
import { cn } from "@/lib/utils";
import { isHtmlSignature } from "@/lib/signature";

/** HTML 조각을 미리보기용 최소 문서로 감싼다 (앱 CSS와 격리, body 여백 정리) */
function toSrcDoc(html: string): string {
  const trimmed = html.trimStart();
  if (/^<!doctype|^<html/i.test(trimmed)) return html;
  return `<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width"><style>html,body{margin:0;padding:8px;background:#fff;font-family:'Malgun Gothic','Apple SD Gothic Neo','Noto Sans KR',Arial,sans-serif;}</style></head><body>${html}</body></html>`;
}

/**
 * 메일 서명 미리보기.
 * - 일반 텍스트: 줄바꿈을 살려 그대로 표시
 * - HTML: sandbox iframe 으로 렌더 (스크립트 비활성 → XSS 안전, 앱 스타일과 격리돼
 *   이메일 클라이언트처럼 정확히 보인다). onLoad 로 콘텐츠 높이에 맞춰 iframe 높이 조정.
 */
export function SignaturePreview({
  signature,
  className,
}: {
  signature: string;
  className?: string;
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
      srcDoc={toSrcDoc(signature)}
      onLoad={(e) => {
        try {
          const doc = e.currentTarget.contentWindow?.document;
          if (doc?.body) {
            setHeight(Math.min(doc.body.scrollHeight + 4, 640));
          }
        } catch {
          // 높이 측정 실패 시 기본 높이 유지
        }
      }}
      style={{ height }}
      className={cn(
        "block w-full rounded-md border bg-white",
        className,
      )}
    />
  );
}
