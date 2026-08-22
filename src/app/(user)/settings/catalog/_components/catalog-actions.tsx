"use client";

import { Upload, Plus } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";

/** 카탈로그 상단 액션 — 엑셀 업로드 / 품목 추가 (데모 목업) */
export function CatalogActions() {
  return (
    <>
      <Button
        variant="outline"
        onClick={() =>
          toast.info("엑셀 업로드 기능은 준비 중입니다 (데모).")
        }
      >
        <Upload className="size-4" />
        엑셀 업로드
      </Button>
      <Button
        onClick={() =>
          toast.success("새 품목이 추가되었습니다 (데모).")
        }
      >
        <Plus className="size-4" />
        품목 추가
      </Button>
    </>
  );
}
