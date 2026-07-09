import { AppSidebar } from "@/components/app-sidebar";
import { getCurrentUser } from "@/lib/session";
import { USER_ROLE_LABELS, type UserRole } from "@/lib/constants";

export default async function UserLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const user = await getCurrentUser();

  return (
    <div className="flex h-screen overflow-hidden">
      <AppSidebar
        variant="user"
        user={{
          name: user.name,
          roleLabel: USER_ROLE_LABELS[user.role as UserRole] ?? user.role,
        }}
      />
      <div className="flex min-w-0 flex-1 flex-col">{children}</div>
    </div>
  );
}
