import { prisma } from "@/lib/db";
import { getCurrentOrg } from "@/lib/session";
import { toMailDomainDTO } from "@/lib/mail-domain";
import { PageHeader } from "@/components/page-header";
import { MailDomainManager } from "./_components/mail-domain-manager";

/**
 * 관리자 콘솔 — 팀 발신 메일 도메인 설정.
 * 관리자가 조직 공용 발신 도메인을 등록·인증·기본지정하면,
 * 담당자는 개인 계정 대신 이 도메인 기반 주소로 발신하도록 선택할 수 있다.
 */
export default async function MailDomainSettingsPage() {
  const org = await getCurrentOrg();

  const domains = await prisma.teamMailDomain.findMany({
    where: { orgId: org.id },
    orderBy: [{ isDefault: "desc" }, { createdAt: "asc" }],
  });

  return (
    <>
      <PageHeader
        title="메일 도메인 설정"
        description="팀이 공통으로 사용할 발신 메일 도메인을 등록하고 인증합니다. 인증된 도메인은 담당자가 발신 주소로 선택할 수 있습니다."
      />

      <div className="flex-1 overflow-auto p-8">
        <div className="mx-auto max-w-3xl">
          <MailDomainManager initialDomains={domains.map(toMailDomainDTO)} />
        </div>
      </div>
    </>
  );
}
