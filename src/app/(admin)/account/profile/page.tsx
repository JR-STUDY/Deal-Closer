import { redirect } from "next/navigation";

/**
 * 프로필 설정 — **담당자 포털로 옮겼다** (2.0.0).
 *
 * 계정 정보·보안은 `/settings/profile` 하나이며, 그 화면이 회사 정보 탭까지 함께 든다.
 * 저장은 `PATCH /api/profile` 이 **현재 사용자**에게만 쓰므로(요청 본문으로 사용자 id 를
 * 받지 않는다), 관리자 콘솔에서 같은 폼을 다시 띄우면 화면이 가리키는 사람과 실제로
 * 저장되는 사람이 갈라진다 — 그래서 화면을 두 벌 두지 않고 옮긴 자리로 보낸다.
 *
 * 함께 있던 `알림 설정`(토글 목업)은 지웠다 — 저장되는 곳이 없는 화면이었고, 옮긴 화면의
 * 탭은 `계정 정보 · 회사 정보 · 보안` 셋으로 정했다.
 */
export default function AdminProfilePage() {
  redirect("/settings/profile");
}
