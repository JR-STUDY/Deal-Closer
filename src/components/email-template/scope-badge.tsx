import { Users, User } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { TEMPLATE_SCOPE_LABELS, type TemplateScope } from "@/lib/email-template";

/**
 * 템플릿 소유 범위(팀 공용/개인) 배지 — 목록 카드·상세에서 공용으로 쓴다.
 * 서버·클라이언트 양쪽에서 렌더 가능하도록 "use client" 없이 둔다.
 */
export function ScopeBadge({
  scope,
  showIcon = false,
}: {
  scope: TemplateScope;
  showIcon?: boolean;
}) {
  const Icon = scope === "team" ? Users : User;
  return (
    <Badge
      variant={scope === "team" ? "secondary" : "outline"}
      className="gap-1.5"
    >
      {showIcon ? <Icon className="size-3.5" /> : null}
      {TEMPLATE_SCOPE_LABELS[scope]}
    </Badge>
  );
}
