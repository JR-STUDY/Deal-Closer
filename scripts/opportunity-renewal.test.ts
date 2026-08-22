/**
 * `src/lib/opportunity-renewal.ts` 검증 (네트워크·DB 없이 순수 함수만).
 * 실행: pnpm test:opportunity-renewal
 *
 * 검증 범위 (F-115 · F-306)
 *  ① 5단계 × 다음 기회 유무 = 10 조합의 갱신 허용 판정
 *  ② 막힌 이유별 안내 문구 (존댓말 · 이유마다 다른 문장)
 *  ③ 기회명 파생 — 회차 증가 · 꼬리표 중복 금지 · 길이 상한
 *  ④ 마감일 제안 — 1년 주기 · 과거 계약 따라잡기 · 윤년 · 미정
 */

import assert from "node:assert/strict";
import { OPPORTUNITY_STAGES } from "../src/lib/constants";
import { OPPORTUNITY_NAME_MAX } from "../src/lib/opportunity";
import {
  RENEWAL_NAME_SUFFIX,
  canRenewOpportunity,
  decideRenewal,
  renewalBlockMessage,
  renewalName,
  suggestedRenewalCloseDate,
  type RenewalBlockReason,
} from "../src/lib/opportunity-renewal";

let checks = 0;
function check(actual: unknown, expected: unknown, message: string) {
  assert.deepEqual(actual, expected, message);
  checks += 1;
}

// ── ① 단계 × 다음 기회 유무 전수 조합 ──
/** 기대 결과를 구현과 별개로 다시 적어 서로 대조한다 */
function expected(stage: string, hasNext: boolean) {
  if (stage === "LOST") return { allowed: false, reason: "lost" as const };
  if (stage !== "WON") return { allowed: false, reason: "open" as const };
  if (hasNext) return { allowed: false, reason: "already-renewed" as const };
  return { allowed: true as const };
}

for (const stage of OPPORTUNITY_STAGES) {
  for (const hasNextOpportunity of [false, true]) {
    check(
      decideRenewal({ stage, hasNextOpportunity }),
      expected(stage, hasNextOpportunity),
      `${stage} · 다음 기회 ${hasNextOpportunity ? "있음" : "없음"} 판정`,
    );
    check(
      canRenewOpportunity({ stage, hasNextOpportunity }),
      expected(stage, hasNextOpportunity).allowed,
      `${stage} · 다음 기회 ${hasNextOpportunity ? "있음" : "없음"} 축약 판정`,
    );
  }
}

// 진행 중인 기회는 "이미 갱신했다"가 아니라 "아직 진행 중"으로 안내한다 (판정 순서)
check(
  decideRenewal({ stage: "NEGOTIATION", hasNextOpportunity: true }),
  { allowed: false, reason: "open" },
  "진행 중이면 다음 기회가 있어도 단계를 먼저 알린다",
);

// 갱신할 수 있는 조합은 정확히 하나뿐이다 (수주 + 다음 기회 없음)
check(
  OPPORTUNITY_STAGES.flatMap((stage) =>
    [false, true].filter((hasNextOpportunity) =>
      canRenewOpportunity({ stage, hasNextOpportunity }),
    ).map(() => stage),
  ),
  ["WON"],
  "수주 · 다음 기회 없음 하나만 허용된다",
);

// ── ② 안내 문구 ──
const reasons: RenewalBlockReason[] = ["open", "lost", "already-renewed"];
const messages = reasons.map(renewalBlockMessage);
for (const [index, message] of messages.entries()) {
  check(message.length > 0, true, `${reasons[index]} 안내 문구가 있다`);
  check(
    message.endsWith("다.") || message.endsWith("요."),
    true,
    `${reasons[index]} 안내 문구는 존댓말로 끝난다 (COPY-TONE)`,
  );
}
check(
  new Set(messages).size,
  reasons.length,
  "이유마다 다른 문장이다 (같은 문장이면 이유를 나눈 의미가 없다)",
);

// ── ③ 기회명 파생 ──
check(renewalName("인프라 증설 1차"), "인프라 증설 1차 (갱신)", "첫 갱신은 (갱신)");
check(
  renewalName("인프라 증설 1차 (갱신)"),
  "인프라 증설 1차 (갱신 2)",
  "갱신의 갱신은 회차가 올라간다",
);
check(
  renewalName("인프라 증설 1차 (갱신 2)"),
  "인프라 증설 1차 (갱신 3)",
  "회차는 계속 올라간다",
);
check(
  renewalName("인프라 증설 1차 (갱신 9)"),
  "인프라 증설 1차 (갱신 10)",
  "두 자리 회차로 넘어간다",
);
check(
  renewalName("  여백 있는 이름  "),
  "여백 있는 이름 (갱신)",
  "앞뒤 여백은 다듬는다",
);
check(
  renewalName("갱신 대응 시스템"),
  "갱신 대응 시스템 (갱신)",
  "이름 안의 ‘갱신’ 은 꼬리표가 아니다",
);
check(
  renewalName("연간 (갱신 예정) 계약"),
  "연간 (갱신 예정) 계약 (갱신)",
  "끝에 있지 않은 괄호는 꼬리표가 아니다",
);

// 꼬리표가 무한히 쌓이지 않는다 — 10회 이어 붙여도 괄호는 하나다
let chained = "연간 유지보수";
for (let i = 0; i < 10; i += 1) chained = renewalName(chained);
check(chained, "연간 유지보수 (갱신 10)", "10회 갱신해도 꼬리표는 하나다");
check(
  chained.split(`(${RENEWAL_NAME_SUFFIX}`).length - 1,
  1,
  "꼬리표가 중복되지 않는다",
);

// 길이 상한 — 100자 이름에 꼬리표를 붙여도 저장 제약을 넘지 않는다
const longName = "가".repeat(OPPORTUNITY_NAME_MAX);
const renewedLong = renewalName(longName);
check(
  renewedLong.length <= OPPORTUNITY_NAME_MAX,
  true,
  `파생 이름은 ${OPPORTUNITY_NAME_MAX}자를 넘지 않는다`,
);
check(
  renewedLong.endsWith(` (${RENEWAL_NAME_SUFFIX})`),
  true,
  "잘릴 때도 꼬리표는 남는다 (몇 회차인지가 이름 끝자보다 중요하다)",
);
check(
  renewalName(longName + ` (${RENEWAL_NAME_SUFFIX} 12)`).length <=
    OPPORTUNITY_NAME_MAX,
  true,
  "회차가 두 자리여도 상한을 넘지 않는다",
);
check(renewalName("가").length <= OPPORTUNITY_NAME_MAX, true, "짧은 이름도 정상");

// ── ④ 마감일 제안 ──
const today = new Date(2026, 7, 22); // 2026-08-22 (로컬 자정)

check(
  suggestedRenewalCloseDate(new Date(2026, 8, 30), today).getTime(),
  new Date(2027, 8, 30).getTime(),
  "아직 오지 않은 마감일은 그대로 1년 뒤",
);
check(
  suggestedRenewalCloseDate(new Date(2026, 5, 30), today).getTime(),
  new Date(2027, 5, 30).getTime(),
  "올해 지난 마감일도 1년 뒤면 미래라 그대로",
);
check(
  suggestedRenewalCloseDate(new Date(2020, 2, 15), today).getTime(),
  new Date(2027, 2, 15).getTime(),
  "몇 해 지난 계약은 오늘 이후가 될 때까지 해를 밀어 낸다",
);
check(
  suggestedRenewalCloseDate(null, today).getTime(),
  new Date(2027, 7, 22).getTime(),
  "원본 마감일이 미정이면 오늘 + 1년",
);
check(
  suggestedRenewalCloseDate(new Date(2024, 1, 29), today).getTime(),
  new Date(2027, 1, 28).getTime(),
  "윤년 2월 29일은 다음 해 2월 28일로 맞춘다 (3월로 넘어가지 않는다)",
);
// 밀어 내기가 끼지 않는 순수 클램프 (윤년 2월 29일 → 평년 2월 28일)
check(
  suggestedRenewalCloseDate(new Date(2024, 1, 29), new Date(2024, 5, 1)).getTime(),
  new Date(2025, 1, 28).getTime(),
  "1년만 더할 때도 없는 날짜는 그 달 마지막 날로 맞춘다",
);
check(
  suggestedRenewalCloseDate(new Date(2026, 11, 31), today).getTime(),
  new Date(2027, 11, 31).getTime(),
  "31일로 끝나는 달은 그대로 31일",
);
// 시각이 섞여 있어도 날짜만 본다 (원본이 UTC 파싱으로 들어와도 하루가 밀리지 않는다)
check(
  suggestedRenewalCloseDate(new Date(2026, 8, 30, 23, 59, 59), today).getTime(),
  new Date(2027, 8, 30).getTime(),
  "원본의 시각은 무시하고 로컬 자정으로 맞춘다",
);
check(
  suggestedRenewalCloseDate(new Date(2025, 7, 22), today).getTime(),
  new Date(2027, 7, 22).getTime(),
  "1년 뒤가 오늘과 같은 날이면 한 해 더 밀어 낸다 (오늘은 미래가 아니다)",
);

// 제안값은 항상 오늘보다 뒤다 (원본 마감일 24개월 전수)
for (let back = 0; back < 24; back += 1) {
  const previous = new Date(2026, 7 - back, 15);
  const suggested = suggestedRenewalCloseDate(previous, today);
  check(
    suggested.getTime() > today.getTime(),
    true,
    `${previous.getFullYear()}-${previous.getMonth() + 1} 마감 → 제안값은 오늘보다 뒤`,
  );
}

console.log(`opportunity-renewal: ${checks}건 검증 통과`);
