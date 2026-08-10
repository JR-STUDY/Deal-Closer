/** 문서 관행에 맞춘 날짜 표기 ("2026. 08. 07") — 프롬프트에 주입한다 */
export function documentDate(date: Date = new Date()): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  return `${y}. ${m}. ${d}`;
}
