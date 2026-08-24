import { redirect } from "next/navigation";

/**
 * `/` — 대시보드로 보낸다.
 *
 * 인증이 없는 MVP 에서 랜딩이 하는 일은 "영업 포털 열기" 버튼 한 번뿐이라, 홈을 열
 * 때마다 그 한 번을 지나야 했다. 제품 소개 화면은 지우지 않고 **`/landing` 으로
 * 살려 두었다** — 데모 자리에서 그대로 쓴다.
 *
 * 리다이렉트를 `next.config` 로 옮기지 않는다. 그러면 이 파일이 영영 렌더되지 않아
 * "홈이 어디로 가는가"를 라우트가 아니라 설정 파일에서 찾게 된다.
 */
export default function Home() {
  redirect("/dashboard");
}
