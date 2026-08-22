import { redirect } from "next/navigation";

/**
 * 브랜딩 설정 — **담당자 포털로 옮겼다** (2.0.0).
 *
 * 회사명·로고·기본 색상은 이제 `회사·프로필 설정`(`/settings/profile` 의 `회사 정보` 탭)에
 * 있고, 폼은 `@/components/account/company-form` 하나다(대표자·사업자등록번호·주소·
 * 대표 연락처·인감이 함께 들어갔다).
 *
 * 이 라우트를 지우지 않고 리다이렉트로 남기는 이유 — 예전 주소를 북마크·문서 링크로
 * 들고 있는 사람이 404 를 보지 않게 한다. **화면을 두 벌 두지 않는다**: 같은 폼을 두 곳에서
 * 렌더하면 한쪽만 손봤을 때 어느 쪽이 실제로 저장되는지 알 수 없다.
 */
export default function BrandingSettingsPage() {
  redirect("/settings/profile");
}
