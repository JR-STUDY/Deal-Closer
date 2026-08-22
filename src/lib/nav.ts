import type { LucideIcon } from "lucide-react";
import {
  LayoutDashboard,
  Building2,
  Target,
  Sparkles,
  FolderClosed,
  Mail,
  BarChart3,
  Users,
  CreditCard,
  AtSign,
} from "lucide-react";

export type NavChild = {
  href: string;
  label: string;
};

export type NavItem = {
  href: string;
  label: string;
  icon: LucideIcon;
  /** 하위 항목(있으면 사이드바에서 펼쳐 표시) */
  children?: NavChild[];
};

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
      /*
        품목 카탈로그는 **문서함의 설정**이다 — 견적서 품목표의 자동완성이 보는 데이터이고,
        고치는 사람도 견적서를 쓰는 담당자다. 그래서 `설정` 묶음을 따로 두지 않고 여기 넣는다.

        `내 문서함` **앞**에 둔다: 폴더 트리가 `내 문서함` 의 자식으로 그려지므로, 그 뒤에
        오는 항목은 트리의 일부로 읽힌다(들여쓰기 한 단계 차이뿐이다). 앞의 둘은 문서를
        만들 때 쓰는 재료(양식·품목)이고 뒤가 결과물(내 문서함)이라는 순서도 된다.

        주소는 `/settings/catalog` 그대로다 — 사이드바에서 어디에 놓이는지와 라우트 경로는
        같아야 할 이유가 없고, 옮기면 리다이렉트를 하나 더 지고 가야 한다.
      */
      { href: "/settings/catalog", label: "품목 카탈로그" },
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
];

/*
  `설정` 묶음은 없다 (2.0.0 이후).

  담긴 것이 둘뿐이었고 둘 다 제 집이 생겼다 — **품목 카탈로그는 문서 보관함의 설정**이므로
  그 묶음으로 들어갔고, **회사 정보는 사이드바 맨 아래 프로필 줄**로 들어갔다(계정 정보·
  보안과 같은 화면의 탭이라 한자리에 모이는 것이 맞다). 남지 않은 묶음을 껍데기로 두면
  누르면 하위가 하나뿐인 서랍이 된다.

  `메일 연동`·`메일 템플릿` 처럼 주소가 `/settings/*` 인 화면이 아직 있지만, 그것들은
  `메일` 묶음에 있다 — **주소의 접두사와 사이드바의 자리는 같아야 할 이유가 없다.**
*/

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
