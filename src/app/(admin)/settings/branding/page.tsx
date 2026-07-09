import { prisma } from "@/lib/db";
import { getCurrentOrg } from "@/lib/session";
import { PageHeader } from "@/components/page-header";
import { BrandingForm } from "./_components/branding-form";

export default async function BrandingSettingsPage() {
  const org = await getCurrentOrg();

  const branding = await prisma.branding.findUnique({
    where: { orgId: org.id },
  });

  return (
    <>
      <PageHeader
        title="브랜딩 설정"
        description="발송 문서와 콘솔에 적용될 브랜드 요소를 설정합니다."
      />

      <div className="flex-1 overflow-auto p-8">
        <BrandingForm
          initialCompanyName={branding?.companyName ?? org.name}
          initialLogoUrl={branding?.logoUrl ?? null}
          initialPrimaryColor={branding?.primaryColor ?? "#4F46E5"}
        />
      </div>
    </>
  );
}
