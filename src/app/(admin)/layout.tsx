import { AppSidebar } from "@/components/app-sidebar";
import { getAdminUser } from "@/lib/session";
import { USER_ROLE_LABELS, type UserRole } from "@/lib/constants";

export default async function AdminLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const user = await getAdminUser();

  return (
    <div className="flex h-full flex-1">
      <AppSidebar
        variant="admin"
        user={{
          name: user.name,
          roleLabel: USER_ROLE_LABELS[user.role as UserRole] ?? user.role,
        }}
      />
      <div className="flex min-w-0 flex-1 flex-col">{children}</div>
    </div>
  );
}
