import Link from "next/link";
import { ArrowLeft, FileStack } from "lucide-react";
import { prisma } from "@/lib/db";
import { getCurrentOrg } from "@/lib/session";
import { formatKRW } from "@/lib/format";
import { PageHeader } from "@/components/page-header";
import { DocTypeBadge } from "@/components/status-badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardFooter } from "@/components/ui/card";
import {
  TemplateCardActions,
  NewTemplateButton,
} from "./_components/template-actions";

export default async function TemplatesPage() {
  const org = await getCurrentOrg();

  const templates = await prisma.documentTemplate.findMany({
    where: { orgId: org.id },
    orderBy: { createdAt: "desc" },
    include: { items: { select: { amount: true } } },
  });

  return (
    <>
      <PageHeader
        title="베이스 템플릿"
        description="표준 견적서·계약서·제안서 양식을 등록해 두고, 새 문서를 빠르게 시작하세요."
        actions={
          <>
            <Button asChild variant="outline">
              <Link href="/library">
                <ArrowLeft className="size-4" />
                문서 보관함
              </Link>
            </Button>
            <NewTemplateButton />
          </>
        }
      />

      <div className="flex-1 overflow-auto p-8">
        {templates.length === 0 ? (
          <div className="flex flex-col items-center justify-center gap-3 rounded-lg border border-dashed py-20 text-center">
            <FileStack className="size-10 text-muted-foreground" />
            <p className="text-sm text-muted-foreground">
              등록된 베이스 템플릿이 없습니다. 자주 쓰는 문서를 템플릿으로 저장해
              보세요.
            </p>
            <NewTemplateButton />
          </div>
        ) : (
          <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
            {templates.map((tpl) => {
              const amount = tpl.items.reduce((sum, it) => sum + it.amount, 0);
              return (
                <Card key={tpl.id} className="flex flex-col">
                  <CardContent className="flex-1 space-y-3">
                    <DocTypeBadge type={tpl.type} />
                    <div>
                      <h3 className="line-clamp-2 font-semibold leading-snug">
                        {tpl.title}
                      </h3>
                      {tpl.description ? (
                        <p className="mt-1 line-clamp-2 text-sm text-muted-foreground">
                          {tpl.description}
                        </p>
                      ) : null}
                    </div>
                    <div className="flex items-baseline justify-between pt-1 text-sm">
                      <span className="text-muted-foreground">
                        기본 항목 {tpl.items.length}개
                      </span>
                      {amount > 0 ? (
                        <span className="font-semibold tabular-nums">
                          {formatKRW(amount)}
                        </span>
                      ) : null}
                    </div>
                  </CardContent>
                  <CardFooter className="gap-2 border-t">
                    <TemplateCardActions
                      templateId={tpl.id}
                      templateTitle={tpl.title}
                    />
                  </CardFooter>
                </Card>
              );
            })}
          </div>
        )}
      </div>
    </>
  );
}
