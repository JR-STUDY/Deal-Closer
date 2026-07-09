import type { EmailTemplateDTO, TemplateFormValues } from "@/lib/email-template";

/**
 * 메일 템플릿 생성(POST)·수정(PATCH) 공용 요청 헬퍼 (클라이언트 전용).
 * 다이얼로그·전체화면 편집 등 여러 진입점이 같은 엔드포인트·응답 형태를 쓰도록 한 곳에 모은다.
 */
export async function submitTemplate(
  templateId: string | undefined,
  values: TemplateFormValues,
): Promise<{ template: EmailTemplateDTO } | { error: string }> {
  try {
    const res = await fetch(
      templateId ? `/api/email-templates/${templateId}` : "/api/email-templates",
      {
        method: templateId ? "PATCH" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(values),
      },
    );
    const json = await res.json().catch(() => null);
    if (!res.ok) {
      return { error: json?.error ?? "저장에 실패했습니다." };
    }
    return { template: json.data as EmailTemplateDTO };
  } catch {
    return { error: "저장에 실패했습니다." };
  }
}
