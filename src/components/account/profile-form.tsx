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
import { CONTACT_PHONE_FORMAT } from "@/lib/contact";
import {
  PROFILE_NAME_MAX,
  PROFILE_POSITION_MAX,
  type ProfileFormValues,
} from "@/lib/user-profile";

/**
 * 계정 정보 폼 — 이름·직함·연락처 (설정 7).
 *
 * 아바타·이름·역할은 상위 프로필 히어로(`ProfileTabs`)가 표시하므로 여기선 편집 필드만 둔다.
 * 이메일은 계정 식별자라 이 화면에서 고치지 않는다(인증 도입 시 별도 절차가 필요하다).
 *
 * **직함·연락처는 개인 값이다** — 회사 대표 연락처·주소는 `회사 정보` 탭(`CompanyForm`)에
 * 있다. 두 곳에 같은 항목을 두면 문서에 어느 값이 박히는지 알 수 없다.
 * 저장은 `PATCH /api/profile` 하나이고 검증은 `@/lib/user-profile` 이 단일 기준이다.
 */
export function ProfileForm({
  initial,
  email,
}: {
  initial: ProfileFormValues;
  email: string;
}) {
  const [values, setValues] = useState(initial);
  const [saving, setSaving] = useState(false);

  const set = (key: keyof ProfileFormValues, value: string) =>
    setValues((prev) => ({ ...prev, [key]: value }));

  async function handleSave() {
    setSaving(true);
    try {
      const res = await fetch("/api/profile", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(values),
      });
      const json = (await res.json()) as {
        data?: ProfileFormValues;
        error?: string;
      };
      if (!res.ok) {
        toast.error(json.error ?? "프로필을 저장하지 못했습니다.");
        return;
      }
      // 서버가 정규화한 연락처 표기를 화면에 되돌려 준다 (저장된 값과 보이는 값을 맞춘다)
      if (json.data) setValues((prev) => ({ ...prev, ...json.data }));
      toast.success("프로필을 저장했습니다.");
    } catch {
      toast.error("프로필을 저장하지 못했습니다. 잠시 후 다시 시도해주세요.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">계정 정보</CardTitle>
        <CardDescription>
          이름과 직함은 문서·메일 발송 시 담당자 정보로 표시됩니다.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-5">
        <div className="grid gap-4 sm:grid-cols-2">
          <div className="space-y-1.5">
            <Label htmlFor="profile-name">이름</Label>
            <Input
              id="profile-name"
              maxLength={PROFILE_NAME_MAX}
              value={values.name}
              onChange={(e) => set("name", e.target.value)}
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="profile-email">이메일</Label>
            <Input id="profile-email" value={email} disabled />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="profile-position">직함</Label>
            <Input
              id="profile-position"
              placeholder="예: 영업1팀 팀장"
              maxLength={PROFILE_POSITION_MAX}
              value={values.position}
              onChange={(e) => set("position", e.target.value)}
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="profile-phone">연락처</Label>
            <Input
              id="profile-phone"
              inputMode="tel"
              placeholder={CONTACT_PHONE_FORMAT}
              value={values.phone}
              onChange={(e) => set("phone", e.target.value)}
            />
          </div>
        </div>

        <Button onClick={handleSave} disabled={saving}>
          <Save className="size-4" />
          {saving ? "저장 중…" : "저장"}
        </Button>
      </CardContent>
    </Card>
  );
}
