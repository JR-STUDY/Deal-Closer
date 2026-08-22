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
  const [isSaving, setIsSaving] = useState(false);
  /*
    낙관적 표시값 — **서버가 보낸 `isActive` 를 렌더 중에 다시 받아들인다.**

    예전에는 `useState(isActive)` 하나였다. 초기값은 **처음 마운트할 때만** 읽히므로,
    같은 행이 살아 있는 채로 서버 값이 바뀌면 스위치가 옛 값에 머문다 — ⋯ → 수정
    다이얼로그에서도 활성을 바꿀 수 있으니(같은 `PATCH` 라우트다) 실제로 벌어지는 일이다.
    행이 `key={item.id}` 라 다른 품목의 상태가 새는 일은 없지만, **같은 품목**의 상태는
    갈린다.

    `useEffect` 로 맞추지 않는다 — 한 프레임 늦게 반영되고 react-doctor
    `set-state-in-effect` 에 걸린다. 프로젝트의 `account-combobox` 와 같은 **렌더 중
    조정**이다: 서버가 보낸 값이 달라진 순간에만 받아들이고, 그 사이 사용자가 누른 값은
    그대로 둔다(저장 실패 시 되돌리는 동작을 지키기 위해서다).
  */
  const [optimistic, setOptimistic] = useState<{
    server: boolean;
    shown: boolean;
  }>({ server: isActive, shown: isActive });
  if (optimistic.server !== isActive) {
    setOptimistic({ server: isActive, shown: isActive });
  }
  const active = optimistic.shown;
  const setActive = (next: boolean) =>
    setOptimistic((prev) => ({ ...prev, shown: next }));

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
