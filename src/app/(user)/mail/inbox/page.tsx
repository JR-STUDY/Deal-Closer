import Link from "next/link";
import { Inbox } from "lucide-react";
import { prisma } from "@/lib/db";
import { getCurrentUser } from "@/lib/session";
import { EMAIL_PROVIDER_LABELS, type EmailProvider } from "@/lib/constants";
import { formatNumber } from "@/lib/format";
import { PageHeader } from "@/components/page-header";
import { Button } from "@/components/ui/button";

/**
 * 수신함 — **화면 골격만** 있고 실제 수신 메일 연동은 아직 없다.
 *
 * 목업 데이터를 넣지 않는다. 가짜 스레드를 몇 줄 채워 두면 이 화면이 동작하는 것처럼 보이고,
 * 나중에 진짜 수신 메일이 들어왔을 때 **무엇이 실제 데이터인지 구분할 수 없다**
 * (`/api/generate/batch` 목업이 남긴 교훈과 같다 — 있는 척한 자리는 끝까지 오해를 부른다).
 * 대신 **왜 비어 있고 무엇이 더 필요한지**를 정직하게 적고, 지금 할 수 있는 일
 * (메일 연동 확인 · 발송 이력 보기)로 보낸다.
 *
 * 연동 계정 수는 실제로 조회해 보여준다 — "계정을 연결하세요" 라고만 적으면 이미 연결한
 * 사용자가 무엇이 부족한지 알 수 없다. 계정이 있어도 **수신 동기화는 별개**라는 사실을 밝힌다.
 * 실구현에 필요한 것은 `docs/MAIL-INBOX.md` 에 정리해 두었다.
 */
export default async function MailInboxPage() {
  const user = await getCurrentUser();

  const accounts = await prisma.emailAccount.findMany({
    where: { userId: user.id, status: "CONNECTED" },
    orderBy: [{ isDefault: "desc" }, { createdAt: "asc" }],
    select: { id: true, provider: true, email: true },
  });

  const providerLabels = accounts.map(
    (account) =>
      EMAIL_PROVIDER_LABELS[account.provider as EmailProvider] ??
      account.provider,
  );

  return (
    <>
      <PageHeader
        title="수신함"
        description="고객이 보낸 답장을 이 화면에서 확인할 예정입니다. 아직 준비 중인 기능입니다."
      />

      <div className="flex-1 overflow-auto p-8 [scrollbar-gutter:stable]">
        <div className="mx-auto flex max-w-2xl flex-col items-center gap-4 rounded-lg border border-dashed py-20 text-center">
          <Inbox className="size-10 text-muted-foreground" aria-hidden="true" />

          <div className="space-y-2 px-6">
            <p className="text-sm font-medium">
              수신 메일 연동이 아직 준비되지 않았습니다.
            </p>
            <p className="text-sm text-muted-foreground">
              지금은 <strong className="font-medium">보낸 메일 기록</strong>만
              확인하실 수 있습니다. 받은 메일을 이 화면에 모으려면 메일 계정의
              <strong className="font-medium"> 읽기 권한 연동</strong>이 필요해
              차후 작업으로 두었습니다. 준비되는 대로 이 자리에 받은 메일이
              표시됩니다.
            </p>

            {/* 이미 연결한 사용자에게 "계정을 연결하세요" 라고만 적으면 오해한다 */}
            <p className="text-sm text-muted-foreground">
              {accounts.length > 0
                ? `현재 연결된 메일 계정은 ${formatNumber(
                    accounts.length,
                  )}개(${providerLabels.join(" · ")})입니다. 발송에는 이미 사용되고 있으며, 수신 동기화는 별도 연동이 필요합니다.`
                : "현재 연결된 메일 계정이 없습니다. 메일 연동 화면에서 Gmail 또는 Outlook 계정을 먼저 연결해주세요."}
            </p>
          </div>

          <div className="flex flex-wrap items-center justify-center gap-2">
            <Button asChild>
              <Link href="/mail/sent">발송 이력 보기</Link>
            </Button>
            <Button asChild variant="outline">
              <Link href="/settings/email">메일 연동 관리</Link>
            </Button>
          </div>
        </div>
      </div>
    </>
  );
}
