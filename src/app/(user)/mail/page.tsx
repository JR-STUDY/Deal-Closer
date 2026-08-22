import { redirect } from "next/navigation";

/**
 * `/mail` 은 자체 화면이 없다 — 발송 이력으로 보낸다.
 *
 * 사이드바의 `메일` 은 하위 항목(발송 이력 · 수신함 · 메일 연동 · 메일 템플릿)을 펼치는
 * 묶음이지만, 묶음 자체에도 주소가 붙는 구조라(`/library` 가 선례) 그 주소로 들어올 수 있다.
 * 404 를 보여주는 대신 **지금 쓸 수 있는 화면**으로 보낸다. 수신함이 아니라 발송 이력인 이유는
 * 그쪽만 실제 데이터가 있기 때문이다.
 */
export default function MailPage() {
  redirect("/mail/sent");
}
