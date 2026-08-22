"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { EMPTY_CATALOG_FORM } from "@/lib/catalog";
import { CatalogFormDialog } from "./catalog-form-dialog";

/**
 * 카탈로그 상단 액션 — 품목 등록.
 *
 * 다이얼로그는 열 때만 마운트해 매번 빈 폼으로 시작하고, 저장 후에는 목록 서버 컴포넌트를
 * 다시 조회한다 (거래처 목록의 `new-account-button` 과 같은 골격).
 *
 * 예전에 나란히 있던 **`엑셀 업로드` 버튼은 걷어냈다** — 누르면 "준비 중입니다 (데모)"
 * toast 만 뜨는 목업이었다. 실제 일괄 등록은 열 매핑·미리보기·오류 행 안내와 중복 정책
 * (같은 SKU·품목명을 갱신할지 건너뛸지)까지 필요한 별개의 기능이고, `@/lib/attachments`
 * 의 엑셀 추출은 **프롬프트용 TSV 텍스트**(시트 목록 머리글·병합셀 공백·길이 잘림)라
 * 표로 되짚어 읽기에 맞지 않는다. 있는 척하는 버튼은 남기지 않는다 —
 * 수신함에 가짜 메일을 채우지 않은 것과 같은 판단이다.
 */
export function CatalogActions({ categories }: { categories: string[] }) {
  const router = useRouter();
  const [isCreating, setIsCreating] = useState(false);

  return (
    <>
      <Button onClick={() => setIsCreating(true)}>
        <Plus className="size-4" />
        품목 추가
      </Button>

      {isCreating ? (
        <CatalogFormDialog
          initial={EMPTY_CATALOG_FORM}
          categories={categories}
          title="새 품목 등록"
          description="카테고리와 품목명만 입력하시면 등록됩니다. 등록하시면 견적서 품목표에서 바로 고를 수 있습니다."
          // 닫기를 먼저, 새로 고침을 나중에 (`catalog-row-actions` 주석 참고)
          onSaved={() => {
            setIsCreating(false);
            router.refresh();
          }}
          onClose={() => setIsCreating(false)}
        />
      ) : null}
    </>
  );
}
