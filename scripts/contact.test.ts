/**
 * `src/lib/contact.ts` 검증 (네트워크·DB 없이 순수 함수만).
 * 실행: pnpm test:contact
 *
 * 지키는 불변식은 하나다 — **담당자가 1명 이상이면 대표는 정확히 1명이다.**
 * 대표는 DB 제약이 아니라 앱이 지키므로(SQLite 부분 유니크 제약을 쓸 수 없다),
 * 규칙이 한 군데라도 어긋나면 목록의 담당자 칸이 비거나 두 사람이 동시에 대표가 된다.
 *
 * 아래 apply* 는 API 라우트가 트랜잭션 안에서 하는 일을 그대로 옮긴 것이다.
 * 라우트가 규칙을 새로 판단하지 않고 이 순수 함수들만 조합하므로, 여기서 도는 시나리오가
 * 곧 서버 동작이다.
 */

import assert from "node:assert/strict";
import {
  compareContacts,
  demotionTargetIds,
  isBlankContactForm,
  isPhone,
  normalizePhone,
  parseContactInput,
  parseContactInputs,
  primaryContact,
  resolveBatchIsPrimary,
  resolveCreateIsPrimary,
  resolveDeletion,
  resolveUpdateIsPrimary,
  sortContacts,
  type ContactOrderRef,
} from "../src/lib/contact";

let checks = 0;
function check(actual: unknown, expected: unknown, message: string) {
  assert.deepEqual(actual, expected, message);
  checks += 1;
}

type Row = ContactOrderRef & { name: string };

/** 배열 검증 결과에서 대표 플래그만 뽑는다 (실패했으면 메시지를 그대로 돌려 검사에서 드러나게 한다) */
function batchPrimaryFlags(
  result: ReturnType<typeof parseContactInputs>,
): boolean[] | { error: string } {
  return Array.isArray(result) ? result.map((one) => one.isPrimary) : result;
}

const at = (day: number) =>
  `2026-08-${String(day).padStart(2, "0")}T00:00:00.000Z`;

// ─────────────────── 라우트가 하는 일을 그대로 옮긴 조작 ───────────────────

/** POST /api/accounts/:id/contacts */
function applyCreate(
  rows: readonly Row[],
  next: { id: string; name: string; createdAt: string; requested: boolean },
): Row[] {
  const isPrimary = resolveCreateIsPrimary(rows.length, next.requested);
  // 새 담당자는 아직 목록에 없으므로 현재 대표 전원이 해제 대상이다
  const demote = new Set(isPrimary ? demotionTargetIds(rows, "") : []);
  return [
    ...rows.map((row) =>
      demote.has(row.id) ? { ...row, isPrimary: false } : row,
    ),
    { id: next.id, name: next.name, createdAt: next.createdAt, isPrimary },
  ];
}

/** PATCH /api/accounts/:id/contacts/:contactId */
function applyUpdate(
  rows: readonly Row[],
  id: string,
  requested: boolean,
): Row[] {
  const target = rows.find((row) => row.id === id);
  assert.ok(target, `수정 대상이 있어야 한다: ${id}`);
  const isPrimary = resolveUpdateIsPrimary(target.isPrimary, requested);
  const demote = new Set(isPrimary ? demotionTargetIds(rows, id) : []);
  return rows.map((row) =>
    row.id === id
      ? { ...row, isPrimary }
      : demote.has(row.id)
        ? { ...row, isPrimary: false }
        : row,
  );
}

/** DELETE /api/accounts/:id/contacts/:contactId */
function applyDelete(rows: readonly Row[], id: string): Row[] {
  const { promoted, remaining } = resolveDeletion(rows, id);
  return remaining.map((row) =>
    promoted && row.id === promoted.id ? { ...row, isPrimary: true } : row,
  );
}

/** 불변식 — 0명이면 대표 0명, 1명 이상이면 대표 정확히 1명 */
function assertInvariant(rows: readonly Row[], label: string) {
  const primaries = rows.filter((row) => row.isPrimary).length;
  assert.equal(
    primaries,
    rows.length === 0 ? 0 : 1,
    `${label}: 담당자 ${rows.length}명일 때 대표는 ${rows.length === 0 ? 0 : 1}명이어야 하는데 ${primaries}명이다`,
  );
  checks += 1;
}

// ───────────────────────── 첫 담당자 자동 대표 ─────────────────────────
// 하나뿐인데 대표가 아니면 목록의 담당자 칸이 비어 "담당자가 없는 거래처"로 읽힌다.
check(resolveCreateIsPrimary(0, false), true, "첫 담당자: 요청이 false 여도 대표");
check(resolveCreateIsPrimary(0, true), true, "첫 담당자: 요청이 true 면 당연히 대표");
check(
  resolveCreateIsPrimary(1, false),
  false,
  "두 번째부터는 요청을 따른다(비대표)",
);
check(resolveCreateIsPrimary(3, true), true, "두 번째부터는 요청을 따른다(대표)");

// ──────────────────────── 대표는 스스로 내려올 수 없다 ────────────────────────
// 내려올 수 있게 두면 담당자는 있는데 대표는 0명인 상태가 만들어진다.
check(resolveUpdateIsPrimary(true, false), true, "대표 해제 요청은 무시한다");
check(resolveUpdateIsPrimary(true, true), true, "대표 유지");
check(
  resolveUpdateIsPrimary(false, true),
  true,
  "비대표 → 대표 승격은 받아들인다",
);
check(resolveUpdateIsPrimary(false, false), false, "비대표 유지");

// ───────────────────────── 기존 대표 해제 대상 ─────────────────────────
const trio: Row[] = [
  { id: "c1", name: "이서준", isPrimary: true, createdAt: at(1) },
  { id: "c2", name: "오하늘", isPrimary: false, createdAt: at(2) },
  { id: "c3", name: "강동원", isPrimary: false, createdAt: at(3) },
];
check(demotionTargetIds(trio, "c2"), ["c1"], "c2 를 대표로 올리면 c1 을 내린다");
check(
  demotionTargetIds(trio, "c1"),
  [],
  "이미 대표인 사람을 올리면 내릴 대상이 없다",
);
check(
  demotionTargetIds(trio, ""),
  ["c1"],
  "생성 시(목록에 없는 id)에는 현재 대표 전원이 대상",
);
check(demotionTargetIds([], "c9"), [], "담당자가 없으면 내릴 대상도 없다");
// 데이터가 어긋나 대표가 여럿이어도 한 번에 정리된다
const broken: Row[] = [
  { id: "b1", name: "가", isPrimary: true, createdAt: at(1) },
  { id: "b2", name: "나", isPrimary: true, createdAt: at(2) },
  { id: "b3", name: "다", isPrimary: false, createdAt: at(3) },
];
check(
  demotionTargetIds(broken, "b3"),
  ["b1", "b2"],
  "대표가 여럿이면 전부 해제 대상",
);

// ──────────────────────── 정렬 · 대표 고르기 ────────────────────────
check(
  sortContacts(trio).map((row) => row.id),
  ["c1", "c2", "c3"],
  "대표가 맨 앞, 그다음 등록 순",
);
check(
  sortContacts([trio[2], trio[1], trio[0]]).map((row) => row.id),
  ["c1", "c2", "c3"],
  "입력 순서와 무관하게 같은 결과",
);
const originalOrder = [trio[2], trio[0], trio[1]];
sortContacts(originalOrder);
check(
  originalOrder.map((row) => row.id),
  ["c3", "c1", "c2"],
  "원본 배열은 건드리지 않는다",
);
// 같은 시각이면 id 로 갈라 순서가 매번 흔들리지 않게 한다 (시드·일괄 등록)
const sameTime: Row[] = [
  { id: "z", name: "지", isPrimary: false, createdAt: at(5) },
  { id: "a", name: "에", isPrimary: false, createdAt: at(5) },
];
check(
  sortContacts(sameTime).map((row) => row.id),
  ["a", "z"],
  "동시 등록은 id 로 순서를 확정한다",
);
check(compareContacts(trio[0], trio[1]) < 0, true, "대표가 앞선다");
check(compareContacts(trio[1], trio[2]) < 0, true, "먼저 만들어진 쪽이 앞선다");

check(primaryContact(trio)?.id, "c1", "대표를 고른다");
check(primaryContact([]), null, "담당자 0명이면 대표도 없다 — 정상 상태다");
check(
  primaryContact([trio[1], trio[2]]),
  null,
  "대표 표시가 없으면 아무나 대표로 승격시키지 않는다",
);
check(
  primaryContact(broken)?.id,
  "b1",
  "대표가 여럿이면 가장 먼저 만들어진 한 명만 본다",
);

// ──────────────────────── 대표 삭제 시 승격 ────────────────────────
// 삭제 한 번으로 목록에서 그 거래처의 담당자가 사라지는 편이 더 나쁘다.
const deletePrimary = resolveDeletion(trio, "c1");
check(deletePrimary.deleted?.id, "c1", "삭제 대상을 찾는다");
check(
  deletePrimary.promoted?.id,
  "c2",
  "대표를 지우면 남은 사람 중 가장 먼저 만들어진 사람이 승격",
);
check(
  deletePrimary.remaining.map((row) => row.id),
  ["c2", "c3"],
  "남은 담당자",
);

const deleteOther = resolveDeletion(trio, "c3");
check(deleteOther.promoted, null, "대표가 아닌 사람을 지우면 승격은 없다");

const deleteLast = resolveDeletion([trio[0]], "c1");
check(deleteLast.promoted, null, "마지막 한 명을 지우면 승격 대상이 없다");
check(deleteLast.remaining, [], "담당자 0명이 된다 — 허용한다");

check(
  resolveDeletion(trio, "없는id").deleted,
  null,
  "없는 id 는 삭제 대상이 없다(404)",
);
check(
  resolveDeletion(trio, "없는id").remaining.map((row) => row.id),
  ["c1", "c2", "c3"],
  "없는 id 로는 아무도 지워지지 않는다",
);

// 승격은 "등록 순"이지 "배열 순"이 아니다 — 조회 순서가 뒤집혀도 같은 사람이 올라와야 한다
const reversed = [trio[2], trio[1], trio[0]];
check(
  resolveDeletion(reversed, "c1").promoted?.id,
  "c2",
  "배열 순서를 뒤집어도 승격 대상은 같다",
);

// ──────────────── 시나리오: 조작을 이어 붙여도 불변식이 선다 ────────────────
let rows: Row[] = [];
assertInvariant(rows, "빈 거래처");
check(primaryContact(rows), null, "담당자 0명으로 시작한다(거래처 먼저 등록)");

// 1) 첫 담당자 — 대표로 지정하지 않았는데도 대표가 된다
rows = applyCreate(rows, {
  id: "c1",
  name: "이서준",
  createdAt: at(1),
  requested: false,
});
assertInvariant(rows, "첫 담당자 추가");
check(primaryContact(rows)?.name, "이서준", "첫 담당자가 대표");

// 2) 두 번째 담당자를 비대표로 추가
rows = applyCreate(rows, {
  id: "c2",
  name: "오하늘",
  createdAt: at(2),
  requested: false,
});
assertInvariant(rows, "두 번째 담당자 추가");
check(primaryContact(rows)?.name, "이서준", "대표는 그대로");

// 3) 세 번째를 **대표로** 추가 — 기존 대표가 같은 조작 안에서 내려간다
rows = applyCreate(rows, {
  id: "c3",
  name: "강동원",
  createdAt: at(3),
  requested: true,
});
assertInvariant(rows, "대표로 추가");
check(primaryContact(rows)?.name, "강동원", "새로 넣은 사람이 대표");
check(
  rows.find((row) => row.id === "c1")?.isPrimary,
  false,
  "기존 대표는 내려간다",
);

// 4) 대표가 스스로 내려오려 해도 막힌다 (대표 0명 방지)
rows = applyUpdate(rows, "c3", false);
assertInvariant(rows, "대표 자가 해제 시도");
check(primaryContact(rows)?.name, "강동원", "대표는 그대로 유지된다");

// 5) 다른 사람을 대표로 올린다
rows = applyUpdate(rows, "c2", true);
assertInvariant(rows, "대표 교체");
check(primaryContact(rows)?.name, "오하늘", "지정한 사람이 대표");

// 6) 대표를 삭제 → 남은 사람 중 가장 먼저 만들어진 이서준(c1)이 올라온다
rows = applyDelete(rows, "c2");
assertInvariant(rows, "대표 삭제");
check(primaryContact(rows)?.name, "이서준", "가장 먼저 만들어진 사람이 승격");
check(rows.length, 2, "두 명 남는다");

// 7) 비대표 삭제 — 대표는 그대로
rows = applyDelete(rows, "c3");
assertInvariant(rows, "비대표 삭제");
check(primaryContact(rows)?.name, "이서준", "대표 유지");

// 8) 마지막 한 명까지 삭제 — 0명을 허용한다
rows = applyDelete(rows, "c1");
assertInvariant(rows, "마지막 담당자 삭제");
check(rows, [], "담당자 0명 — 목록의 담당자 칸은 빈 값으로 표시된다");

// 9) 다시 넣으면 또 자동으로 대표가 된다
rows = applyCreate(rows, {
  id: "c4",
  name: "서가온",
  createdAt: at(9),
  requested: false,
});
assertInvariant(rows, "0명 → 다시 추가");
check(primaryContact(rows)?.name, "서가온", "0명이 된 뒤 넣은 첫 담당자도 대표");

// ──────────────────────── 입력 검증 (parseContactInput) ────────────────────────
check(
  parseContactInput({
    name: "  이서준  ",
    position: " 구매팀 과장 ",
    phone: "",
    email: "  seojun@example.com ",
    isPrimary: true,
  }),
  {
    name: "이서준",
    position: "구매팀 과장",
    phone: null,
    email: "seojun@example.com",
    isPrimary: true,
  },
  "앞뒤 공백을 다듬고 빈 값은 null 로 둔다",
);

check(
  parseContactInput({ name: "   " }),
  { error: "담당자명을 입력해주세요." },
  "담당자명은 필수",
);
check(
  parseContactInput({}),
  { error: "담당자명을 입력해주세요." },
  "본문이 비어도 안전하게 실패한다",
);
check(
  parseContactInput({ name: 123 }),
  { error: "담당자명을 입력해주세요." },
  "문자열이 아닌 값은 빈 값으로 본다",
);
check(
  parseContactInput({ name: "가".repeat(61) }),
  { error: "담당자명은(는) 60자 이내여야 합니다." },
  "담당자명 길이 상한",
);
check(
  parseContactInput({ name: "이서준", email: "seojun" }),
  { error: "담당자 이메일 형식이 올바르지 않습니다." },
  "이메일 형식은 값이 있을 때만 본다",
);
check(
  "error" in parseContactInput({ name: "이서준", email: "" }),
  false,
  "이메일은 비워도 된다",
);
check(
  parseContactInput({ name: "이서준" }),
  { name: "이서준", position: null, phone: null, email: null, isPrimary: false },
  "isPrimary 를 안 보내면 대표를 요청하지 않은 것으로 본다",
);
check(
  parseContactInput({ name: "이서준", isPrimary: "true" }),
  { name: "이서준", position: null, phone: null, email: null, isPrimary: false },
  "문자열 'true' 는 대표 요청이 아니다 (엄격히 true 만 받는다)",
);

// ──────────────────── 연락처 정규화 (normalizePhone) ────────────────────
// 저장 표기를 하나로 모은다 — 같은 번호가 입력 방식마다 다르게 남으면 목록에서 다른 번호처럼 보인다.
check(normalizePhone("01012345678"), "010-1234-5678", "하이픈 없이 쳐도 붙여준다");
check(
  normalizePhone("010 1234 5678"),
  "010-1234-5678",
  "공백 구분도 같은 값이 된다",
);
check(
  normalizePhone("010.1234.5678"),
  "010-1234-5678",
  "점 구분도 같은 값이 된다",
);
check(
  normalizePhone("  010-1234-5678  "),
  "010-1234-5678",
  "앞뒤 공백을 다듬는다",
);
check(
  normalizePhone("+82 10-1234-5678"),
  "010-1234-5678",
  "국가번호(+82)는 떼고 앞자리 0 을 되살린다",
);
check(
  normalizePhone("0082 10 1234 5678"),
  "010-1234-5678",
  "국제전화 접두(0082)도 같게 본다",
);
check(normalizePhone("0212345678"), "02-1234-5678", "서울 지역번호는 2자리");
check(normalizePhone("021234567"), "02-123-4567", "서울 7자리 번호");
check(
  normalizePhone("+82 2 123 4567"),
  "02-123-4567",
  "국가번호를 뗀 뒤에도 지역번호 0 을 되살린다",
);
check(normalizePhone("0311234567"), "031-123-4567", "경기 지역번호는 3자리");
check(normalizePhone("15881234"), "1588-1234", "대표번호는 4-4 로 끊는다");
check(
  normalizePhone("+82 1588 1234"),
  "1588-1234",
  "대표번호에는 0 을 붙이지 않는다",
);
check(
  normalizePhone("0505-123-4567"),
  "0505-123-4567",
  "안심번호(050X)는 식별번호가 4자리",
);
check(normalizePhone(""), "", "빈 값은 빈 값 그대로");
check(normalizePhone("   "), "", "공백뿐이면 빈 값");
check(
  normalizePhone("+1 415 555 2671"),
  "+1 415 555 2671",
  "해외 번호는 국내 규칙으로 재단하지 않고 원본을 둔다",
);
check(
  normalizePhone("내선 1234"),
  "내선 1234",
  "정규화할 수 없는 값은 원본을 돌려주고 판정은 isPhone 이 한다",
);

// ──────────────────────── 연락처 형식 (isPhone) ────────────────────────
check(isPhone("010-1234-5678"), true, "휴대전화");
check(isPhone("02-123-4567"), true, "서울 7자리");
check(isPhone("031-123-4567"), true, "지역번호 3자리");
check(isPhone("1588-1234"), true, "대표번호");
check(isPhone("+1 415 555 2671"), true, "국가번호를 밝힌 해외 번호는 받는다");
check(isPhone("01012345678"), false, "정규화 전 값은 통과시키지 않는다");
check(isPhone("010-1234-56789"), false, "자릿수가 넘치면 거른다");
check(isPhone("전화번호"), false, "숫자가 아니면 거른다");
check(isPhone("1234"), false, "짧은 숫자는 번호가 아니다");

// ─────────────── 입력 검증에 연락처가 걸린다 (parseContactInput) ───────────────
check(
  parseContactInput({ name: "이서준", phone: " 01012345678 " }),
  {
    name: "이서준",
    position: null,
    phone: "010-1234-5678",
    email: null,
    isPrimary: false,
  },
  "저장 전에 연락처를 정규화한다",
);
check(
  parseContactInput({ name: "이서준", phone: "1234" }),
  { error: "연락처는 010-1234-5678 형식으로 입력해주세요." },
  "연락처 형식은 값이 있을 때만 본다 — 틀리면 거른다",
);
check(
  "error" in parseContactInput({ name: "이서준", phone: "" }),
  false,
  "연락처는 비워도 된다",
);
check(
  parseContactInput({ name: "이서준", phone: "0".repeat(31) }),
  { error: "연락처은(는) 30자 이내여야 합니다." },
  "연락처 길이 상한",
);

// ─────── 여러 명 한 번에 등록: 대표는 정확히 1명 (resolveBatchIsPrimary) ───────
check(resolveBatchIsPrimary([]), [], "0명이면 대표도 없다");
check(
  resolveBatchIsPrimary([{ isPrimary: false }, { isPrimary: false }]),
  [true, false],
  "아무도 고르지 않으면 첫 담당자가 대표",
);
check(
  resolveBatchIsPrimary([
    { isPrimary: false },
    { isPrimary: true },
    { isPrimary: false },
  ]),
  [false, true, false],
  "고른 사람이 대표",
);
check(
  resolveBatchIsPrimary([{ isPrimary: true }, { isPrimary: true }]),
  [true, false],
  "둘 이상 들어와도 앞의 한 명만 남긴다 (API 로는 여러 개가 올 수 있다)",
);

// ──────────────── 빈 줄은 없는 것으로 본다 (isBlankContactForm) ────────────────
check(
  isBlankContactForm({
    name: "  ",
    position: "",
    phone: " ",
    email: "",
    isPrimary: false,
  }),
  true,
  "네 칸이 모두 비면 추가만 눌러 둔 줄이다",
);
check(
  isBlankContactForm({
    name: "",
    position: "과장",
    phone: "",
    email: "",
    isPrimary: false,
  }),
  false,
  "한 칸이라도 채워졌으면 검증 대상이다 (담당자명 누락으로 걸린다)",
);

// ────────── 거래처 등록과 함께 오는 담당자 배열 (parseContactInputs) ──────────
check(parseContactInputs(undefined), [], "담당자를 안 보내면 0명");
check(parseContactInputs(null), [], "null 도 0명으로 본다");
check(parseContactInputs([]), [], "빈 배열도 0명");
check(
  parseContactInputs("이서준"),
  { error: "담당자 목록 형식이 올바르지 않습니다." },
  "배열이 아니면 거부한다",
);
check(
  parseContactInputs([{ name: "김대리" }, { name: "이과장" }]),
  [
    {
      name: "김대리",
      position: null,
      phone: null,
      email: null,
      isPrimary: true,
    },
    {
      name: "이과장",
      position: null,
      phone: null,
      email: null,
      isPrimary: false,
    },
  ],
  "아무도 고르지 않으면 첫 담당자가 대표",
);
check(
  batchPrimaryFlags(
    parseContactInputs([
      { name: "김대리" },
      { name: "이과장", isPrimary: true },
    ]),
  ),
  [false, true],
  "고른 사람만 대표가 된다",
);
check(
  batchPrimaryFlags(
    parseContactInputs([
      { name: "김대리", isPrimary: true },
      { name: "이과장", isPrimary: true },
    ]),
  ),
  [true, false],
  "여러 명이 대표로 들어와도 한 명만 남는다",
);
check(
  parseContactInputs([{ name: "김대리" }, {}]),
  { error: "담당자 2: 담당자명을 입력해주세요." },
  "어느 줄이 잘못됐는지 순번으로 알린다",
);
check(
  parseContactInputs([{ name: "김대리", email: "seojun" }]),
  { error: "담당자 1: 담당자 이메일 형식이 올바르지 않습니다." },
  "이메일 검증은 한 명짜리와 같은 규칙",
);
check(
  parseContactInputs([{ name: "김대리", phone: "1234" }]),
  { error: "담당자 1: 연락처는 010-1234-5678 형식으로 입력해주세요." },
  "연락처 검증도 같은 규칙",
);
check(
  parseContactInputs([null]),
  { error: "담당자 1: 입력값을 확인해주세요." },
  "객체가 아닌 줄은 안전하게 실패한다",
);
check(
  parseContactInputs([{ name: "김대리", phone: "+82 10-1234-5678" }]),
  [
    {
      name: "김대리",
      position: null,
      phone: "010-1234-5678",
      email: null,
      isPrimary: true,
    },
  ],
  "배열로 들어와도 연락처를 정규화한다",
);

console.log(`contact: ${checks}건 검증 통과`);
