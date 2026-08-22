"use client";

import { useState } from "react";
import { Save, Trash2, Upload, Image as ImageIcon } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";
import {
  BIZ_REG_NO_FORMAT,
  ACCOUNT_BIZ_REG_NO_MAX,
} from "@/lib/account";
import { CONTACT_PHONE_FORMAT } from "@/lib/contact";
import {
  COMPANY_ADDRESS_MAX,
  COMPANY_NAME_MAX,
  MAX_BRANDING_IMAGE_BYTES,
  brandingImageError,
  type BrandingFormValues,
} from "@/lib/branding";

/**
 * 회사 정보 폼 — 문서의 **공급자** 자리에 박히는 값을 한 화면에서 관리한다 (설정 7).
 *
 * 관리자 콘솔의 `브랜딩 설정`(`(admin)/settings/branding`) 에서 옮겨 와
 * `@/components/account` 로 공용화했다. 예전 폼은 회사명·로고·기본 색상 세 가지였고
 * 저장이 toast 목업이었다 — 이제 대표자명·사업자등록번호·주소·대표 연락처·인감을 더하고
 * `PATCH /api/branding` 으로 실제 저장한다.
 *
 * **검증 규칙을 새로 만들지 않는다** — 사업자등록번호·연락처 형식과 이미지 상한은 모두
 * `@/lib/branding` 의 순수 함수를 쓰고, 서버가 같은 함수로 다시 판정한다.
 */
export function CompanyForm({ initial }: { initial: BrandingFormValues }) {
  const [values, setValues] = useState(initial);
  const [saving, setSaving] = useState(false);

  const set = <K extends keyof BrandingFormValues>(
    key: K,
    value: BrandingFormValues[K],
  ) => setValues((prev) => ({ ...prev, [key]: value }));

  function handleColorHexChange(value: string) {
    set("primaryColor", value.startsWith("#") ? value : `#${value}`);
  }

  async function handleSave() {
    setSaving(true);
    try {
      const res = await fetch("/api/branding", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(values),
      });
      const json = (await res.json()) as {
        data?: BrandingFormValues;
        error?: string;
      };
      if (!res.ok) {
        toast.error(json.error ?? "회사 정보를 저장하지 못했습니다.");
        return;
      }
      // 서버가 정규화한 값(사업자등록번호 하이픈·연락처 표기)을 화면에 되돌려 준다 —
      // 저장된 값과 보이는 값이 다르면 다음 저장에서 무엇이 바뀔지 알 수 없다.
      if (json.data) setValues((prev) => ({ ...prev, ...json.data }));
      toast.success("회사 정보를 저장했습니다.");
    } catch {
      toast.error("회사 정보를 저장하지 못했습니다. 잠시 후 다시 시도해주세요.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="grid gap-6 lg:grid-cols-3">
      <div className="space-y-6 lg:col-span-2">
        <Card>
          <CardHeader>
            <CardTitle className="text-base">회사 정보</CardTitle>
            <CardDescription>
              견적서·계약서의 공급자 자리에 그대로 표시되는 정보입니다. 모두 선택
              입력이며, 채워 두시면 문서를 만들 때 자동으로 들어갑니다.
            </CardDescription>
          </CardHeader>
          <CardContent className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label htmlFor="company-name">회사명</Label>
              <Input
                id="company-name"
                placeholder="회사명을 입력해 주세요"
                maxLength={COMPANY_NAME_MAX}
                value={values.companyName}
                onChange={(e) => set("companyName", e.target.value)}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="company-ceo">대표자명</Label>
              <Input
                id="company-ceo"
                placeholder="대표자명을 입력해 주세요"
                value={values.ceoName}
                onChange={(e) => set("ceoName", e.target.value)}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="company-biz-reg-no">사업자등록번호</Label>
              <Input
                id="company-biz-reg-no"
                inputMode="numeric"
                placeholder={BIZ_REG_NO_FORMAT}
                maxLength={ACCOUNT_BIZ_REG_NO_MAX}
                value={values.bizRegNo}
                onChange={(e) => set("bizRegNo", e.target.value)}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="company-phone">대표 연락처</Label>
              <Input
                id="company-phone"
                inputMode="tel"
                placeholder={CONTACT_PHONE_FORMAT}
                value={values.phone}
                onChange={(e) => set("phone", e.target.value)}
              />
            </div>
            <div className="space-y-1.5 sm:col-span-2">
              <Label htmlFor="company-address">회사 주소</Label>
              <Input
                id="company-address"
                placeholder="회사 주소를 입력해 주세요"
                maxLength={COMPANY_ADDRESS_MAX}
                value={values.address}
                onChange={(e) => set("address", e.target.value)}
              />
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-base">로고 · 인감</CardTitle>
            <CardDescription>
              문서 상단 로고와 하단 인감(직인) 이미지입니다. 1MB 이하 PNG·SVG 를
              권장합니다.
            </CardDescription>
          </CardHeader>
          <CardContent className="grid gap-4 sm:grid-cols-2">
            <ImageField
              id="company-logo"
              label="로고"
              hint="권장 크기 240×80px"
              value={values.logoUrl}
              onChange={(next) => set("logoUrl", next)}
            />
            <ImageField
              id="company-stamp"
              label="인감"
              hint="권장 크기 120×120px, 배경 투명"
              value={values.stampUrl}
              onChange={(next) => set("stampUrl", next)}
            />
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-base">기본 색상</CardTitle>
            <CardDescription>
              문서와 콘솔의 버튼·배지 등에 적용되는 기본 색상입니다.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="flex items-center gap-3">
              <Input
                type="color"
                value={values.primaryColor}
                onChange={(e) => set("primaryColor", e.target.value)}
                className="h-8 w-14 cursor-pointer p-1"
                aria-label="기본 색상 선택"
              />
              <Input
                value={values.primaryColor}
                onChange={(e) => handleColorHexChange(e.target.value)}
                className="max-w-40 font-mono"
                aria-label="기본 색상 코드"
                maxLength={7}
              />
            </div>
          </CardContent>
        </Card>
      </div>

      <div className="space-y-6">
        <Card>
          <CardHeader>
            <CardTitle className="text-base">미리보기</CardTitle>
            <CardDescription>
              입력한 정보가 문서 상단에 어떻게 보이는지 확인해 보세요.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-1">
              <p className="text-sm font-medium">
                {values.companyName || "회사명"}
              </p>
              {values.ceoName ? (
                <p className="text-xs text-muted-foreground">
                  대표 {values.ceoName}
                </p>
              ) : null}
              {values.bizRegNo ? (
                <p className="text-xs text-muted-foreground tabular-nums">
                  사업자등록번호 {values.bizRegNo}
                </p>
              ) : null}
              {values.address ? (
                <p className="text-xs text-muted-foreground">{values.address}</p>
              ) : null}
              {values.phone ? (
                <p className="text-xs text-muted-foreground tabular-nums">
                  {values.phone}
                </p>
              ) : null}
            </div>
            <Separator />
            <div className="space-y-3">
              <Button
                type="button"
                className="w-full text-primary-foreground"
                style={{ backgroundColor: values.primaryColor }}
              >
                버튼 미리보기
              </Button>
              <div>
                <Badge
                  className="border-0 text-white"
                  style={{ backgroundColor: values.primaryColor }}
                >
                  배지 미리보기
                </Badge>
              </div>
            </div>
          </CardContent>
        </Card>

        <Button className="w-full" onClick={handleSave} disabled={saving}>
          <Save className="size-4" />
          {saving ? "저장 중…" : "저장"}
        </Button>
      </div>
    </div>
  );
}

/**
 * 이미지 한 칸 — 로고·인감이 **같은 컴포넌트**를 쓴다. 둘로 나누면 한쪽만 손봤을 때
 * 상한·미리보기·제거 동작이 갈라진다.
 *
 * 별도 파일 저장소가 없어 파일을 `dataUrl` 로 읽어 컬럼에 담는다(에디터 이미지 블록과 같은
 * 방식). 크기는 고르는 즉시 재고, 서버가 저장 시 다시 잰다.
 */
function ImageField({
  id,
  label,
  hint,
  value,
  onChange,
}: {
  id: string;
  label: string;
  hint: string;
  value: string;
  onChange: (next: string) => void;
}) {
  return (
    <div className="space-y-2">
      <Label htmlFor={id}>{label}</Label>
      <div className="flex flex-col items-center justify-center gap-3 rounded-lg border border-dashed py-6 text-center">
        {value ? (
          // 문서 자산은 dataUrl·외부 주소를 함께 받아 next/image 의 최적화 대상이 아니다
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={value}
            alt={`${label} 미리보기`}
            className="h-16 max-w-40 object-contain"
          />
        ) : (
          <ImageIcon className="size-8 text-muted-foreground" />
        )}
        <p className="text-xs text-muted-foreground">{hint}</p>
        <div className="flex items-center gap-2">
          <Button type="button" variant="outline" size="sm" asChild>
            <label htmlFor={id} className="cursor-pointer">
              <Upload className="size-3.5" />
              {value ? "다시 올리기" : "이미지 올리기"}
            </label>
          </Button>
          {value ? (
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={() => onChange("")}
            >
              <Trash2 className="size-3.5" />
              제거
            </Button>
          ) : null}
        </div>
        <input
          id={id}
          type="file"
          accept="image/*"
          className="sr-only"
          onChange={(e) => {
            const file = e.target.files?.[0];
            e.target.value = "";
            if (!file) return;
            if (file.size > MAX_BRANDING_IMAGE_BYTES) {
              toast.error(
                `${label} 이미지가 너무 큽니다. 1MB 이하 파일을 사용해주세요.`,
              );
              return;
            }
            const reader = new FileReader();
            reader.onload = () => {
              const dataUrl = String(reader.result);
              // 읽어 낸 값도 같은 순수 함수로 판정한다 — 서버와 같은 기준이어야 한다
              const error = brandingImageError(label, dataUrl);
              if (error) {
                toast.error(error);
                return;
              }
              onChange(dataUrl);
            };
            reader.onerror = () =>
              toast.error(`${label} 이미지를 읽지 못했습니다.`);
            reader.readAsDataURL(file);
          }}
        />
      </div>
    </div>
  );
}
