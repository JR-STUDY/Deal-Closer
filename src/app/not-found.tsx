import Link from "next/link";
import { FileQuestion } from "lucide-react";
import { Button } from "@/components/ui/button";

/** 전역 404 화면 (정책 STATE_*) — 없는 경로 진입 시 흰 화면 대신 안내한다. */
export default function NotFound() {
  return (
    <div className="flex min-h-svh flex-col items-center justify-center gap-5 p-8 text-center">
      <div className="flex size-14 items-center justify-center rounded-full bg-muted">
        <FileQuestion className="size-7 text-muted-foreground" aria-hidden />
      </div>
      <div className="space-y-1.5">
        <h1 className="text-2xl font-semibold">페이지를 찾을 수 없습니다</h1>
        <p className="text-sm text-muted-foreground">
          요청하신 페이지가 없거나 이동되었을 수 있습니다.
        </p>
      </div>
      <Button asChild>
        <Link href="/">홈으로 돌아가기</Link>
      </Button>
    </div>
  );
}
