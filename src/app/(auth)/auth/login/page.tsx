import { Card, CardContent } from "@/components/ui/card";
import { BrandMark, BrandWordmark } from "@/components/brand-logo";
import { LoginForm } from "./_components/login-form";

export default function AdminLoginPage() {
  return (
    <Card className="w-full max-w-sm">
      <CardContent className="space-y-6">
        <div className="flex flex-col items-center gap-3 text-center">
          <div className="flex items-center gap-2">
            <BrandMark className="size-9" />
            <BrandWordmark className="text-xl" />
          </div>
          <h1 className="text-xl font-semibold tracking-tight">
            관리자 콘솔 로그인
          </h1>
        </div>

        <LoginForm />

        <p className="text-center text-xs text-muted-foreground">
          MVP 데모 환경입니다. 실제 인증 없이 관리자 콘솔로 진입합니다.
        </p>
      </CardContent>
    </Card>
  );
}
