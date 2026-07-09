import { Mail } from "lucide-react";
import { prisma } from "@/lib/db";
import { getCurrentUser } from "@/lib/session";
import {
  EMAIL_PROVIDERS,
  EMAIL_PROVIDER_LABELS,
  type EmailProvider,
} from "@/lib/constants";
import { toMailDomainDTO } from "@/lib/mail-domain";
import { PageHeader } from "@/components/page-header";
import { ProviderLogo } from "@/components/provider-logo";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { AccountActions } from "./_components/account-actions";
import { ConnectButton } from "./_components/connect-button";
import { SignatureForm } from "./_components/signature-form";
import { SendingDomainForm } from "./_components/sending-domain-form";

export default async function EmailSettingsPage() {
  const user = await getCurrentUser();

  // 연동 계정·인증된 팀 도메인은 서로 독립 → 병렬 조회 (REACT_BEST_PRACTICES)
  const [accounts, teamDomains] = await Promise.all([
    prisma.emailAccount.findMany({ where: { userId: user.id } }),
    prisma.teamMailDomain.findMany({
      where: { orgId: user.orgId, status: "VERIFIED" },
      orderBy: [{ isDefault: "desc" }, { createdAt: "asc" }],
    }),
  ]);

  // 개인 발신 계정 미리보기용 (기본 계정 우선, 없으면 첫 계정)
  const defaultAccount =
    accounts.find((a) => a.isDefault) ?? accounts[0] ?? null;

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
                        <span className="flex size-9 shrink-0 items-center justify-center rounded-lg border bg-background">
                          <ProviderLogo provider={provider} className="size-5" />
                        </span>
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

                      <AccountActions email={account.email} />
                    </CardContent>
                  </Card>
                );
              })}
            </div>
          )}
        </section>

        {/* 섹션1-1: 발신 도메인 선택 */}
        <section className="space-y-3">
          <div>
            <h2 className="text-sm font-semibold text-muted-foreground">
              발신 도메인
            </h2>
            <p className="mt-0.5 text-xs text-muted-foreground">
              개인 연동 계정 대신 팀 공용 도메인으로 발송할 수 있습니다. 발신
              주소는 이메일 발송 화면에 반영됩니다.
            </p>
          </div>
          {teamDomains.length > 0 ? (
            <SendingDomainForm
              domains={teamDomains.map(toMailDomainDTO)}
              initialSelectedId={user.mailDomainId}
              userEmail={user.email}
              personalEmail={defaultAccount?.email ?? null}
            />
          ) : (
            <div className="rounded-lg border border-dashed p-4 text-sm text-muted-foreground">
              관리자가 팀 메일 도메인을 등록·인증하면 여기에서 발신 도메인을
              선택할 수 있습니다. 지금은 개인 연동 계정으로 발송됩니다.
            </div>
          )}
        </section>

        {/* 섹션2: 새로운 서비스 연결 */}
        <section className="space-y-3">
          <div>
            <h2 className="text-sm font-semibold text-muted-foreground">
              새로운 서비스 연결
            </h2>
            <p className="mt-0.5 text-xs text-muted-foreground">
              연결할 메일 서비스를 선택하세요.
            </p>
          </div>

          <div className="flex flex-wrap gap-3">
            {EMAIL_PROVIDERS.map((provider) => (
              <ConnectButton key={provider} provider={provider} />
            ))}
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
