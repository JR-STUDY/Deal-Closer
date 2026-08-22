import Link from "next/link";
import { ArrowRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import { BrandWordmark } from "@/components/brand-logo";
import { HeroAnimation } from "./_components/hero-animation";

export default function Home() {
  return (
    <main className="flex flex-1 items-center justify-center p-6">
      <div className="w-full max-w-2xl space-y-8 text-center">
        <div className="flex flex-col items-center justify-center gap-3">
          <HeroAnimation />
          <BrandWordmark className="text-3xl tracking-tighter" />
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

        {/*
          진입점은 **영업 포털 하나**다 (2.0.0). 관리자 콘솔 링크는 걷어냈다 —
          팀원 관리·요금·크레딧·메일 도메인·통계는 라우트가 그대로 살아 있고 주소를 아는
          사람만 들어간다. 담당자가 실제로 쓰는 품목 카탈로그·회사 정보는 포털의
          `설정` 으로 옮겼으므로, 여기서 콘솔을 나란히 권할 이유가 없다.
        */}
        <div className="flex justify-center">
          <Button asChild size="lg">
            <Link href="/dashboard">
              영업 포털 열기
              <ArrowRight className="size-4" />
            </Link>
          </Button>
        </div>

        <p className="text-xs text-muted-foreground">
          MVP 데모 · 인증 없이 바로 확인할 수 있습니다
        </p>
      </div>
    </main>
  );
}
