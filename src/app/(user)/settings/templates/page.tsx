import Link from "next/link";
import { Plus, Mail, Users, User as UserIcon } from "lucide-react";
import { prisma } from "@/lib/db";
import { getCurrentUser } from "@/lib/session";
import {
  toTemplateDTO,
  visibleTemplatesWhere,
  type EmailTemplateDTO,
  type TemplateScope,
} from "@/lib/email-template";
import { PageHeader } from "@/components/page-header";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader } from "@/components/ui/card";

const SECTIONS: {
  scope: TemplateScope;
  label: string;
  hint: string;
  icon: typeof Users;
}[] = [
  {
    scope: "team",
    label: "팀 공용 템플릿",
    hint: "조직의 모든 팀원이 함께 사용·수정합니다.",
    icon: Users,
  },
  {
    scope: "personal",
    label: "개인 템플릿",
    hint: "나만 보고 사용하는 템플릿입니다.",
    icon: UserIcon,
  },
];

/** 목록 카드 — 클릭하면 전체 화면 상세로 이동한다. */
function TemplateCard({ template }: { template: EmailTemplateDTO }) {
  return (
    <Link
      href={`/settings/templates/${template.id}`}
      className="block rounded-xl transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
    >
      <Card className="h-full transition-colors hover:border-primary/50 hover:bg-accent/40">
        <CardHeader className="flex-row items-start justify-between gap-2">
          <div className="min-w-0">
            <p className="truncate font-medium">{template.name}</p>
            <p className="mt-0.5 truncate text-xs text-muted-foreground">
              {template.subject}
            </p>
          </div>
          <Badge variant="outline" className="shrink-0">
            {template.scope === "team" ? "공용" : "개인"}
          </Badge>
        </CardHeader>
        <CardContent>
          <p className="line-clamp-3 whitespace-pre-line text-sm text-muted-foreground">
            {template.body}
          </p>
        </CardContent>
      </Card>
    </Link>
  );
}

/**
 * 메일 템플릿 관리 (/settings/templates)
 * 팀 공용 + 본인 개인 템플릿을 조회해 목록으로 보여준다.
 * 조회·수정·삭제·생성은 전체 화면 상세/생성 페이지에서 처리한다.
 */
export default async function EmailTemplatesPage() {
  const user = await getCurrentUser();

  const templates = (
    await prisma.emailTemplate.findMany({
      where: visibleTemplatesWhere(user.orgId, user.id),
      orderBy: [{ ownerId: "asc" }, { updatedAt: "desc" }],
    })
  ).map(toTemplateDTO);

  return (
    <>
      <PageHeader
        title="메일 템플릿"
        description="자주 쓰는 발송 문구를 저장해 두고, 이메일 발송 화면에서 바로 불러와 사용합니다."
        actions={
          <Button asChild>
            <Link href="/settings/templates/new">
              <Plus className="size-4" />새 템플릿
            </Link>
          </Button>
        }
      />

      <div className="flex-1 overflow-auto p-8">
        <div className="mx-auto max-w-4xl space-y-8">
          {templates.length === 0 ? (
            <div className="flex flex-col items-center justify-center gap-3 rounded-lg border border-dashed py-16 text-center">
              <Mail className="size-10 text-muted-foreground" />
              <p className="text-sm text-muted-foreground">
                아직 저장된 메일 템플릿이 없습니다. 자주 쓰는 발송 문구를
                템플릿으로 저장해 두면 발송 화면에서 바로 불러올 수 있습니다.
              </p>
              <Button asChild variant="outline" className="mt-1">
                <Link href="/settings/templates/new">
                  <Plus className="size-4" />첫 템플릿 만들기
                </Link>
              </Button>
            </div>
          ) : (
            SECTIONS.map(({ scope, label, hint, icon: Icon }) => {
              const items = templates.filter((t) => t.scope === scope);
              return (
                <section key={scope} className="space-y-3">
                  <div>
                    <h2 className="flex items-center gap-2 text-sm font-semibold">
                      <Icon className="size-4 text-muted-foreground" />
                      {label}
                      <span className="text-xs font-normal text-muted-foreground">
                        ({items.length})
                      </span>
                    </h2>
                    <p className="mt-0.5 text-xs text-muted-foreground">{hint}</p>
                  </div>

                  {items.length === 0 ? (
                    <p className="rounded-md border border-dashed p-4 text-center text-sm text-muted-foreground">
                      이 분류에 저장된 템플릿이 없습니다.
                    </p>
                  ) : (
                    <div className="grid gap-3 sm:grid-cols-2">
                      {items.map((template) => (
                        <TemplateCard key={template.id} template={template} />
                      ))}
                    </div>
                  )}
                </section>
              );
            })
          )}
        </div>
      </div>
    </>
  );
}
