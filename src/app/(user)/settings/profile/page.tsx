import { getCurrentUser } from "@/lib/session";
import { USER_ROLE_LABELS, type UserRole } from "@/lib/constants";
import { PageHeader } from "@/components/page-header";
import { ProfileForm } from "@/components/account/profile-form";
import { PasswordForm } from "@/components/account/password-form";

export default async function ProfileSettingsPage() {
  const user = await getCurrentUser();

  return (
    <>
      <PageHeader
        title="프로필 설정"
        description="계정 정보와 보안을 관리합니다."
      />

      <div className="flex-1 space-y-6 overflow-auto p-8">
        <ProfileForm
          initialName={user.name}
          email={user.email}
          roleLabel={USER_ROLE_LABELS[user.role as UserRole] ?? user.role}
        />
        <PasswordForm />
      </div>
    </>
  );
}
