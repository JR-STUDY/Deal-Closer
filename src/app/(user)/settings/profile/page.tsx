import { prisma } from "@/lib/db";
import { getCurrentUser } from "@/lib/session";
import { USER_ROLE_LABELS, type UserRole } from "@/lib/constants";
import { toBrandingFormValues } from "@/lib/branding";
import { toProfileFormValues } from "@/lib/user-profile";
import { PageHeader } from "@/components/page-header";
import { ProfileTabs } from "@/components/account/profile-tabs";
import { ProfileForm } from "@/components/account/profile-form";
import { CompanyForm } from "@/components/account/company-form";
import { PasswordForm } from "@/components/account/password-form";

/**
 * 회사·프로필 설정 (`/settings/profile`) — 계정 정보 · 회사 정보 · 보안 (설정 7).
 *
 * 관리자 콘솔에 흩어져 있던 `브랜딩 설정`·`프로필 설정` 을 담당자 포털의 한 화면으로 모았다
 * (2.0.0). 나누는 기준은 **개인이냐 회사냐** 하나다 —
 * 직함·연락처는 사람마다 다르므로 `User`, 상호·대표자·사업자등록번호·주소·대표 연락처·
 * 로고·인감은 조직 단위이므로 `Branding` 이다. 같은 항목을 두 탭에 두지 않는다.
 */
export default async function ProfileSettingsPage() {
  const user = await getCurrentUser();
  // 사용자·조직은 한 번의 조회로 함께 온다(session 의 include: org) → 브랜딩만 더 읽는다
  const branding = await prisma.branding.findUnique({
    where: { orgId: user.orgId },
  });
  const roleLabel = USER_ROLE_LABELS[user.role as UserRole] ?? user.role;

  return (
    <>
      <PageHeader
        title="회사·프로필 설정"
        description="담당자 정보와 문서에 들어갈 회사 정보를 관리합니다."
      />

      <div className="flex-1 overflow-auto p-8 [scrollbar-gutter:stable]">
        <ProfileTabs
          name={user.name}
          email={user.email}
          roleLabel={roleLabel}
          sections={[
            {
              value: "account",
              label: "계정 정보",
              content: (
                <ProfileForm
                  initial={toProfileFormValues(user)}
                  email={user.email}
                />
              ),
            },
            {
              value: "company",
              label: "회사 정보",
              content: (
                <CompanyForm
                  // 회사명이 비어 있으면 조직명으로 시작한다 — 빈 칸보다 고칠 값이 낫다
                  initial={toBrandingFormValues(branding, user.org.name)}
                />
              ),
            },
            {
              value: "security",
              label: "보안",
              content: <PasswordForm username={user.email} />,
            },
          ]}
        />
      </div>
    </>
  );
}
