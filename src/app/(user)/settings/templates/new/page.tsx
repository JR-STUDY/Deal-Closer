import { PageHeader } from "@/components/page-header";
import { TemplateNew } from "../_components/template-new";

/** 새 메일 템플릿 생성 (/settings/templates/new) — 전체 화면 편집 폼 */
export default function NewEmailTemplatePage() {
  return (
    <>
      <PageHeader
        title="새 메일 템플릿"
        description="자주 쓰는 발송 문구를 저장해 두면 발송 화면에서 바로 불러올 수 있습니다."
      />

      <div className="flex-1 overflow-auto p-8">
        <div className="mx-auto max-w-3xl">
          <TemplateNew />
        </div>
      </div>
    </>
  );
}
