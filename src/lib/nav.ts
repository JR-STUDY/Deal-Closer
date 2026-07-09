import type { LucideIcon } from "lucide-react";
import {
  LayoutDashboard,
  Sparkles,
  FolderClosed,
  Mail,
  MailPlus,
  BarChart3,
  Users,
  Package,
  CreditCard,
  Palette,
  UserCog,
} from "lucide-react";

export type NavItem = {
  href: string;
  label: string;
  icon: LucideIcon;
};

/** 영업 담당자 포털 (user-web) 네비게이션 */
export const userNav: NavItem[] = [
  { href: "/dashboard", label: "대시보드", icon: LayoutDashboard },
  { href: "/generator", label: "새 문서 생성", icon: Sparkles },
  { href: "/library", label: "문서 보관함", icon: FolderClosed },
  { href: "/settings/email", label: "메일 연동", icon: Mail },
  { href: "/settings/templates", label: "메일 템플릿", icon: MailPlus },
];

/** 관리자 콘솔 (admin-web) 네비게이션 */
export const adminNav: NavItem[] = [
  { href: "/analytics", label: "통계·리포트", icon: BarChart3 },
  { href: "/team/members", label: "팀원 관리", icon: Users },
  { href: "/catalog", label: "마스터 데이터", icon: Package },
  { href: "/billing", label: "요금·크레딧", icon: CreditCard },
  { href: "/settings/branding", label: "브랜딩 설정", icon: Palette },
  { href: "/account/profile", label: "프로필 설정", icon: UserCog },
];
