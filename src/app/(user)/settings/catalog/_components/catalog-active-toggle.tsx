"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Switch } from "@/components/ui/switch";

/**
 * 목록의 활성/비활성 토글.
 *
 * 활성 여부는 **에디터 품목표의 선택 목록에 뜨는지**를 가른다. 그래서 지우는 것 말고
 * "내려두는" 길이 필요하다 — 더 이상 팔지 않는 품목을 지우면 이름으로만 남은 지난 견적서를
 * 나중에 대조할 수 없다.
 *
 * 켜고 끄는 값 하나라 팝업을 열지 않고 목록에서 바로 바꾼다. 저장은 다이얼로그와 **같은
 * 라우트**(`PATCH /api/catalog/:id`)이고 빠진 필드는 서버의 `withCatalogDefaults()` 가
 * 현재 값으로 채운다 — 토글 전용 라우트를 만들면 검증 규칙이 두 벌이 된다.
 *
 * 화면에는 **먼저 반영하고 실패하면 되돌린다**(칸반 단계 전이·기회 인라인 수정과 같은 방식).
 * 성공 뒤 `router.refresh()` 로 서버 컴포넌트를 다시 조회해 비활성 표시가 함께 갱신되게 한다.
 */
export function CatalogActiveToggle({
  itemId,
  name,
  isActive,
}: {
  itemId: string;
  name: string;
  isActive: boolean;
}) {
  const router = useRouter();
  const [active, setActive] = useState(isActive);
  const [isSaving, setIsSaving] = useState(false);

  const handleChange = async (next: boolean) => {
    setActive(next);
    setIsSaving(true);
    try {
      const res = await fetch(`/api/catalog/${itemId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ isActive: next }),
      });
      if (!res.ok) {
        const json = await res.json().catch(() => null);
        toast.error(json?.error ?? "상태를 바꾸지 못했습니다.");
        setActive(!next); // 화면을 이전 값으로 되돌린다
        return;
      }
      toast.success(
        next
          ? `"${name}" 을(를) 활성으로 바꿨습니다. 견적서 품목표에서 고르실 수 있습니다.`
          : `"${name}" 을(를) 비활성으로 내렸습니다. 새 견적서의 선택 목록에서 감춰지며, 이미 만든 문서는 그대로입니다.`,
      );
      router.refresh();
    } catch {
      toast.error("상태를 바꾸지 못했습니다.");
      setActive(!next);
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <div className="flex items-center gap-2">
      <Switch
        checked={active}
        disabled={isSaving}
        aria-label={`${name} 활성 상태`}
        onCheckedChange={handleChange}
      />
      {/* 상태를 색으로만 알리지 않는다 — 글자로도 적는다 (정책 ACC_*) */}
      <span
        className={
          active ? "text-xs text-foreground" : "text-xs text-muted-foreground"
        }
      >
        {active ? "활성" : "비활성"}
      </span>
    </div>
  );
}
