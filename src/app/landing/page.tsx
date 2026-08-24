import Link from "next/link";
import { ArrowRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import { BrandWordmark } from "@/components/brand-logo";
import { HeroAnimation } from "../_components/hero-animation";

/**
 * 제품 소개 랜딩 (`/landing`).
 *
 * **`/` 는 이 화면이 아니라 대시보드로 보낸다** — 인증이 없는 MVP 라 여기서 할 일이
 * "영업 포털 열기" 버튼 한 번 누르는 것뿐이었고, 매번 그 한 번을 지나야 했다.
 * 그래도 코드를 지우지 않고 주소를 남긴 이유는 데모·영업 자리에서 이 화면을 그대로
 * 띄우기 때문이다(`(admin)` 라우트를 사이드바에서만 걷어낸 것과 같은 판단 — 진입점을
 * 없애는 것과 화면을 없애는 것은 다르다).
 *
 * `(user)` 그룹 밖이라 사이드바가 없다. 옮기기 전과 같은 자리다.
 */
export default function LandingPage() {
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
