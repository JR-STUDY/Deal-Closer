"use client";

import { useState } from "react";
import { Save } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
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
  roleLabel: string;
};

/** 관리자 프로필 폼 — 이름 수정 후 저장을 목업 처리한다 */
export function ProfileForm({
  initialName,
  email,
  roleLabel,
}: ProfileFormProps) {
  const [name, setName] = useState(initialName);

  function handleSave() {
    toast.success("프로필이 저장되었습니다 (데모)");
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">계정 정보</CardTitle>
        <CardDescription>
          이름은 문서 및 콘솔 전반에 표시됩니다.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-5">
        <div className="flex items-center gap-4">
          <Avatar size="lg">
            <AvatarFallback>{(name || "?").slice(0, 2)}</AvatarFallback>
          </Avatar>
          <div>
            <p className="font-medium">{name || "이름 없음"}</p>
            <Badge variant="outline" className="mt-1 font-normal">
              {roleLabel}
            </Badge>
          </div>
        </div>

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
