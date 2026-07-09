"use client";

import { useRouter } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { Button } from "@/components/ui/button";

/**
 * 뒤로 가기 버튼.
 * 이전 방문 기록이 있으면 브라우저 히스토리로 되돌아가고(필터·스크롤 유지),
 * 없으면(직접 진입 등) fallbackHref 로 이동한다.
 */
export function BackButton({ fallbackHref }: { fallbackHref: string }) {
  const router = useRouter();
  return (
    <Button
      variant="ghost"
      size="icon"
      className="size-8 shrink-0"
      aria-label="뒤로 가기"
      onClick={() => {
        if (window.history.length > 1) router.back();
        else router.push(fallbackHref);
      }}
    >
      <ArrowLeft className="size-4" />
    </Button>
  );
}
