import { AppSidebar } from "@/components/app-sidebar";
import { prisma } from "@/lib/db";
import { getCurrentUser } from "@/lib/session";

export default async function UserLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const user = await getCurrentUser();
  // 사이드바 폴더 트리 (내 문서함 아래 표시)
  const folders = await prisma.folder.findMany({
    where: { orgId: user.orgId },
    orderBy: [{ sortOrder: "asc" }, { name: "asc" }],
    select: { id: true, name: true, parentId: true },
  });

  return (
    <div className="flex h-screen overflow-hidden">
      <AppSidebar
        variant="user"
        user={{ name: user.name }}
        folders={folders}
      />
      <div className="flex min-w-0 flex-1 flex-col">{children}</div>
    </div>
  );
}
