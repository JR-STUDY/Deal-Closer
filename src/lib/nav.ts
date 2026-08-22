import type { LucideIcon } from "lucide-react";
import {
  LayoutDashboard,
  Building2,
  Target,
  Sparkles,
  FolderClosed,
  Mail,
  Settings,
  BarChart3,
  Users,
  CreditCard,
  AtSign,
} from "lucide-react";

export type NavChild = {
  href: string;
  label: string;
  /**
   * 그 화면의 **탭**까지 지정할 때 쓴다 (`?tab=`).
   *
   * `설정 > 회사 정보` 가 이것을 쓰는 유일한 자리다. 예전에는 이 항목과 사이드바 **맨 아래
   * 프로필 영역**이 둘 다 `/settings/profile` 로 가서, 이름만 다른 같은 링크가 두 개 있었다
   * (사용자 피드백: "회사 프로필과 하단 프로필 고정영역이 동일하다"). 그 화면은 개인
   * (`계정 정보`·`보안`)과 회사(`회사 정보`)가 탭으로 나뉘어 있으므로, **두 진입점이 서로
   * 다른 탭을 가리키게** 해서 이름과 목적지를 맞췄다 — 아래 프로필은 `내 계정`, 설정 묶음은
   * `회사 정보` 다.
   */
  tab?: string;
};

export type NavItem = {
  href: string;
  label: string;
  icon: LucideIcon;
  /** 하위 항목이 있는 묶음의 부모는 첫 하위 항목과 같은 곳을 가리킨다 (탭까지 같게) */
  tab?: string;
  /** 하위 항목(있으면 사이드바에서 펼쳐 표시) */
  children?: NavChild[];
};

/** 링크 주소 — 탭이 지정된 항목은 `?tab=` 을 붙인다 (matching 은 `href` 로 따로 한다) */
export function navHref(item: { href: string; tab?: string }): string {
  return item.tab ? `${item.href}?tab=${item.tab}` : item.href;
}

/**
 * 영업 담당자 포털 (user-web) 네비게이션 — **제품의 유일한 사이드바**다.
 *
 * 관리자 콘솔은 사이드바·랜딩에서 진입점을 걷어냈다(2.0.0). 팀원 관리·요금·크레딧·
 * 메일 도메인·통계는 라우트와 코드가 그대로 살아 있고 주소로만 들어간다 — MVP 에는 인증이
 * 없어(`session.ts` 가 데모 사용자 1명 고정) "관리자"라는 주체를 화면으로 나눌 근거가 없고,
 * 두 콘솔을 나란히 노출하면 담당자가 어느 쪽에서 무엇을 고치는지 매번 헷갈린다.
 * 담당자가 실제로 쓰는 두 가지(품목 카탈로그·회사 정보)만 이 사이드바로 옮겼다.
 *
 * **하위 항목이 있는 묶음은 부모 href 를 첫 하위 항목과 같게 둔다** — 부모를 눌러도 갈 곳이
 * 있어야 하고, 묶음 자체를 위한 별도 페이지를 새로 만들지 않는다.
 */
export const userNav: NavItem[] = [
  { href: "/dashboard", label: "대시보드", icon: LayoutDashboard },
  { href: "/accounts", label: "거래처", icon: Building2 },
  { href: "/opportunities", label: "영업 기회", icon: Target },
  { href: "/generator", label: "새 문서 생성", icon: Sparkles },
  {
    href: "/library",
    label: "문서 보관함",
    icon: FolderClosed,
    children: [
      { href: "/library/templates", label: "표준 양식" },
      { href: "/library", label: "내 문서함" },
    ],
  },
  {
    href: "/mail/sent",
    label: "메일",
    icon: Mail,
    children: [
      { href: "/mail/sent", label: "발송 이력" },
      { href: "/mail/inbox", label: "수신함" },
      { href: "/settings/email", label: "메일 연동" },
      { href: "/settings/templates", label: "메일 템플릿" },
    ],
  },
  {
    // 부모는 첫 하위 항목과 같은 곳으로 — 탭까지 같다
    href: "/settings/profile",
    tab: "company",
    label: "설정",
    icon: Settings,
    children: [
      // `회사 정보` 는 조직 값이다 — 개인 값(`계정 정보`·`보안`)은 아래 프로필 영역에서 연다
      { href: "/settings/profile", tab: "company", label: "회사 정보" },
      { href: "/settings/catalog", label: "품목 카탈로그" },
    ],
  },
];

/**
 * 관리자 콘솔 (admin-web) 네비게이션 — **사이드바에서 진입점을 지운 잔존 화면들**이다.
 *
 * 이 배열을 지우지 않는 이유: `(admin)/layout.tsx` 가 `variant="admin"` 으로 이 nav 를 읽고,
 * 남은 네 화면(통계·팀원·요금·메일 도메인)은 주소로 들어가면 그대로 동작해야 한다.
 * 담당자 포털로 **옮긴** 항목(마스터 데이터 → 품목 카탈로그, 브랜딩 설정·프로필 설정 →
 * 회사·프로필)은 여기서 뺐다 — 같은 것을 두 사이드바가 가리키면 어느 쪽이 진짜인지 알 수 없다.
 */
export const adminNav: NavItem[] = [
  { href: "/analytics", label: "통계·리포트", icon: BarChart3 },
  { href: "/team/members", label: "팀원 관리", icon: Users },
  { href: "/billing", label: "요금·크레딧", icon: CreditCard },
  { href: "/settings/mail-domain", label: "메일 도메인", icon: AtSign },
];
