import { Mail } from "lucide-react";
import { prisma } from "@/lib/db";
import { getCurrentUser } from "@/lib/session";
import { EMAIL_PROVIDER_LABELS, type EmailProvider } from "@/lib/constants";
import { PageHeader } from "@/components/page-header";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { cn } from "@/lib/utils";
import { AccountActions } from "./_components/account-actions";
import { ConnectButton } from "./_components/connect-button";
import { SignatureForm } from "./_components/signature-form";

const PROVIDER_AVATAR_STYLES: Record<EmailProvider, string> = {
  GMAIL:
    "bg-red-100 text-red-700 dark:bg-red-500/15 dark:text-red-300",
  OUTLOOK:
    "bg-blue-100 text-blue-700 dark:bg-blue-500/15 dark:text-blue-300",
};

export default async function EmailSettingsPage() {
  const user = await getCurrentUser();

  const accounts = await prisma.emailAccount.findMany({
    where: { userId: user.id },
  });

  return (
    <>
      <PageHeader
        title="메일 연동 관리"
        description="Gmail, Outlook 계정을 연결하면 서비스 내에서 바로 견적서 발송이 가능합니다."
      />

      <div className="flex-1 space-y-8 overflow-auto p-8">
        {/* 섹션1: 연결된 계정 */}
        <section className="space-y-3">
          <h2 className="text-sm font-semibold text-muted-foreground">
            연결된 계정
          </h2>

          {accounts.length === 0 ? (
            <div className="flex flex-col items-center justify-center gap-3 rounded-lg border border-dashed py-16 text-center">
              <Mail className="size-10 text-muted-foreground" />
              <p className="text-sm text-muted-foreground">
                아직 연결된 메일 계정이 없습니다. 아래에서 Gmail 또는 Outlook
                계정을 연결해 보세요.
              </p>
            </div>
          ) : (
            <div className="space-y-3">
              {accounts.map((account) => {
                const provider = account.provider as EmailProvider;
                return (
                  <Card key={account.id}>
                    <CardContent className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
                      <div className="flex items-center gap-3">
                        <Avatar>
                          <AvatarFallback
                            className={cn(
                              "font-semibold",
                              PROVIDER_AVATAR_STYLES[provider],
                            )}
                          >
                            {provider === "GMAIL" ? "G" : "O"}
                          </AvatarFallback>
                        </Avatar>
                        <div className="min-w-0">
                          <div className="flex items-center gap-2">
                            <p className="truncate font-medium">
                              {account.email}
                            </p>
                            {account.status === "CONNECTED" ? (
                              <Badge className="shrink-0 border-0 bg-emerald-100 text-emerald-800 dark:bg-emerald-500/15 dark:text-emerald-300">
                                연결됨
                              </Badge>
                            ) : (
                              <Badge
                                variant="outline"
                                className="shrink-0 text-muted-foreground"
                              >
                                연결 해제됨
                              </Badge>
                            )}
                          </div>
                          <p className="text-xs text-muted-foreground">
                            {EMAIL_PROVIDER_LABELS[provider] ?? account.provider}
                          </p>
                        </div>
                      </div>

                      <AccountActions
                        accountId={account.id}
                        email={account.email}
                        defaultChecked={account.isDefault}
                      />
                    </CardContent>
                  </Card>
                );
              })}
            </div>
          )}
        </section>

        {/* 섹션2: 새로운 서비스 연결 */}
        <section className="space-y-3">
          <h2 className="text-sm font-semibold text-muted-foreground">
            새로운 서비스 연결
          </h2>

          <div className="grid gap-4 sm:grid-cols-2">
            <Card>
              <CardContent className="flex flex-1 items-start gap-3">
                <Avatar>
                  <AvatarFallback
                    className={cn(
                      "font-semibold",
                      PROVIDER_AVATAR_STYLES.GMAIL,
                    )}
                  >
                    G
                  </AvatarFallback>
                </Avatar>
                <div>
                  <p className="font-medium">Gmail</p>
                  <p className="text-sm text-muted-foreground">
                    Google 계정으로 견적서 발송
                  </p>
                </div>
              </CardContent>
              <div className="px-(--card-spacing)">
                <ConnectButton label="Google로 계속하기" brandName="Google" />
              </div>
            </Card>

            <Card>
              <CardContent className="flex flex-1 items-start gap-3">
                <Avatar>
                  <AvatarFallback
                    className={cn(
                      "font-semibold",
                      PROVIDER_AVATAR_STYLES.OUTLOOK,
                    )}
                  >
                    O
                  </AvatarFallback>
                </Avatar>
                <div>
                  <p className="font-medium">Outlook</p>
                  <p className="text-sm text-muted-foreground">
                    Microsoft 계정으로 견적서 발송
                  </p>
                </div>
              </CardContent>
              <div className="px-(--card-spacing)">
                <ConnectButton
                  label="Outlook으로 계속하기"
                  brandName="Microsoft"
                />
              </div>
            </Card>
          </div>
        </section>

        {/* 섹션3: 메일 서명 */}
        <section className="space-y-3">
          <div>
            <h2 className="text-sm font-semibold text-muted-foreground">
              메일 서명
            </h2>
            <p className="mt-0.5 text-xs text-muted-foreground">
              저장한 서명은 이메일 발송 화면에서 본문 하단에 자동으로
              추가됩니다.
            </p>
          </div>
          <SignatureForm initialSignature={user.signature ?? ""} />
        </section>

        <p className="text-xs text-muted-foreground">
          ※ AI 입력 데이터는 서비스 품질 향상을 위해 국외에서 처리될 수
          있으며 관련 방침을 준수합니다.
        </p>
      </div>
    </>
  );
}
