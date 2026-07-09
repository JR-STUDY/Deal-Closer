import Link from "next/link";
import { ArrowRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import { BrandMark, BrandWordmark } from "@/components/brand-logo";

export default function Home() {
  return (
    <main className="flex flex-1 items-center justify-center p-6">
      <div className="w-full max-w-2xl space-y-8 text-center">
        <div className="flex items-center justify-center gap-3">
          <BrandMark className="size-14" />
          <BrandWordmark className="text-4xl tracking-tighter" />
        </div>

        <div className="space-y-4">
          <h1 className="text-4xl font-bold tracking-tight text-balance">
            AI로 완성하는 영업 문서,
            <br />
            견적서부터 계약 성사까지
          </h1>
          <p className="mx-auto max-w-md text-muted-foreground text-pretty">
            Rainmaker는 자연어 한 줄로 견적서·계약서·제안서를 생성하고, 웹에서
            편집한 뒤 바로 이메일로 발송하는 영업 문서 자동화 플랫폼입니다.
          </p>
        </div>

        <div className="flex flex-col justify-center gap-3 sm:flex-row">
          <Button asChild size="lg">
            <Link href="/dashboard">
              영업 포털 열기
              <ArrowRight className="size-4" />
            </Link>
          </Button>
          <Button asChild size="lg" variant="outline">
            <Link href="/analytics">관리자 콘솔 열기</Link>
          </Button>
        </div>

        <p className="text-xs text-muted-foreground">
          MVP 데모 · 인증 없이 두 콘솔을 바로 확인할 수 있습니다
        </p>
      </div>
    </main>
  );
}
