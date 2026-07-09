import { Sparkles } from "lucide-react";
import { prisma } from "@/lib/db";
import { getCurrentOrg } from "@/lib/session";
import { PageHeader } from "@/components/page-header";
import { Badge } from "@/components/ui/badge";
import { GeneratorForm } from "./_components/generator-form";

export default async function GeneratorPage() {
  const org = await getCurrentOrg();
  const wallet = await prisma.creditWallet.findUnique({
    where: { orgId: org.id },
  });

  return (
    <>
      <PageHeader
        title="새 문서 생성"
        description="AI와의 대화로 견적서·계약서·NDA·제안서를 빠르게 만들어보세요."
        actions={
          <Badge variant="secondary" className="gap-1">
            <Sparkles className="size-3.5 text-primary" />
            {wallet?.balance ?? 0} Credits
          </Badge>
        }
      />

      <div className="flex-1 overflow-auto p-8">
        <GeneratorForm />
      </div>
    </>
  );
}
