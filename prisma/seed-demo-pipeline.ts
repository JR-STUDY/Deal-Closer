import { randomUUID } from "node:crypto";
import type { PrismaClient } from "../src/generated/prisma/client";
import { LOST_REASON_PRESETS } from "../src/lib/constants";
import {
  renewalName,
  suggestedRenewalCloseDate,
} from "../src/lib/opportunity-renewal";

/**
 * 시연용 **대량 파이프라인 데이터** — 올해 1~12월의 모든 날짜에 기회를 놓고,
 * 내년은 그 수주 건에서 이어지는 **갱신 기회**로 채운다.
 *
 * `prisma/seed.ts` 의 손으로 적은 12건은 **특수 케이스 전시장**이다(수동 고정·폐기 문서·
 * 확정 문서 없음·발송 이력). 그것과 섞지 않고 이 모듈을 따로 둔 이유는 둘의 목적이 다르기
 * 때문이다 — 여기서 만드는 것은 **분포**다. 캘린더에 빈 날이 없고, 파이프라인 단계가 골고루
 * 차고, 대시보드 차트가 12개월 내내 값을 갖는 상태.
 *
 * ## 정합성은 스스로 만들지 않는다 — 기존 패스에 태운다
 *
 * 이 모듈은 **`expectedAmount` 를 쓰지 않고 `confirmedDocumentId` 도 정하지 않는다**
 * (기회-6). 기회에 문서를 붙여 두기만 하고, 금액과 확정 문서는 `seed.ts` 가 이어서 도는
 * 두 패스가 정한다 — 품목 보정(10-3-1)과 확정 문서 재판정(10-4)이다. 그래서 이 모듈은
 * **그 두 패스보다 먼저** 호출되어야 한다. 시드가 금액을 손으로 적으면 화면이 계산한
 * 값과 어긋난 데이터가 만들어지고, "왜 이 금액인지"를 설명할 수 없게 된다.
 *
 * 지키는 다른 선들:
 *  - **갱신은 단계를 되돌리는 것이 아니라 기회를 하나 더 만드는 일이다** (F-115).
 *    원본은 `수주` 로 남고 새 기회가 `previousOpportunityId` 로 이어진다. 이름·마감일은
 *    화면·서버와 **같은 순수 함수**(`renewalName`·`suggestedRenewalCloseDate`)로 만든다.
 *  - **원본 하나에 갱신은 하나뿐이다** — `previousOpportunityId` 가 `@unique` 다.
 *    그래서 원본 후보는 이 모듈이 만든 수주 건으로 한정하고, 한 번 쓴 원본은 다시 쓰지 않는다.
 *  - **실주에는 사유가 있어야 한다** (F-117). 고정 목록(`LOST_REASON_PRESETS`)에서 고른다 —
 *    자유 문자열을 넣으면 이탈률 통계의 분류 축이 깨진다.
 *  - **마감 기회는 이력에 도달 지점이 남아야 한다.** 진행 스테퍼는 `stage` 하나가 아니라
 *    활동 이력의 `from`/`to` 로 "어디까지 갔다가 끝났는지"를 도출한다
 *    (`opportunity-progress`). 그래서 단계 전이 이력을 함께 만든다.
 *  - **담당자가 1명 이상이면 대표는 정확히 1명** (거래처-8). 배열 맨 앞만 대표다.
 *
 * ## 왜 결정적인가
 *
 * 난수를 그대로 쓰면 `pnpm db:reset` 마다 데모가 달라져, 시연 중에 본 화면을 다시 만들 수
 * 없고 "어제는 이 숫자였는데" 를 확인할 방법이 사라진다. 그래서 고정 씨앗의 PRNG 를 쓴다 —
 * 같은 코드는 언제나 같은 데이터를 만든다. 연도만 실행 시점을 따른다(아래 참고).
 *
 * ## 연도는 하드코딩하지 않는다
 *
 * "올해"는 `today` 에서 도출한다. 날짜를 박아 두면 해가 바뀌는 순간 데모 데이터가 통째로
 * 과거가 되어, 캘린더를 열면 빈 달이 나온다.
 */

// ────────────────────────────── 결정적 난수 ──────────────────────────────

/**
 * mulberry32 — 씨앗 하나로 같은 수열을 되풀이하는 32비트 PRNG.
 * 암호용이 아니다(데모 데이터 분포를 정하는 데만 쓴다).
 */
function makeRandom(seed: number): () => number {
  let state = seed >>> 0;
  return () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** 씨앗 값 — 바꾸면 데모 데이터의 분포가 통째로 달라진다 */
const RANDOM_SEED = 20260824;

// ────────────────────────────── 날짜 도구 ──────────────────────────────

const DAY_MS = 24 * 60 * 60 * 1000;

/** 로컬 자정 — 날짜 칸 판정과 같은 기준이다 (`toISOString()` 은 UTC 로 하루 밀린다) */
function localDate(year: number, month1: number, day: number): Date {
  return new Date(year, month1 - 1, day);
}

function addDays(base: Date, days: number): Date {
  return new Date(base.getTime() + days * DAY_MS);
}

/** 그 해의 모든 날짜 (로컬 자정) */
function daysOfYear(year: number): Date[] {
  const days: Date[] = [];
  const cursor = localDate(year, 1, 1);
  while (cursor.getFullYear() === year) {
    days.push(new Date(cursor));
    cursor.setDate(cursor.getDate() + 1);
  }
  return days;
}

/**
 * 두 시점 사이의 비율 지점. 활동 이력의 시각을 여기서 뽑는다 —
 * `생성일 + 7일` 처럼 고정 간격으로 잡으면 마감일보다 뒤로 넘어가는 기회가 생겨
 * 타임라인이 거꾸로 읽힌다.
 */
function between(start: Date, end: Date, ratio: number): Date {
  return new Date(start.getTime() + (end.getTime() - start.getTime()) * ratio);
}

// ────────────────────────────── id ──────────────────────────────

/**
 * cuid 를 닮은 결정적 id.
 *
 * 관계를 `createMany` 로 한 번에 넣으려면 부모 id 를 **미리** 알아야 한다
 * (기회 → 문서 → 발송 이력이 서로를 가리킨다). 하나씩 `create` 하면 1,000번이 넘는
 * 왕복이 생기고 시드가 느려진다. 형식은 `@default(cuid())` 가 만드는 것과 같은 모양으로
 * 맞춘다 — 주소창에 섞여 보일 때 다른 종류의 데이터처럼 읽히지 않게.
 */
function makeIdFactory(random: () => number): () => string {
  return () => {
    let out = "c";
    for (let i = 0; i < 24; i += 1) {
      out += Math.floor(random() * 36).toString(36);
    }
    return out;
  };
}

// ────────────────────────────── 가중 추출 ──────────────────────────────

/** `[값, 가중치]` 목록에서 하나 고른다 (가중치 합은 아무 값이나 된다) */
function weighted<T>(random: () => number, table: readonly [T, number][]): T {
  const total = table.reduce((sum, [, weight]) => sum + weight, 0);
  let point = random() * total;
  for (const [value, weight] of table) {
    point -= weight;
    if (point <= 0) return value;
  }
  return table[table.length - 1][0];
}

/** `min` 이상 `max` 이하 정수 */
function intBetween(random: () => number, min: number, max: number): number {
  return min + Math.floor(random() * (max - min + 1));
}

function pick<T>(random: () => number, items: readonly T[]): T {
  return items[Math.floor(random() * items.length)];
}

// ────────────────────────────── 시연용 거래처 ──────────────────────────────

/**
 * 데모 거래처 — 실재하지 않는 합성 회사다.
 *
 * 40곳을 두는 이유는 기회 800여 건이 붙을 자리가 필요하기 때문이다. 기존 시드의 5곳에
 * 몰아 붙이면 거래처 한 곳의 연관 기회가 160건이 되어, 거래처 상세가 "이 회사와 무슨
 * 일이 있었는지" 를 더 이상 보여주지 못한다.
 */
const DEMO_COMPANIES: readonly { name: string; domain: string }[] = [
  { name: "한빛소프트웨어(주)", domain: "hanbitsw" },
  { name: "대성엔지니어링", domain: "daesung-eng" },
  { name: "우리제약(주)", domain: "woori-pharm" },
  { name: "동방물류(주)", domain: "dongbang-log" },
  { name: "금호에너지", domain: "kumho-energy" },
  { name: "서한테크놀로지", domain: "seohan-tech" },
  { name: "누리테크(주)", domain: "nuritech" },
  { name: "뉴런소프트", domain: "neuronsoft" },
  { name: "한라정보시스템", domain: "halla-is" },
  { name: "태성정밀(주)", domain: "taesung-p" },
  { name: "미래에듀케이션", domain: "mirae-edu" },
  { name: "정우건설(주)", domain: "jungwoo-con" },
  { name: "코어뱅크시스템즈", domain: "corebank" },
  { name: "그린바이오랩", domain: "greenbiolab" },
  { name: "성진기계공업", domain: "sungjin-mc" },
  { name: "아이엠커머스(주)", domain: "imcommerce" },
  { name: "블루칩파트너스", domain: "bluechip-p" },
  { name: "제일산업개발", domain: "jeil-ind" },
  { name: "케이넷웍스(주)", domain: "knetworks" },
  { name: "삼우테크윈", domain: "samwoo-tw" },
  { name: "오션로지스틱스", domain: "oceanlogis" },
  { name: "하나메디컬(주)", domain: "hanamedical" },
  { name: "유진화학", domain: "eugene-chem" },
  { name: "퍼스트캐피탈", domain: "firstcapital" },
  { name: "새롬에듀테크", domain: "saerom-edu" },
  { name: "대한식품(주)", domain: "daehan-food" },
  { name: "엔에스데이터", domain: "nsdata" },
  { name: "청우인터내셔널", domain: "chungwoo-int" },
  { name: "리텍솔루션(주)", domain: "ritec-sol" },
  { name: "빌드업건축사무소", domain: "buildup-arch" },
  { name: "메가트론일렉트릭", domain: "megatron-e" },
  { name: "휴먼리소스컨설팅", domain: "hr-consult" },
  { name: "가온커뮤니케이션", domain: "gaon-comm" },
  { name: "제이엠오토모티브", domain: "jm-auto" },
  { name: "썬라이즈리테일(주)", domain: "sunrise-r" },
  { name: "위드라이프케어", domain: "withlifecare" },
  { name: "코스모신소재개발", domain: "cosmo-mat" },
  { name: "다우인포텍", domain: "dawoo-info" },
  { name: "선진해운(주)", domain: "sunjin-mar" },
  { name: "라온디지털랩", domain: "raon-dlab" },
];

const FAMILY_NAMES = [
  "김", "이", "박", "최", "정", "강", "조", "윤", "장", "임",
  "한", "오", "서", "신", "권", "황", "송", "안", "홍", "유",
] as const;

const GIVEN_NAMES = [
  "서준", "지훈", "민석", "예린", "하늘", "도윤", "수아", "지원", "현우", "다은",
  "재현", "유진", "성민", "가온", "채원", "태호", "소라", "준영", "미주", "동혁",
] as const;

const POSITIONS = [
  "구매팀 과장",
  "정보시스템팀 팀장",
  "IT기획팀 차장",
  "정보보안팀 대리",
  "경영지원팀 부장",
  "총무팀 주임",
  "전산실 실장",
  "DX추진팀 매니저",
] as const;

/** 담당자 이름 — 성+이름 조합이라 40곳 × 2명이 겹치지 않을 만큼 넉넉하다 */
function personName(random: () => number): string {
  return `${pick(random, FAMILY_NAMES)}${pick(random, GIVEN_NAMES)}`;
}

/** 사업자등록번호 — 형식(`000-00-00000`)만 맞춘 합성값이다 */
function bizRegNo(random: () => number): string {
  const part = (length: number) =>
    String(intBetween(random, 0, 10 ** length - 1)).padStart(length, "0");
  return `${part(3)}-${part(2)}-${part(5)}`;
}

/** 담당자 연락처 — `@/lib/contact` 의 `normalizePhone` 이 받는 형식이다 */
function phoneNumber(random: () => number): string {
  return `010-${String(intBetween(random, 1000, 9999))}-${String(intBetween(random, 1000, 9999))}`;
}

// ────────────────────────────── 기회 소재 ──────────────────────────────

/** 기회명에 쓰는 사업 아이템 — 영업 문서 SaaS 의 실제 판매 품목에 가깝게 둔다 */
const SOLUTIONS = [
  "그룹웨어 구축",
  "메일 보안 고도화",
  "문서중앙화 도입",
  "클라우드 백업 전환",
  "ERP 연동 개발",
  "통합 인증(SSO) 구축",
  "엔드포인트 보안 도입",
  "협업툴 전사 확산",
  "네트워크 재구축",
  "AI 문서 자동화",
  "정보보호 컨설팅",
  "WMS 고도화",
  "고객포털 리뉴얼",
  "재해복구(DR) 구축",
  "화상회의 시스템 도입",
  "통합 모니터링 구축",
  "전자결재 도입",
  "메일 아카이빙 구축",
  "보안관제 위탁",
  "데이터 이중화 구축",
] as const;

type Stage = "INITIAL" | "PROPOSAL" | "NEGOTIATION" | "WON" | "LOST";

/**
 * 날짜 하나에 놓을 기회 수 — **0건을 만들지 않는다.**
 *
 * 캘린더에 빈 날이 있으면 시연 중에 "이 날은 왜 비어 있나" 를 설명해야 한다.
 * 1건만 있는 날을 적게 두는 이유는 그날의 결말이 하나로 정해져 버려(아래 `stageFor`
 * 규칙상 수주) 칸의 모양이 단조로워지기 때문이다.
 */
const EVENTS_PER_DAY: readonly [number, number][] = [
  [1, 12],
  [2, 52],
  [3, 36],
];

/**
 * 그 자리의 단계.
 *
 * **각 날짜의 첫 자리는 과거라면 반드시 수주**다. 두 가지를 한꺼번에 얻는다 —
 * ① 대시보드·차트가 12개월 내내 실적을 갖고 ② 내년을 채울 **갱신 원본**이 날마다 생긴다
 * (갱신은 수주에서만 나온다).
 *
 * 미래 날짜는 진행 중이 주류다. 아직 오지 않은 마감일이 전부 수주로 차 있으면 파이프라인
 * 칸반이 텅 비어, 정작 이 제품이 관리하는 대상이 화면에서 사라진다. 그래도 일부는 수주로
 * 둔다 — 실무에서 계약은 마감 예정일보다 먼저 체결되고, 그래야 내년 하반기 갱신도 생긴다.
 */
function stageFor(random: () => number, slot: number, isPast: boolean): Stage {
  if (isPast) {
    if (slot === 0) return "WON";
    if (slot === 1) {
      return weighted(random, [
        ["LOST", 45],
        ["WON", 40],
        ["NEGOTIATION", 15],
      ]);
    }
    return weighted(random, [
      ["WON", 45],
      ["LOST", 35],
      ["PROPOSAL", 20],
    ]);
  }

  if (slot === 0) {
    return weighted(random, [
      ["WON", 40],
      ["NEGOTIATION", 35],
      ["PROPOSAL", 25],
    ]);
  }
  if (slot === 1) {
    return weighted(random, [
      ["PROPOSAL", 40],
      ["INITIAL", 35],
      ["NEGOTIATION", 25],
    ]);
  }
  return weighted(random, [
    ["INITIAL", 45],
    ["PROPOSAL", 30],
    ["LOST", 15],
    ["WON", 10],
  ]);
}

/**
 * 문서 금액 (KRW 정수).
 *
 * 소액 위주로 두고 대형 건을 드물게 섞는다 — 전부 억 단위면 월 합계가 수백억이 되어
 * 숫자가 현실감을 잃고, 반대로 폭이 없으면 목록 정렬·차트가 평평해진다.
 * 백만 원 단위로 떨어뜨려 견적서 금액처럼 보이게 한다.
 */
function documentAmount(random: () => number): number {
  const [min, max] = weighted<[number, number]>(random, [
    [[3, 10], 45],
    [[10, 30], 35],
    [[30, 80], 18],
    [[80, 200], 2],
  ]);
  return intBetween(random, min, max) * 1_000_000;
}

// ────────────────────────────── 시드 본체 ──────────────────────────────

export type DemoPipelineResult = {
  accounts: number;
  contacts: number;
  opportunities: number;
  renewals: number;
  documents: number;
  activityLogs: number;
  emailLogs: number;
  emptyCalendarDays: number;
};

/**
 * 시연용 대량 데이터를 넣는다.
 *
 * **`seed.ts` 의 품목 보정(10-3-1)·확정 문서 재판정(10-4) 패스보다 먼저** 불러야 한다 —
 * 금액과 확정 문서를 그 두 패스에 맡기기 때문이다(위 모듈 주석 참고).
 */
export async function seedDemoPipeline(input: {
  prisma: PrismaClient;
  orgId: string;
  /** 기회의 영업 담당자 후보 — 목록·상세의 담당자 칸이 한 사람으로 굳지 않게 나눠 붙인다 */
  ownerIds: readonly string[];
  today: Date;
}): Promise<DemoPipelineResult> {
  const { prisma, orgId, ownerIds, today } = input;
  const random = makeRandom(RANDOM_SEED);
  const nextId = makeIdFactory(random);
  const thisYear = today.getFullYear();

  // ── 거래처 · 담당자 ──
  // 메일 도메인은 담당자 이메일에만 쓰고 거래처 행에는 넣지 않는다 (`Account` 에 그 칸이
  // 없다) — 그래서 표에 넣을 행과 나란히 들지 않고 `DEMO_COMPANIES` 에서 그때 꺼내 쓴다.
  const accounts = DEMO_COMPANIES.map((company) => ({
    id: nextId(),
    orgId,
    companyName: company.name,
    bizRegNo: random() < 0.85 ? bizRegNo(random) : null,
    memo:
      random() < 0.45
        ? pick(random, [
            "연간 계약 갱신 시점에 재견적을 요청하는 곳입니다.",
            "구매 절차가 3단계(현업 → 구매 → 임원)라 결재에 3주 이상 걸립니다.",
            "메일보다 전화 연락을 선호합니다.",
            "본사 승인 절차가 있어 계약까지 6주 이상 소요됩니다.",
            "담당자 교체가 잦아 견적 발송 전 수신자를 확인해야 합니다.",
          ])
        : null,
  }));

  await prisma.account.createMany({ data: accounts });

  // 담당자는 거래처당 1~3명. **맨 앞 한 명만 대표**다 (거래처-8 의 불변식).
  const contacts = accounts.flatMap((account, companyIndex) => {
    const domain = DEMO_COMPANIES[companyIndex].domain;
    const count = intBetween(random, 1, 3);
    return Array.from({ length: count }, (_unused, index) => {
      const name = personName(random);
      return {
        id: nextId(),
        orgId,
        accountId: account.id,
        name,
        position: random() < 0.85 ? pick(random, POSITIONS) : null,
        // 연락처·이메일은 선택 항목이라는 사실이 화면에 드러나야 한다 — 일부를 비운다
        phone: random() < 0.8 ? phoneNumber(random) : null,
        email:
          random() < 0.9
            ? `contact${index + 1}@${domain}.example.com`
            : null,
        isPrimary: index === 0,
      };
    });
  });
  await insertInChunks(contacts, (rows) =>
    prisma.contact.createMany({ data: rows }),
  );

  const primaryEmailByAccount = new Map(
    contacts
      .filter((contact) => contact.isPrimary && contact.email)
      .map((contact) => [contact.accountId, contact.email as string]),
  );

  // ── 올해 기회 ──
  type OpportunityRow = {
    id: string;
    orgId: string;
    accountId: string;
    ownerId: string;
    name: string;
    stage: Stage;
    expectedCloseDate: Date;
    actualCloseDate: Date | null;
    lostReason: string | null;
    memo: string | null;
    createdAt: Date;
    previousOpportunityId?: string;
  };

  const opportunityRows: OpportunityRow[] = [];
  const activityRows: {
    id: string;
    orgId: string;
    opportunityId: string;
    actorId: string;
    eventType: string;
    detail: string;
    occurredAt: Date;
  }[] = [];
  const documentRows: {
    id: string;
    orgId: string;
    authorId: string;
    opportunityId: string;
    title: string;
    type: string;
    status: string;
    clientName: string;
    amount: number;
    createdAt: Date;
    updatedAt: Date;
  }[] = [];
  const emailLogRows: {
    id: string;
    documentId: string;
    senderId: string;
    recipients: string;
    subject: string;
    attachmentName: string;
    status: string;
    sentAt: Date;
    trackingId: string;
    openedAt: Date | null;
    openCount: number;
  }[] = [];

  /**
   * 수주 건 — 내년 갱신의 원본이 된다 (원본 하나에 갱신 하나).
   * 갱신 기회가 이어받을 값(거래처·담당자)을 여기 함께 담는다 — 나중에 기회 목록을
   * 되짚어 찾으면 같은 사실을 두 곳에서 꺼내는 셈이 된다.
   */
  const wonSources: {
    id: string;
    name: string;
    closeDate: Date;
    accountId: string;
    clientName: string;
    ownerId: string;
  }[] = [];

  const addActivity = (
    opportunityId: string,
    actorId: string,
    eventType: string,
    detail: Record<string, unknown>,
    occurredAt: Date,
  ) => {
    activityRows.push({
      id: nextId(),
      orgId,
      opportunityId,
      actorId,
      eventType,
      detail: JSON.stringify(detail),
      occurredAt,
    });
  };

  /**
   * 기회 한 건과 그 부속(이력·문서·발송 이력)을 만든다.
   *
   * 문서를 붙이기만 하고 **금액·확정 문서는 정하지 않는다** — `seed.ts` 의 재판정 패스가
   * 정한다(기회-6). `documentAmount` 는 문서의 금액이고, 기회의 예상 금액은 그 결과다.
   */
  const buildOpportunity = (args: {
    accountId: string;
    clientName: string;
    ownerId: string;
    name: string;
    stage: Stage;
    expectedCloseDate: Date;
    createdAt: Date;
    /** 마감 시각 — 진행 중이면 null */
    actualCloseDate: Date | null;
    /** 문서를 붙일지. 비우면 `₩0 · 확정 문서 없음` 이 된다 (기회-6 ④) */
    withDocument: boolean;
    previousOpportunityId?: string;
  }): { id: string; amount: number } => {
    const id = nextId();
    const {
      accountId,
      clientName,
      ownerId,
      name,
      stage,
      expectedCloseDate,
      createdAt,
      actualCloseDate,
      withDocument,
      previousOpportunityId,
    } = args;

    const isLost = stage === "LOST";
    opportunityRows.push({
      id,
      orgId,
      accountId,
      ownerId,
      name,
      stage,
      expectedCloseDate,
      actualCloseDate,
      // 실주에는 사유가 반드시 있어야 한다 (F-117) — 고정 목록에서 고른다
      lostReason: isLost ? pick(random, LOST_REASON_PRESETS) : null,
      memo:
        random() < 0.3
          ? pick(random, [
              "경쟁사 견적과 비교 중입니다.",
              "예산 확정 후 재논의 예정입니다.",
              "기술 검토 회의 후 최종 결정합니다.",
              "본사 승인 대기 중입니다.",
              "담당자 요청으로 견적을 재발송했습니다.",
            ])
          : null,
      createdAt,
      ...(previousOpportunityId ? { previousOpportunityId } : {}),
    });

    // 타임라인 — 마감 기회는 **어디까지 갔다가 끝났는지**가 이력에 남아야 한다
    // (스테퍼가 `stage` 하나로 단정하지 않고 이력의 from·to 로 도달 지점을 도출한다).
    const closedAt = actualCloseDate ?? expectedCloseDate;
    addActivity(id, ownerId, "OPPORTUNITY_CREATED", { accountId, ownerId }, createdAt);

    if (stage !== "INITIAL") {
      addActivity(
        id,
        ownerId,
        "STAGE_CHANGED",
        { from: "INITIAL", to: "PROPOSAL" },
        between(createdAt, closedAt, 0.25),
      );
    }
    if (stage === "NEGOTIATION" || stage === "WON") {
      addActivity(
        id,
        ownerId,
        "STAGE_CHANGED",
        { from: "PROPOSAL", to: "NEGOTIATION" },
        between(createdAt, closedAt, 0.55),
      );
    }
    if (stage === "WON" || stage === "LOST") {
      addActivity(
        id,
        ownerId,
        stage,
        {
          from: stage === "WON" ? "NEGOTIATION" : "PROPOSAL",
          to: stage,
        },
        closedAt,
      );
    }

    if (!withDocument) return { id, amount: 0 };

    const amount = documentAmount(random);
    const documentId = nextId();
    const documentCreatedAt = between(createdAt, closedAt, 0.3);
    const isContract = stage === "WON" && random() < 0.35;
    const type = isContract ? "CONTRACT" : "QUOTE";
    const title = `${clientName} ${name} ${isContract ? "계약서" : "견적서"}`;
    // 상태는 단계와 어긋나지 않아야 한다 — 수주 건의 근거 문서가 초안이면
    // "무엇으로 계약했는가" 를 설명할 수 없다.
    const status =
      stage === "WON"
        ? "COMPLETED"
        : stage === "LOST"
          ? "SENT"
          : stage === "INITIAL"
            ? "DRAFT"
            : weighted(random, [
                ["SENT", 60],
                ["DRAFT", 40],
              ]);

    documentRows.push({
      id: documentId,
      orgId,
      authorId: ownerId,
      opportunityId: id,
      title,
      type,
      status,
      clientName,
      amount,
      createdAt: documentCreatedAt,
      updatedAt: documentCreatedAt,
    });
    addActivity(
      id,
      ownerId,
      "DOCUMENT_CREATED",
      { documentId, documentType: type, documentTitle: title },
      documentCreatedAt,
    );

    // 발송 이력은 **나간 문서에만** 남긴다. 초안에 발송 기록이 붙으면 발송 이력 화면과
    // 문서 상태가 서로 다른 말을 한다.
    const recipient = primaryEmailByAccount.get(accountId);
    if (recipient && status !== "DRAFT" && random() < 0.45) {
      const sentAt = addDays(documentCreatedAt, intBetween(random, 1, 3));
      const opened = random() < 0.55;
      emailLogRows.push({
        id: nextId(),
        documentId,
        senderId: ownerId,
        recipients: recipient,
        subject: `[제안] ${title}`,
        attachmentName: `${title}.pdf`,
        status: "SENT",
        sentAt,
        // 추측 불가능한 값이어야 한다 — 트래킹 라우트는 인증 없이 열려 있고
        // 이 id 의 무작위성이 유일한 방어선이다 (F-234).
        trackingId: randomUUID(),
        // 열람은 **확인된 것만** 채운다. 기록이 없는 건은 "안 읽었다" 가 아니라
        // "기록 없음" 이다 — 이미지 차단이면 읽었는데도 기록이 남지 않는다.
        openedAt: opened ? addDays(sentAt, intBetween(random, 0, 2)) : null,
        openCount: opened ? intBetween(random, 1, 4) : 0,
      });
      addActivity(
        id,
        ownerId,
        "DOCUMENT_SENT",
        {
          documentId,
          documentType: type,
          documentTitle: title,
          recipients: recipient,
        },
        sentAt,
      );
    }

    return { id, amount };
  };

  for (const day of daysOfYear(thisYear)) {
    const isPast = day.getTime() < today.getTime();
    const count = weighted(random, EVENTS_PER_DAY);

    for (let slot = 0; slot < count; slot += 1) {
      const account = pick(random, accounts);
      const ownerId = pick(random, ownerIds);
      const stage = stageFor(random, slot, isPast);
      const solution = pick(random, SOLUTIONS);
      const name =
        random() < 0.3 ? `${solution} ${intBetween(random, 1, 3)}차` : solution;

      // 마감 시각: 과거 건은 마감 예정일 근처, 미래 건인데 수주·실주라면 이미 끝난
      // 것이므로 오늘보다 앞이어야 한다(마감 예정일보다 먼저 체결된 조기 확정).
      const actualCloseDate =
        stage === "WON" || stage === "LOST"
          ? isPast
            ? addDays(day, -intBetween(random, 0, 5))
            : addDays(today, -intBetween(random, 1, 25))
          : null;

      // 생성일은 **실제로 끝난 날**(없으면 마감 예정일)보다 20~120일 앞이다.
      // 마감 예정일에서만 역산하면 조기 확정된 건에서 순서가 뒤집힌다 — 12월 마감
      // 예정으로 11월에 만든 기회가 8월에 이미 수주된 것으로 남고(실측 172건), 그러면
      // 활동 이력의 첫 줄이 기회 생성보다 앞서 타임라인이 거꾸로 읽힌다.
      // 연초 마감 건이 전년도에 시작된 것은 그대로 자연스럽다(영업은 해를 넘겨 진행된다).
      const createdAt = addDays(
        actualCloseDate ?? day,
        -intBetween(random, 20, 120),
      );

      const built = buildOpportunity({
        accountId: account.id,
        clientName: account.companyName,
        ownerId,
        name,
        stage,
        expectedCloseDate: day,
        createdAt,
        actualCloseDate,
        // 20건에 1건은 문서 없이 둔다 — `₩0 · 확정 문서 없음` 안내를 화면에서 만난다
        withDocument: random() >= 0.05,
      });

      // 문서가 없는 수주 건은 갱신 원본으로 쓰지 않는다 — 근거 금액이 없는 계약에서
      // 이어지는 갱신은 시연에서 설명할 수 없다.
      if (stage === "WON" && built.amount > 0) {
        wonSources.push({
          id: built.id,
          name,
          closeDate: day,
          accountId: account.id,
          clientName: account.companyName,
          ownerId,
        });
      }
    }
  }

  // ── 내년: 갱신 기회 ──
  //
  // 수주로 끝난 건마다 **다음 건**을 세운다. 원본은 `수주` 로 그대로 남고 새 기회가
  // `previousOpportunityId` 로 이어진다 — 단계를 되돌려 재활용하면 이미 딴 계약의 기록이
  // 사라진다 (F-115).
  //
  // ## 마감일은 제안값 순서를 지키면서 내년 전체에 고르게 편다
  //
  // `suggestedRenewalCloseDate`(원본 마감일 + 1년)를 그대로 쓰면 **올해의 분포가 그대로
  // 복사된다.** 그게 문제가 되는 자리가 있다 — 올해 미래 구간은 진행 중 기회가 주류라
  // 수주가 드물고, 그 드문 만큼 내년 같은 구간이 통째로 빈다(실측: 내년 8~12월 137일이
  // 빈 캘린더였다). 갱신 마감일은 **제안값이고 강제가 아니므로**(AGENTS.md — 저장되는
  // 값은 사용자가 폼에서 정한다) 제안값을 **정렬 기준**으로만 쓰고, 그 순서를 유지한 채
  // 내년 날짜에 1~2건씩 고르게 배분한다. 순서를 지키므로 "먼저 수주한 건이 먼저 갱신된다"
  // 는 시간 흐름은 남고, 어느 날도 비지 않는다.
  const nextYear = thisYear + 1;
  const renewalIds: string[] = [];
  const nextYearDays = daysOfYear(nextYear);
  const sortedWon = [...wonSources]
    .map((source) => ({
      source,
      suggested: suggestedRenewalCloseDate(source.closeDate, today),
    }))
    .sort((a, b) => a.suggested.getTime() - b.suggested.getTime());

  for (const [index, { source }] of sortedWon.entries()) {
    // 후보를 순서대로 내년 날짜에 흘려 넣는다. 후보 수가 날짜 수보다 많으면 일부 날짜가
    // 2건이 되고, 적으면 빈 날이 생긴다 — 그래서 위 `stageFor` 가 과거 날짜마다 수주를
    // 최소 한 건 보장한다(둘은 함께 지켜야 하는 규칙이다).
    const closeDate =
      nextYearDays[
        Math.min(
          nextYearDays.length - 1,
          Math.floor((index * nextYearDays.length) / sortedWon.length),
        )
      ];

    // 갱신 건은 이미 파이프라인에 올라와 있다 — 원본이 마감된 직후에 세운 것으로 본다
    const createdAt = addDays(
      source.closeDate,
      intBetween(random, 3, 30),
    );
    const stage: Stage = weighted(random, [
      ["INITIAL", 55],
      ["PROPOSAL", 30],
      ["NEGOTIATION", 15],
    ]);

    const built = buildOpportunity({
      accountId: source.accountId,
      clientName: source.clientName,
      ownerId: source.ownerId,
      // 이름은 화면·서버와 같은 순수 함수로 만든다 — 회차가 쌓이지 않고 올라간다
      name: renewalName(source.name),
      stage,
      expectedCloseDate: closeDate,
      createdAt,
      actualCloseDate: null,
      // 갱신 건에도 새 견적을 낸다. 금액을 **복제하지 않는 것**과 문서를 붙이는 것은
      // 다른 일이다 — 예상 금액은 그 문서에서 파생된다 (기회-6).
      withDocument: random() >= 0.08,
      previousOpportunityId: source.id,
    });
    renewalIds.push(built.id);
  }

  // ── 삽입 ──
  // `createMany` 로 배치 삽입한다. 관계를 미리 만든 id 로 걸어 두었으므로 순서만 지키면
  // 된다(기회 → 문서·이력 → 발송 이력). 한 번에 넣는 행 수는 SQLite 의 바인딩 한계를
  // 넘지 않게 나눈다.
  await insertInChunks(opportunityRows, (rows) =>
    prisma.opportunity.createMany({ data: rows }),
  );
  await insertInChunks(documentRows, (rows) =>
    prisma.document.createMany({ data: rows }),
  );
  await insertInChunks(activityRows, (rows) =>
    prisma.activityLog.createMany({ data: rows }),
  );
  await insertInChunks(emailLogRows, (rows) =>
    prisma.emailLog.createMany({ data: rows }),
  );

  // 캘린더에 빈 날이 없는지 스스로 확인한다 — 이 모듈의 목적이 그것이므로
  // 시드가 끝난 뒤에 사람이 달을 넘겨 가며 확인하게 두지 않는다.
  const filledDays = new Set(
    opportunityRows.map((row) => row.expectedCloseDate.toDateString()),
  );
  const emptyCalendarDays = [
    ...daysOfYear(thisYear),
    ...daysOfYear(nextYear),
  ].filter((day) => !filledDays.has(day.toDateString())).length;

  return {
    accounts: accounts.length,
    contacts: contacts.length,
    opportunities: opportunityRows.length - renewalIds.length,
    renewals: renewalIds.length,
    documents: documentRows.length,
    activityLogs: activityRows.length,
    emailLogs: emailLogRows.length,
    emptyCalendarDays,
  };
}

/**
 * `createMany` 를 나눠 넣는다.
 *
 * SQLite 는 한 문장이 쓸 수 있는 바인딩 수에 한계가 있어, 수천 행을 한 번에 넘기면
 * 드라이버가 거부한다. 열 수가 많은 표(문서·이력)에서 먼저 걸리므로 넉넉히 나눈다.
 */
async function insertInChunks<T>(
  rows: readonly T[],
  insert: (chunk: T[]) => Promise<unknown>,
  size = 200,
): Promise<void> {
  for (let index = 0; index < rows.length; index += size) {
    await insert(rows.slice(index, index + size));
  }
}
