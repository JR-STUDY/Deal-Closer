"use client";

import { useState, type FormEvent } from "react";
import { KeyRound } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";

/** 새 비밀번호 최소 길이 (정책 VAL_*) */
const MIN_LENGTH = 8;

/**
 * 비밀번호 변경 카드 — 영업 담당자 포털·관리자 콘솔이 공용으로 사용한다.
 * MVP 는 실제 인증이 없어 저장을 목업(toast)으로 처리한다.
 * 인증(NextAuth 등) 도입 시 handleSubmit 에서 서버로 전송하도록 교체한다.
 * - 평문 비밀번호는 로깅하지 않으며 로컬 state 에만 잠시 보관한다.
 */
export function PasswordForm() {
  const [current, setCurrent] = useState("");
  const [next, setNext] = useState("");
  const [confirm, setConfirm] = useState("");
  const [error, setError] = useState<string | null>(null);

  function validate(): string | null {
    if (!current || !next || !confirm) return "모든 항목을 입력해 주세요.";
    if (next.length < MIN_LENGTH)
      return `새 비밀번호는 ${MIN_LENGTH}자 이상이어야 합니다.`;
    if (next === current) return "새 비밀번호가 현재 비밀번호와 같습니다.";
    if (next !== confirm) return "새 비밀번호가 일치하지 않습니다.";
    return null;
  }

  function handleSubmit(e: FormEvent) {
    e.preventDefault();
    const message = validate();
    if (message) {
      setError(message);
      toast.error(message);
      return;
    }
    setError(null);
    setCurrent("");
    setNext("");
    setConfirm("");
    toast.success("비밀번호가 변경되었습니다 (데모)");
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">비밀번호 변경</CardTitle>
        <CardDescription>
          안전을 위해 주기적으로 비밀번호를 변경해 주세요.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <form onSubmit={handleSubmit} className="space-y-5">
          <div className="space-y-1.5">
            <Label htmlFor="current-password">현재 비밀번호</Label>
            <Input
              id="current-password"
              type="password"
              autoComplete="current-password"
              value={current}
              onChange={(e) => setCurrent(e.target.value)}
            />
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label htmlFor="new-password">새 비밀번호</Label>
              <Input
                id="new-password"
                type="password"
                autoComplete="new-password"
                value={next}
                onChange={(e) => setNext(e.target.value)}
                aria-describedby="new-password-hint"
              />
              <p
                id="new-password-hint"
                className="text-xs text-muted-foreground"
              >
                {MIN_LENGTH}자 이상 입력해 주세요.
              </p>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="confirm-password">새 비밀번호 확인</Label>
              <Input
                id="confirm-password"
                type="password"
                autoComplete="new-password"
                value={confirm}
                onChange={(e) => setConfirm(e.target.value)}
              />
            </div>
          </div>

          {error ? (
            <p role="alert" className="text-sm text-destructive">
              {error}
            </p>
          ) : null}

          <Button type="submit">
            <KeyRound className="size-4" />
            비밀번호 변경
          </Button>
        </form>
      </CardContent>
    </Card>
  );
}
