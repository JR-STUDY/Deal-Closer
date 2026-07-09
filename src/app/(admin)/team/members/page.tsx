import { Users, MailOpen } from "lucide-react";
import { prisma } from "@/lib/db";
import { getCurrentOrg } from "@/lib/session";
import { formatDate } from "@/lib/format";
import { USER_ROLE_LABELS, type UserRole } from "@/lib/constants";
import { PageHeader } from "@/components/page-header";
import { Badge } from "@/components/ui/badge";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  CardDescription,
} from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { InviteMemberDialog } from "./_components/invite-member-dialog";

export default async function TeamMembersPage() {
  const org = await getCurrentOrg();

  const [members, pendingInvites] = await Promise.all([
    prisma.user.findMany({
      where: { orgId: org.id },
      orderBy: { createdAt: "asc" },
    }),
    prisma.invite.findMany({
      where: { orgId: org.id, status: "PENDING" },
      orderBy: { createdAt: "desc" },
    }),
  ]);

  return (
    <>
      <PageHeader
        title="팀원 관리"
        description="조직 구성원과 초대 현황을 관리합니다."
        actions={<InviteMemberDialog />}
      />

      <div className="flex-1 space-y-6 overflow-auto p-8">
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              <Users className="size-4" />
              구성원
            </CardTitle>
            <CardDescription>
              총 {members.length}명의 구성원이 조직에 속해 있습니다.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>이름</TableHead>
                  <TableHead>이메일</TableHead>
                  <TableHead>역할</TableHead>
                  <TableHead className="text-right">가입일</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {members.map((member) => (
                  <TableRow key={member.id}>
                    <TableCell>
                      <div className="flex items-center gap-2.5">
                        <Avatar size="sm">
                          <AvatarFallback>
                            {member.name.slice(0, 2)}
                          </AvatarFallback>
                        </Avatar>
                        <span className="font-medium">{member.name}</span>
                      </div>
                    </TableCell>
                    <TableCell className="text-muted-foreground">
                      {member.email}
                    </TableCell>
                    <TableCell>
                      <Badge variant="outline" className="font-normal">
                        {USER_ROLE_LABELS[member.role as UserRole] ??
                          member.role}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-right text-sm text-muted-foreground tabular-nums">
                      {formatDate(member.createdAt)}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              <MailOpen className="size-4" />
              대기 중인 초대
            </CardTitle>
            <CardDescription>
              아직 수락되지 않은 초대 목록입니다.
            </CardDescription>
          </CardHeader>
          <CardContent>
            {pendingInvites.length === 0 ? (
              <div className="flex flex-col items-center justify-center gap-2 rounded-lg border border-dashed py-10 text-center">
                <MailOpen className="size-8 text-muted-foreground" />
                <p className="text-sm text-muted-foreground">
                  대기 중인 초대가 없습니다.
                </p>
              </div>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>이메일</TableHead>
                    <TableHead>역할</TableHead>
                    <TableHead>상태</TableHead>
                    <TableHead className="text-right">초대일</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {pendingInvites.map((invite) => (
                    <TableRow key={invite.id}>
                      <TableCell className="font-medium">
                        {invite.email}
                      </TableCell>
                      <TableCell>
                        <Badge variant="outline" className="font-normal">
                          {USER_ROLE_LABELS[invite.role as UserRole] ??
                            invite.role}
                        </Badge>
                      </TableCell>
                      <TableCell>
                        <Badge className="border-0 bg-amber-100 text-amber-800 dark:bg-amber-500/15 dark:text-amber-300">
                          대기 중
                        </Badge>
                      </TableCell>
                      <TableCell className="text-right text-sm text-muted-foreground tabular-nums">
                        {formatDate(invite.createdAt)}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}
          </CardContent>
        </Card>
      </div>
    </>
  );
}
