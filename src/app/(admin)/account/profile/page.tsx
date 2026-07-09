import { getAdminUser } from "@/lib/session";
import { USER_ROLE_LABELS, type UserRole } from "@/lib/constants";
import { PageHeader } from "@/components/page-header";
import { ProfileForm } from "./_components/profile-form";
import { NotificationSettings } from "./_components/notification-settings";

export default async function AdminProfilePage() {
  const user = await getAdminUser();

  return (
    <>
      <PageHeader
        title="프로필 설정"
        description="계정 정보와 알림 설정을 관리합니다."
      />

      <div className="flex-1 space-y-6 overflow-auto p-8">
        <ProfileForm
          initialName={user.name}
          email={user.email}
          roleLabel={USER_ROLE_LABELS[user.role as UserRole] ?? user.role}
        />
        <NotificationSettings />
      </div>
    </>
  );
}
