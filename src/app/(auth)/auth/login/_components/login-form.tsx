"use client";

import { useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";

/** 관리자 로그인 폼 (데모: 실제 인증 없이 /analytics 로 이동) */
export function LoginForm() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [keepSignedIn, setKeepSignedIn] = useState(false);

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (!email.trim() || !password.trim()) {
      toast.error("이메일과 비밀번호를 입력해 주세요.");
      return;
    }

    router.push("/analytics");
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <div className="space-y-1.5">
        <Label htmlFor="admin-email">이메일</Label>
        <Input
          id="admin-email"
          type="email"
          placeholder="admin@specflow.ai"
          value={email}
          onChange={(event) => setEmail(event.target.value)}
        />
      </div>

      <div className="space-y-1.5">
        <Label htmlFor="admin-password">비밀번호</Label>
        <Input
          id="admin-password"
          type="password"
          placeholder="비밀번호를 입력하세요"
          value={password}
          onChange={(event) => setPassword(event.target.value)}
        />
      </div>

      <div className="flex items-center justify-between">
        <Label
          htmlFor="keep-signed-in"
          className="text-sm font-normal text-muted-foreground"
        >
          로그인 상태 유지
        </Label>
        <Switch
          id="keep-signed-in"
          checked={keepSignedIn}
          onCheckedChange={setKeepSignedIn}
        />
      </div>

      <Button type="submit" className="w-full">
        로그인
      </Button>
    </form>
  );
}
