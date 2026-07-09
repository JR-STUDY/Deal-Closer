"use client";

import { useState } from "react";
import { Upload, Save, Image as ImageIcon } from "lucide-react";
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

type BrandingFormProps = {
  initialCompanyName: string;
  initialLogoUrl: string | null;
  initialPrimaryColor: string;
};

/** 브랜딩 설정 폼 — 회사명/로고/기본 색상을 입력받고 저장을 목업 처리한다 */
export function BrandingForm({
  initialCompanyName,
  initialLogoUrl,
  initialPrimaryColor,
}: BrandingFormProps) {
  const [companyName, setCompanyName] = useState(initialCompanyName);
  const [logoUrl] = useState(initialLogoUrl);
  const [primaryColor, setPrimaryColor] = useState(initialPrimaryColor);

  function handleLogoUploadClick() {
    toast.info("데모 환경에서는 실제 로고 업로드가 지원되지 않습니다.");
  }

  function handleColorHexChange(value: string) {
    setPrimaryColor(value.startsWith("#") ? value : `#${value}`);
  }

  function handleSave() {
    toast.success("브랜딩 설정이 저장되었습니다 (데모)");
  }

  return (
    <div className="grid gap-6 lg:grid-cols-3">
      <div className="space-y-6 lg:col-span-2">
        <Card>
          <CardHeader>
            <CardTitle className="text-base">회사 정보</CardTitle>
            <CardDescription>
              발송 문서 상단에 표시될 회사명을 입력해 주세요.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-1.5">
            <Label htmlFor="company-name">회사명</Label>
            <Input
              id="company-name"
              placeholder="회사명을 입력해 주세요"
              value={companyName}
              onChange={(e) => setCompanyName(e.target.value)}
            />
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-base">로고</CardTitle>
            <CardDescription>
              문서와 콘솔 상단에 표시될 로고 이미지입니다.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="flex flex-col items-center justify-center gap-3 rounded-lg border border-dashed py-10 text-center">
              {logoUrl ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={logoUrl}
                  alt="회사 로고"
                  className="h-16 max-w-40 object-contain"
                />
              ) : (
                <ImageIcon className="size-8 text-muted-foreground" />
              )}
              <p className="text-sm text-muted-foreground">
                권장 크기 240×80px, PNG/SVG
              </p>
              <Button type="button" variant="outline" size="sm" onClick={handleLogoUploadClick}>
                <Upload className="size-3.5" />
                로고 업로드
              </Button>
            </div>
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
                value={primaryColor}
                onChange={(e) => setPrimaryColor(e.target.value)}
                className="h-8 w-14 cursor-pointer p-1"
                aria-label="기본 색상 선택"
              />
              <Input
                value={primaryColor}
                onChange={(e) => handleColorHexChange(e.target.value)}
                className="max-w-40 font-mono"
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
              선택한 색상이 실제 화면에 어떻게 보이는지 확인해 보세요.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div>
              <p className="mb-2 text-sm font-medium">
                {companyName || "회사명"}
              </p>
              <p className="text-xs text-muted-foreground">
                발송 문서 상단에 표시될 이름입니다.
              </p>
            </div>
            <Separator />
            <div className="space-y-3">
              <Button
                type="button"
                className="w-full text-primary-foreground"
                style={{ backgroundColor: primaryColor }}
              >
                버튼 미리보기
              </Button>
              <div>
                <Badge
                  className="border-0 text-white"
                  style={{ backgroundColor: primaryColor }}
                >
                  배지 미리보기
                </Badge>
              </div>
            </div>
          </CardContent>
        </Card>

        <Button className="w-full" onClick={handleSave}>
          <Save className="size-4" />
          저장
        </Button>
      </div>
    </div>
  );
}
