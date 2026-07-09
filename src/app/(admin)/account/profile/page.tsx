import { getAdminUser } from "@/lib/session";
import { USER_ROLE_LABELS, type UserRole } from "@/lib/constants";
import { PageHeader } from "@/components/page-header";
import { ProfileTabs } from "@/components/account/profile-tabs";
import { ProfileForm } from "@/components/account/profile-form";
import { PasswordForm } from "@/components/account/password-form";
import { NotificationSettings } from "./_components/notification-settings";

export default async function AdminProfilePage() {
  const user = await getAdminUser();
  const roleLabel = USER_ROLE_LABELS[user.role as UserRole] ?? user.role;

  return (
    <>
      <PageHeader
        title="프로필 설정"
        description="계정 정보와 보안, 알림 설정을 관리합니다."
      />

      <div className="flex-1 overflow-auto p-8">
        <ProfileTabs
          name={user.name}
          email={user.email}
          roleLabel={roleLabel}
          sections={[
            {
              value: "account",
              label: "계정 정보",
              content: (
                <ProfileForm initialName={user.name} email={user.email} />
              ),
            },
            {
              value: "security",
              label: "보안",
              content: <PasswordForm username={user.email} />,
            },
            {
              value: "notifications",
              label: "알림",
              content: <NotificationSettings />,
            },
          ]}
        />
      </div>
    </>
  );
}
