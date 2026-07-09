import { AppSidebar } from "@/components/app-sidebar";
import { prisma } from "@/lib/db";
import { getCurrentUser } from "@/lib/session";
import { USER_ROLE_LABELS, type UserRole } from "@/lib/constants";

export default async function UserLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const user = await getCurrentUser();
  // 사이드바 문서함별 폴더 (내 문서함/공용문서함 아래 표시)
  const folders = await prisma.folder.findMany({
    where: { orgId: user.orgId },
    orderBy: [{ isCommon: "asc" }, { sortOrder: "asc" }, { name: "asc" }],
    select: { id: true, name: true, isCommon: true, parentId: true },
  });

  return (
    <div className="flex h-screen overflow-hidden">
      <AppSidebar
        variant="user"
        user={{
          name: user.name,
          roleLabel: USER_ROLE_LABELS[user.role as UserRole] ?? user.role,
        }}
        folders={folders}
      />
      <div className="flex min-w-0 flex-1 flex-col">{children}</div>
    </div>
  );
}
