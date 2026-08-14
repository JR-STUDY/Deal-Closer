/** 표시용 포맷 유틸 (정책 FORM_CURRENCY_KRW, FORM_DATE_TIME 준수) */

/** 금액(원, 정수)을 ₩1,234,567 형태로 */
export function formatKRW(amount: number): string {
  return `₩${amount.toLocaleString("ko-KR")}`;
}

/** 숫자에 천 단위 구분 기호 */
export function formatNumber(n: number): string {
  return n.toLocaleString("ko-KR");
}

/** 날짜를 YYYY.MM.DD 로 (로컬 타임존 기준 표시) */
export function formatDate(date: Date | string): string {
  const d = typeof date === "string" ? new Date(date) : date;
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}.${m}.${day}`;
}

/** 날짜/시간을 YYYY.MM.DD HH:mm 로 */
export function formatDateTime(date: Date | string): string {
  const d = typeof date === "string" ? new Date(date) : date;
  const hh = String(d.getHours()).padStart(2, "0");
  const mm = String(d.getMinutes()).padStart(2, "0");
  return `${formatDate(d)} ${hh}:${mm}`;
}

/**
 * 날짜/시간을 YYYY.MM.DD HH:mm:ss 로 — **초까지** 필요한 자리에만 쓴다 (4차 피드백 8).
 *
 * 목록의 최근 수정일 칸은 좁아 날짜만 보이는데, 같은 날 여러 번 손댄 기회는 날짜만으로
 * 순서를 확인할 수 없다. 분까지도 같아지는 경우가 있어 초까지 내린다.
 * 화면이 직접 문자열을 조립하지 않도록 포맷은 반드시 이 모듈에서 만든다.
 */
export function formatDateTimeSeconds(date: Date | string): string {
  const d = typeof date === "string" ? new Date(date) : date;
  const ss = String(d.getSeconds()).padStart(2, "0");
  return `${formatDateTime(d)}:${ss}`;
}
