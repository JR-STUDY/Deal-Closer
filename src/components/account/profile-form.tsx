"use client";

import { useState } from "react";
import { Save } from "lucide-react";
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

type ProfileFormProps = {
  initialName: string;
  email: string;
};

/** 저장 목업 — 컴포넌트 상태에 의존하지 않아 모듈 스코프에 둔다 (매 렌더 재생성 방지) */
function handleSave() {
  toast.success("프로필이 저장되었습니다 (데모)");
}

/**
 * 계정 정보 폼 — 영업 담당자 포털·관리자 콘솔이 공용으로 사용한다.
 * 아바타·이름·역할은 상위 프로필 히어로(ProfileTabs)가 표시하므로 여기선 편집 필드만 둔다.
 * 이름 수정 후 저장을 목업(toast)으로 처리하며, 인증 도입 시 서버 전송으로 교체한다.
 */
export function ProfileForm({ initialName, email }: ProfileFormProps) {
  const [name, setName] = useState(initialName);

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">계정 정보</CardTitle>
        <CardDescription>
          이름은 문서 및 서비스 전반에 표시됩니다.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-5">
        <div className="grid gap-4 sm:grid-cols-2">
          <div className="space-y-1.5">
            <Label htmlFor="profile-name">이름</Label>
            <Input
              id="profile-name"
              value={name}
              onChange={(e) => setName(e.target.value)}
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="profile-email">이메일</Label>
            <Input id="profile-email" value={email} disabled />
          </div>
        </div>

        <Button onClick={handleSave}>
          <Save className="size-4" />
          저장
        </Button>
      </CardContent>
    </Card>
  );
}
