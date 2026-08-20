import "dotenv/config";
import { PrismaBetterSqlite3 } from "@prisma/adapter-better-sqlite3";
import { PrismaClient } from "../src/generated/prisma/client";
import {
  seedTemplate,
  calcItemTableTotal,
  type BlockPropsMap,
} from "../src/lib/editor-schema";
// 확정 문서 판정은 런타임과 **같은 순수 함수**를 쓴다 (기회-6) — 시드가 화면과 다른 숫자를
// 만들어 내면 "왜 이 금액인지" 를 설명할 수 없다.
import { resolveConfirmedDocument } from "../src/lib/confirmed-document";

const adapter = new PrismaBetterSqlite3({
  url: process.env.DATABASE_URL ?? "file:./dev.db",
});
const prisma = new PrismaClient({ adapter });

/** 기획서 정책 라이브러리 24개 (코드 기준, description 은 정책 취지 반영) */
const POLICIES: { code: string; description: string }[] = [
  {
    code: "STATE_BACK_NAV_CONFIRM",
    description:
      "문서 편집 중 저장하지 않고 뒤로 가기나 이탈을 시도할 경우, 변경 사항 유실에 대한 경고 컨펌창을 반드시 노출합니다. 모달이나 미리보기 창의 경우 배경 클릭 시 닫기 처리를 원칙으로 합니다.",
  },
  {
    code: "ACC_CONTRAST_RATIO",
    description:
      "모든 텍스트와 배경은 WCAG AA 기준(일반 텍스트 4.5:1, 큰 텍스트 3:1) 이상의 명도 대비를 확보합니다.",
  },
  {
    code: "legal-marketing",
    description:
      "마케팅 정보 수신은 명시적 옵트인을 받으며, 수신 동의·철회 이력을 보관합니다.",
  },
  {
    code: "AUTH_LEADER_ACCESS",
    description:
      "팀 리더는 소속 팀원의 문서와 실적을 조회할 수 있으나 조직 전체 설정은 변경할 수 없습니다.",
  },
  {
    code: "VAL_DOC_CALCULATION",
    description:
      "문서 내 금액은 수량 × 단가 합계와 부가세를 서버에서 재계산해 검증하며, 클라이언트 계산값을 신뢰하지 않습니다.",
  },
  {
    code: "AUTH_OAUTH_INTEGRATION",
    description:
      "Gmail·Outlook 연동은 OAuth 2.0 을 사용하며, 토큰은 암호화 저장하고 최소 권한 스코프만 요청합니다.",
  },
  {
    code: "VAL_CATALOG_EXCEL_UPLOAD",
    description:
      "카탈로그 엑셀 업로드는 지정 템플릿 형식만 허용하며, 행 단위 검증 후 오류 행을 리포트합니다.",
  },
  {
    code: "legal-terms",
    description:
      "서비스 이용약관 동의는 회원가입 시 필수이며, 개정 시 사전 고지 후 재동의를 받습니다.",
  },
  {
    code: "AUTH_SALES_REP_ACCESS",
    description: "영업 담당자는 본인이 생성한 문서에만 접근·수정할 수 있습니다.",
  },
  {
    code: "legal-refund",
    description:
      "유료 크레딧 환불은 관련 법령과 환불 정책에 따라 미사용분을 기준으로 처리합니다.",
  },
  {
    code: "STATE_EMPTY_DASHBOARD",
    description:
      "대시보드에 표시할 데이터가 없을 경우, 첫 문서 생성으로 유도하는 빈 상태 화면을 노출합니다.",
  },
  {
    code: "FORM_PERCENTAGE",
    description:
      "할인율·부가세율 등 백분율 입력은 0~100 범위로 제한하고 소수점 둘째 자리까지 허용합니다.",
  },
  {
    code: "legal-accessibility",
    description:
      "서비스는 웹 접근성 지침(KWCAG·WCAG)을 준수하며 접근성 안내 페이지를 제공합니다.",
  },
  {
    code: "STATE_SESSION_RECOVERY",
    description:
      "세션 만료·비정상 종료 시 작성 중이던 내용을 임시 저장본으로 복구할 수 있도록 안내합니다.",
  },
  {
    code: "FORM_DATE_TIME",
    description:
      "날짜·시간은 사용자 로컬 타임존 기준으로 표시하고 저장은 UTC(ISO 8601)로 통일합니다.",
  },
  {
    code: "VAL_EMAIL_RECIPIENT",
    description:
      "수신자 이메일은 형식 검증을 거치며, 세미콜론(;)으로 다중 입력을 지원합니다.",
  },
  {
    code: "FORM_CURRENCY_KRW",
    description:
      "금액은 원(KRW) 단위 정수로 저장하고, 천 단위 구분 기호와 '₩' 기호로 표시합니다.",
  },
  {
    code: "COPY-TONE",
    description:
      "UI 문구는 정중하고 간결한 존댓말을 사용하며 전문 용어는 최소화합니다.",
  },
  {
    code: "ACC_TOUCH_TARGET",
    description:
      "터치 대상은 최소 44×44px 이상을 확보하여 모바일 조작성을 보장합니다.",
  },
  {
    code: "legal-privacy",
    description:
      "개인정보는 개인정보처리방침에 따라 수집·이용하며 목적 달성 후 지체 없이 파기합니다.",
  },
  {
    code: "STATE_OFFLINE_GUIDANCE",
    description:
      "네트워크 오프라인 상태에서는 전용 안내 화면과 재시도 동작을 제공합니다.",
  },
  {
    code: "AUTH_ADMIN_ACCESS",
    description:
      "관리자는 조직 설정·팀원·카탈로그·과금 등 관리 기능 전체에 접근할 수 있습니다.",
  },
  {
    code: "legal-deletion-kr",
    description:
      "이용자는 계정·데이터 삭제를 요청할 수 있으며, 국내 법령에 따라 처리 후 결과를 통지합니다.",
  },
  {
    code: "AUTH_SHARED_ROLE_ROUTING",
    description:
      "로그인 후 역할(영업·리더·관리자)에 따라 진입 화면과 접근 가능한 라우트를 분기합니다.",
  },
];

/**
 * 데모 영업 담당자(김레인)의 기본 메일 서명 (HTML).
 * 지란지교 표준 서명 마크업을 기반으로 하며, 이름만 데모 담당자로 바꿨다.
 * 저장 위치: User.signature — 발송 화면에서 iframe 미리보기로 렌더된다.
 */
const REP_SIGNATURE_HTML = `<table role="presentation" cellpadding="0" cellspacing="0" border="0" style="border-collapse:collapse; width:100%; mso-table-lspace:0pt; mso-table-rspace:0pt;">
  <tr>
    <td style="padding:0; margin:0;">
      <!-- Wrapper (고정 폭: 650px / 가운데 정렬) -->
      <table role="presentation" cellpadding="0" cellspacing="0" border="0" align="left" style="border-collapse:collapse; width:650px; max-width:650px; mso-table-lspace:0pt; mso-table-rspace:0pt;">
        <!-- Body -->
        <tr>
          <td
          bgcolor="#F5F5F5"
          style="background-color:#F5F5F5; padding:30px 20px 30px 20px; letter-spacing:-0.2px;">
            <!-- Main 2-column table -->
            <table role="presentation" cellpadding="0" cellspacing="0" border="0" bgcolor="#F5F5F5" style="background-color:#F5F5F5; border-collapse:collapse; width:610px; mso-table-lspace:0pt; mso-table-rspace:0pt;">
              <tr>
                <!-- Left: Name / Team -->
                <td valign="top" bgcolor="#F5F5F5" style="padding:0 5px 0 0; width:210px; background-color:#F5F5F5;" >
                  <table role="presentation" cellpadding="0" cellspacing="0" border="0" style="border-collapse:collapse; mso-table-lspace:0pt; mso-table-rspace:0pt;">
                    <tr>
                      <td bgcolor="#F5F5F5" style="background-color:#F5F5F5; padding:0; margin:0; font-family:Malgun Gothic, Apple SD Gothic Neo, 'Noto Sans KR', Arial, sans-serif; color:#111111;">
                        <div style="font-size:22px; line-height:30px; font-weight:700; letter-spacing:-0.5px;">
                          김레인 <span style="font-weight:400; color:#555555; font-size:16px;">Rain Kim</span>
                        </div>
                        <div style="margin-top:6px; font-size:14px; letter-spacing:-0.7px; line-height:20px; color:#555555; font-weight:700;">
                          브랜드경영실 전략홍보팀 <span style="color:#999999; font-weight:400;">|</span> 과장
                        </div>
                      </td>
                    </tr>

                    <!-- Spacer -->
                    <tr>
                      <td bgcolor="#F5F5F5" style="background-color:#F5F5F5; height:10px; line-height:10px; font-size:0;">&nbsp;</td>
                    </tr>

                    <!-- Company logo + social icons -->
                    <tr>
                      <td bgcolor="#F5F5F5" style="background-color:#F5F5F5; padding:0; margin:0;">
                        <table role="presentation" cellpadding="0" cellspacing="0" border="0" style="border-collapse:collapse;">
                          <tr>
                            <td bgcolor="#F5F5F5"  valign="middle" style="padding:0 20px 0 0; background-color: #F5F5F5;">
                              <a href="https://www.jiransoft.co.kr/" target="_blank" style="text-decoration:none; border:0;">
                                <img
                                  src="https://design.jirandata.co.kr/mail/2026/ci.png"
                                  width="110"
                                  height="16"
                                  alt="지란지교소프트"
                                  style="display:block; width:110px; height:16px; border:0; outline:none; -ms-interpolation-mode:bicubic;"
                                />
                              </a>
                            </td>

                            <!-- Social icons (각각 24x24 권장) -->
                            <td bgcolor="#F5F5F5" valign="middle" style="padding:0 6px 0 0; background-color:#F5F5F5;">
                              <a href="https://www.facebook.com/jiransoft/" target="_blank" style="text-decoration:none; border:0;">
                                <img src="https://design.jirandata.co.kr/mail/2026/sns-facebook.png" width="24" height="24" alt="Facebook" style="display:block; border:0; outline:none; -ms-interpolation-mode:bicubic;" />
                              </a>
                            </td>
                            <td bgcolor="#F5F5F5" valign="middle" style="padding:0 6px 0 0; background-color:#F5F5F5;">
                              <a href="https://www.instagram.com/jiransoft/" target="_blank" style="text-decoration:none; border:0;">
                                <img src="https://design.jirandata.co.kr/mail/2026/sns-insta.png" width="24" height="24" alt="Instagram" style="display:block; border:0; outline:none; -ms-interpolation-mode:bicubic;" />
                              </a>
                            </td>
                            <td bgcolor="#F5F5F5" valign="middle" style="padding:0; background-color:#F5F5F5;">
                              <a href="https://blog.jiran.com/" target="_blank" style="text-decoration:none; border:0;">
                                <img src="https://design.jirandata.co.kr/mail/2026/sns-blog.png" width="24" height="24" alt="Blog" style="display:block; border:0; outline:none; -ms-interpolation-mode:bicubic;" />
                              </a>
                            </td>
                          </tr>
                        </table>
                      </td>
                    </tr>
                  </table>
                </td>

                <!-- Right: Contact -->
                <td valign="top" bgcolor="#F5F5F5" style="padding:0 0 0 10px; width:320px; border-left:1px solid #E6E6E6; background-color:#F5F5F5;">
                  <table role="presentation" cellpadding="0" cellspacing="0" border="0" style="border-collapse:collapse; width:100%; mso-table-lspace:0pt; mso-table-rspace:0pt;">
                    <!-- Phone (mobile) -->
                    <tr>
                      <td bgcolor="#F5F5F5" valign="top" style="padding:2px 0; background-color:#F5F5F5;">
                        <table role="presentation" cellpadding="0" cellspacing="0" border="0" style="border-collapse:collapse;">
                          <tr>
                            <td bgcolor="#F5F5F5" valign="middle" style="padding:0 10px 0 0; background-color:#F5F5F5;">
                              <img src="https://design.jirandata.co.kr/mail/2026/icon-mobile.png" width="15" height="15" alt="" style="display:block; border:0; outline:none; -ms-interpolation-mode:bicubic;" />
                            </td>
                            <td bgcolor="#F5F5F5" valign="middle" style="background-color:#F5F5F5; font-family:Arial, Helvetica sans-serif; font-size:14px; line-height:25px; color:#111111; font-weight:400; letter-spacing: 0;">
                              010-1234-5678
                            </td>
                          </tr>
                        </table>
                      </td>
                    </tr>

                    <!-- Email -->
                    <tr>
                      <td bgcolor="#F5F5F5" valign="top" style="padding:2px 0; background-color:#F5F5F5;">
                        <table role="presentation" cellpadding="0" cellspacing="0" border="0" style="border-collapse:collapse;">
                          <tr>
                            <td bgcolor="#F5F5F5" valign="middle" style="padding:0 10px 0 0; background-color:#F5F5F5;">
                              <img src="https://design.jirandata.co.kr/mail/2026/icon-email.png" width="15" height="15" alt="" style="display:block; border:0; outline:none; -ms-interpolation-mode:bicubic;" />
                            </td>
                            <td bgcolor="#F5F5F5" valign="middle" style="background-color:#F5F5F5; font-family:Arial, Helvetica sans-serif; font-size:14px; line-height:25px; color:#111111; font-weight:400; letter-spacing: 0;">
                              rain.kim@rainmaker.ai
                            </td>
                          </tr>
                        </table>
                      </td>
                    </tr>

                    <!-- Address -->
                    <tr>
                      <td bgcolor="#F5F5F5" style="padding:8px 0 0 0; font-family:Malgun Gothic, Apple SD Gothic Neo, 'Noto Sans KR', Arial, sans-serif; font-size:10px; letter-spacing:-0.5px; line-height:16px; color:#777777; background-color:#F5F5F5;">
                        34016 대전광역시 유성구 테크노3로 65 (관평동) 한신S메카 603호
                      </td>
                    </tr>
                  </table>
                </td>
              </tr>
            </table>
          </td>
        </tr>

        <!-- Bottom spacing -->
        <tr>
          <td style="padding:0; margin:0; height:8px; line-height:8px; font-size:0;">
            &nbsp;
          </td>
        </tr>

      </table>
    </td>
  </tr>
</table>`;

/**
 * 공용 표준 양식(견적서/계약서)의 공급자(우리 회사) 정보.
 * 상호·대표·등록번호·주소는 조직 공통이라 표준 양식에 그대로 채우고,
 * 전화·이메일은 발신 담당자별로 달라지므로 개인 문서 버전에서만 채운다.
 */
const SUPPLIER = {
  상호: "(주)지란지교소프트",
  대표자: "박승애",
  등록번호: "111-11-11111",
  주소: "대전광역시 유성구 테크노중앙로 74, 201호 (관평동, 신영빌딩)",
} as const;

/** 지란지교 BI(로고) 이미지 — 표준 양식 상단 로고 블록에 사용 */
const SUPPLIER_LOGO = "https://design.jirandata.co.kr/mail/2026/ci.png";

/**
 * 견적서 표준 양식 하단 약관/안내 (일반화한 데모 문구).
 * 제품명·실제 연락처·특정 OS 버전 등 특화·민감 정보는 데모용으로 다듬었다.
 */
const QUOTE_NOTES: { heading: string; lines: string[] }[] = [
  {
    heading: "기타사항",
    lines: [
      "- 추가 구매는 1라이선스 단위로 가능합니다.",
      "- 도입 시 통합 관리 콘솔(자산·정책 관리) 기능이 함께 제공됩니다.",
      "- 무상 제공 항목은 고객 요청 시 별도 안내드립니다.",
      "- 관리자 교육은 2시간 내외로 진행됩니다.",
      "- 지원 운영체제: Windows 10/11, macOS 최신 2개 버전",
    ],
  },
  {
    heading: "기술지원 안내",
    lines: [
      "- 1차: 기본 문의는 고객지원팀에서 유선·이메일로 지원합니다. (평일 09:00~18:00)",
      "- 2차: 미해결 사안은 기술지원팀으로 이관, 원격지원으로 원인 파악·해결 (고객사 협조 필요)",
      "- 3차: 원격지원으로 해결이 어려운 경우 엔지니어 현장 지원",
    ],
  },
  {
    heading: "특이사항",
    lines: ["- 프로젝트별 협의 사항을 이곳에 기재합니다."],
  },
];

/**
 * 블록 캔버스 표준 양식 문서(contentJson) 생성.
 * - seedTemplate 로 기본 레이아웃(로고·제목·공급자·거래처·품목표·안내)을 만들고,
 * - 공급자 블록에 회사 정보를 채운다. contact 가 주어지면 전화·이메일도 채운다
 *   (개인 문서: 발신 담당자 정보 반영 / 공용 표준 양식: 비워 둠).
 */
function buildStandardForm(input: {
  type: "QUOTE" | "CONTRACT";
  clientName: string | null;
  items: {
    name: string;
    description: string | null;
    quantity: number;
    unitPrice: number;
  }[];
  contact?: { phone: string; email: string };
}): string {
  const doc = seedTemplate({
    type: input.type,
    clientName: input.clientName,
    supplierName: SUPPLIER.상호,
    logoUrl: SUPPLIER_LOGO,
    items: input.items,
    // 견적서 양식에만 하단 약관/안내 섹션을 붙인다 (계약서는 계약 문구 유지)
    notes: input.type === "QUOTE" ? QUOTE_NOTES : undefined,
  });

  const supplier = doc.blocks.find((b) => b.type === "supplier");
  if (supplier) {
    const props = supplier.props as BlockPropsMap["supplier"];
    const values: Record<string, string> = {
      상호: SUPPLIER.상호,
      대표자: SUPPLIER.대표자,
      등록번호: SUPPLIER.등록번호,
      주소: SUPPLIER.주소,
      전화: input.contact?.phone ?? "",
      이메일: input.contact?.email ?? "",
    };
    props.fields = props.fields.map((f) => ({
      ...f,
      value: values[f.label] ?? f.value,
    }));
  }

  // 계약서는 견적 안내 문구 대신 계약 표준 양식 안내로 교체한다.
  if (input.type === "CONTRACT") {
    const notice = doc.blocks.find((b) => b.type === "text");
    if (notice) {
      (notice.props as BlockPropsMap["text"]).text =
        "※ 본 문서는 표준 계약서 양식입니다. 세부 조항은 협의에 따라 조정됩니다.";
    }
  }

  return JSON.stringify(doc);
}

/** 표준 양식 품목 합계(수량×단가) — Document.amount 컬럼 동기화용 */
function itemsTotal(
  items: { quantity: number; unitPrice: number }[],
): number {
  return calcItemTableTotal(
    items.map((it) => ({
      id: "",
      name: "",
      description: "",
      quantity: it.quantity,
      unitPrice: it.unitPrice,
    })),
  );
}

async function main() {
  console.log("🌱 seeding 시작...");

  // 1) 초기화 (FK 역순 삭제)
  await prisma.emailLog.deleteMany();
  await prisma.generationRequest.deleteMany();
  await prisma.documentItem.deleteMany();
  await prisma.document.deleteMany();
  await prisma.activityLog.deleteMany();
  await prisma.opportunity.deleteMany();
  await prisma.account.deleteMany();
  // TemplateVariable 은 Template 삭제 시 Cascade 로 함께 지워진다
  await prisma.template.deleteMany();
  await prisma.emailTemplate.deleteMany();
  await prisma.folder.deleteMany();
  await prisma.emailAccount.deleteMany();
  await prisma.teamMailDomain.deleteMany();
  await prisma.catalogItem.deleteMany();
  await prisma.creditTransaction.deleteMany();
  await prisma.creditWallet.deleteMany();
  await prisma.invite.deleteMany();
  await prisma.branding.deleteMany();
  await prisma.user.deleteMany();
  await prisma.organization.deleteMany();
  await prisma.policy.deleteMany();

  // 2) 조직
  const org = await prisma.organization.create({
    data: { name: "RAINMAKER Demo", slug: "rainmaker-demo" },
  });

  // 3) 브랜딩 — 데모 테넌트(우리 회사)는 지란지교소프트.
  //    companyName·logoUrl 은 contentJson 이 없는 문서(예: AI 생성 초안)의
  //    공급자 기본값으로도 쓰이므로, 표준 양식과 동일한 회사 정보로 통일한다.
  //    (사이드바의 "RAINMAKER" 는 제품 브랜드로 별도 하드코딩되어 영향 없음)
  await prisma.branding.create({
    data: {
      orgId: org.id,
      companyName: SUPPLIER.상호,
      logoUrl: SUPPLIER_LOGO,
      primaryColor: "#4F46E5",
    },
  });

  // 4) 사용자
  await prisma.user.create({
    data: {
      orgId: org.id,
      email: "admin@rainmaker.ai",
      name: "김관리",
      role: "ADMIN",
    },
  });
  const leader = await prisma.user.create({
    data: {
      orgId: org.id,
      email: "leader@rainmaker.ai",
      name: "박리더",
      role: "LEADER",
    },
  });
  const rep = await prisma.user.create({
    data: {
      orgId: org.id,
      email: "rain.kim@rainmaker.ai",
      name: "김레인",
      role: "SALES_REP",
      signature: REP_SIGNATURE_HTML,
    },
  });

  // 5) 크레딧 지갑 + 거래 내역 (기획서: 150 Credits)
  await prisma.creditWallet.create({
    data: { orgId: org.id, balance: 150 },
  });
  await prisma.creditTransaction.createMany({
    data: [
      {
        orgId: org.id,
        amount: 200,
        type: "CHARGE",
        reason: "초기 프로모션 크레딧 지급",
      },
      {
        orgId: org.id,
        amount: -10,
        type: "USAGE",
        reason: "AI 견적서 생성 (에이비씨 테크놀로지)",
      },
      {
        orgId: org.id,
        amount: -10,
        type: "USAGE",
        reason: "AI 계약서 생성 (글로벌 커머스)",
      },
      {
        orgId: org.id,
        amount: -30,
        type: "USAGE",
        reason: "AI 문서 생성 5건",
      },
    ],
  });

  // 6) 카탈로그(마스터 데이터)
  await prisma.catalogItem.createMany({
    data: [
      {
        orgId: org.id,
        category: "인프라",
        name: "클라우드 서버 인스턴스 (Standard)",
        sku: "INF-STD",
        unit: "대/월",
        unitPrice: 150_000,
        description: "vCPU 2 / RAM 4GB 표준 인스턴스",
      },
      {
        orgId: org.id,
        category: "인프라",
        name: "클라우드 서버 인스턴스 (High-CPU)",
        sku: "INF-HCPU",
        unit: "대/월",
        unitPrice: 300_000,
        description: "vCPU 8 / RAM 16GB 고성능 인스턴스",
      },
      {
        orgId: org.id,
        category: "인프라",
        name: "블록 스토리지 100GB",
        sku: "INF-STG",
        unit: "GB/월",
        unitPrice: 200,
      },
      {
        orgId: org.id,
        category: "서비스",
        name: "시스템 구축 및 셋업",
        sku: "SVC-SETUP",
        unit: "식",
        unitPrice: 15_000_000,
      },
      {
        orgId: org.id,
        category: "서비스",
        name: "아키텍처 컨설팅",
        sku: "SVC-CONSULT",
        unit: "인/일",
        unitPrice: 800_000,
      },
      {
        orgId: org.id,
        category: "서비스",
        name: "연간 유지보수",
        sku: "SVC-MAINT",
        unit: "년",
        unitPrice: 7_000_000,
      },
      {
        orgId: org.id,
        category: "라이선스",
        name: "모니터링 SW 라이선스",
        sku: "LIC-MON",
        unit: "연",
        unitPrice: 2_400_000,
      },
    ],
  });

  // 7) 메일 연동 계정 (기획서: sales-pro@gmail.com 연결됨·기본)
  await prisma.emailAccount.create({
    data: {
      userId: rep.id,
      provider: "GMAIL",
      email: "sales-pro@gmail.com",
      isDefault: true,
      status: "CONNECTED",
    },
  });

  // 7-0) 팀 발신 메일 도메인 (관리자 콘솔에서 관리)
  //  · rainmaker.ai 를 인증·기본 도메인으로 등록 → 담당자가 발신 주소로 선택 가능
  //  · 데모 담당자(김레인)의 발신 신원을 이 팀 도메인으로 지정해, 발송 화면 진입 시
  //    관리자가 정한 기본 참조(CC)가 자동으로 채워진 상태를 바로 보여준다
  //  · defaultCc: 팀 도메인 발송 시 기본 참조(CC) — 영업팀(리더·담당자) 전원
  const teamDomain = await prisma.teamMailDomain.create({
    data: {
      orgId: org.id,
      domain: "rainmaker.ai",
      label: "회사 공식 도메인",
      status: "VERIFIED",
      isDefault: true,
      defaultCc: `${leader.email}; ${rep.email}`,
    },
  });
  // 담당자 발신 신원 = 팀 도메인 (발송 화면 진입 시 CC 가 자동으로 채워지도록)
  await prisma.user.update({
    where: { id: rep.id },
    data: { mailDomainId: teamDomain.id },
  });

  // 7-1) 메일 발송 템플릿 — 발송 화면에서 불러와 사용
  //  · 팀 공용(ownerId=null) 4건: 문서 4종(견적서·계약서·NDA·제안서)을 각각 커버
  //  · 개인(ownerId=rep) 3건: 팔로업·감사·리마인드 등 실무 시나리오
  //  · 제목/본문의 {{거래처}}·{{문서제목}}·{{문서종류}}·{{총액}} 은 발송 시 치환된다
  await prisma.emailTemplate.createMany({
    data: [
      // ── 팀 공용 ──
      {
        orgId: org.id,
        ownerId: null,
        // 담당자명({{담당자}}) 활용 데모 — 불러오면 발송 폼 담당자명이 자동으로 채워지고
        // 제목·본문의 {{담당자}} 가 그 값으로 실시간 치환된다.
        name: "담당자 맞춤 안내 (표준)",
        subject: "[{{문서종류}}] {{담당자}}님, {{문서제목}} 전달드립니다",
        recipientName: "김민수",
        body: "{{담당자}}님, 안녕하세요.\n\n요청주신 {{문서제목}} 건에 대한 {{문서종류}}를 첨부와 같이 전달드립니다. 총액은 {{총액}}(부가세 포함)입니다.\n\n{{담당자}}님께서 검토하시기 편하도록 핵심 내역을 문서 상단에 정리해두었습니다. 추가로 필요하신 자료가 있으시면 언제든 말씀해 주세요.\n\n감사합니다.",
      },
      {
        orgId: org.id,
        ownerId: null,
        name: "견적서 안내 (표준)",
        // 데모 9단계 핵심 템플릿 — {{거래처}}(문서에서 자동 치환)와 {{담당자}}(발송 폼 담당자명)를
        // 함께 써서, 불러오면 거래처는 즉시 치환되고 담당자명을 바꾸면 제목·본문에 실시간 반영된다.
        subject: "[{{문서종류}}] {{거래처}} {{담당자}}님께 드리는 {{문서제목}}",
        recipientName: "김민수",
        body: "{{거래처}} {{담당자}}님, 안녕하세요.\n\n요청주신 {{문서제목}} 건에 대한 {{문서종류}}를 첨부와 같이 보내드립니다. 총액은 {{총액}}(부가세 포함)이며, 상세 내역은 첨부 문서를 확인 부탁드립니다.\n\n견적 유효기간은 발행일로부터 30일입니다. 궁금하신 점이 있으시면 언제든 회신 주세요.\n\n감사합니다.",
      },
      {
        orgId: org.id,
        ownerId: null,
        name: "계약서 송부",
        subject: "[{{문서종류}}] {{거래처}} 계약 체결 관련 문서 송부",
        body: "안녕하세요, {{거래처}} 담당자님.\n\n협의된 내용을 반영한 {{문서제목}}({{문서종류}})를 송부드립니다. 계약 금액은 {{총액}}입니다.\n\n첨부된 계약서를 검토하신 후 이상이 없으시면 서명하여 회신 부탁드립니다. 수정이 필요한 부분이 있으면 편하게 말씀해 주세요.\n\n감사합니다.",
      },
      {
        orgId: org.id,
        ownerId: null,
        name: "NDA 체결 요청",
        subject: "[{{문서종류}}] {{거래처}}와의 비밀유지계약 체결 요청",
        body: "안녕하세요, {{거래처}} 담당자님.\n\n본격적인 논의에 앞서 양사 간 정보 보호를 위한 {{문서제목}}({{문서종류}})를 전달드립니다.\n\n내용 검토 후 서명본을 회신 주시면, 이어서 상세 자료를 공유드리겠습니다. 문의사항은 언제든 연락 주세요.\n\n감사합니다.",
      },
      {
        orgId: org.id,
        ownerId: null,
        name: "제안서 발송",
        subject: "[{{문서종류}}] {{거래처}}님을 위한 {{문서제목}}",
        body: "안녕하세요, {{거래처}} 담당자님.\n\n지난 미팅에서 논의한 내용을 바탕으로 {{문서제목}}({{문서종류}})를 준비했습니다. 제안 규모는 {{총액}}입니다.\n\n첨부 자료를 검토하신 후 편하신 시간에 짧게 논의 자리를 가지면 좋겠습니다. 가능하신 일정을 알려주시면 맞춰 준비하겠습니다.\n\n감사합니다.",
      },
      // ── 개인 (김레인) ──
      {
        orgId: org.id,
        ownerId: rep.id,
        name: "빠른 팔로업",
        subject: "Re: {{문서제목}} 관련 진행 상황 문의",
        body: "안녕하세요, {{거래처}}님.\n\n앞서 전달드린 {{문서제목}} 관련하여 검토는 잘 진행되고 계신지 확인차 연락드립니다. 추가로 필요하신 자료가 있으면 편하게 말씀해 주세요.\n\n감사합니다.",
      },
      {
        orgId: org.id,
        ownerId: rep.id,
        name: "미팅 후 감사",
        subject: "{{거래처}}님, 오늘 미팅 감사했습니다",
        // 기본 담당자명({{담당자}}) 데모 — 불러오면 발송 폼 담당자명이 자동으로 채워진다
        recipientName: "이서준",
        body: "안녕하세요, {{담당자}}님.\n\n오늘 귀한 시간 내어 미팅에 참여해 주셔서 감사합니다. 논의된 {{문서제목}} 관련 내용은 정리하여 별도로 전달드리겠습니다.\n\n추가 문의사항이 있으시면 언제든 연락 주세요. 감사합니다.",
      },
      {
        orgId: org.id,
        ownerId: rep.id,
        name: "미회신 리마인드",
        subject: "[리마인드] {{문서제목}} 회신 부탁드립니다",
        body: "안녕하세요, {{거래처}} 담당자님.\n\n지난번 보내드린 {{문서제목}}({{문서종류}}, 총액 {{총액}}) 관련하여 회신을 기다리고 있습니다. 검토에 참고가 필요하신 부분이 있으면 편하게 말씀해 주세요.\n\n확인 부탁드립니다. 감사합니다.",
      },
    ],
  });

  // 8) 문서 — 최근 7개월(2026-01 ~ 2026-07)에 걸쳐 우상향 실적 스토리로 분포
  // 8-1) 대표 견적서 — 라인 아이템 포함, 합계 24,500,000 (에디터/생성이력 데모용)
  const abcQuote = await prisma.document.create({
    data: {
      orgId: org.id,
      authorId: rep.id,
      title: "(주)에이비씨 테크놀로지 시스템 구축 견적서",
      type: "QUOTE",
      status: "DRAFT",
      clientName: "(주)에이비씨 테크놀로지",
      amount: 24_500_000,
      createdAt: new Date("2026-07-06T14:30:00+09:00"),
      items: {
        create: [
          {
            name: "시스템 구축 및 셋업",
            description: "요건 분석·설계·구축 일괄",
            quantity: 1,
            unitPrice: 15_000_000,
            amount: 15_000_000,
            sortOrder: 0,
          },
          {
            name: "클라우드 서버 인스턴스 (High-CPU)",
            description: "고성능 인스턴스 5대",
            quantity: 5,
            unitPrice: 500_000,
            amount: 2_500_000,
            sortOrder: 1,
          },
          {
            name: "연간 유지보수",
            description: "1년 유지보수 계약",
            quantity: 1,
            unitPrice: 7_000_000,
            amount: 7_000_000,
            sortOrder: 2,
          },
        ],
      },
    },
  });

  // 8-2) 대표 계약서 — 발송 이력 데모용
  const globalContract = await prisma.document.create({
    data: {
      orgId: org.id,
      authorId: rep.id,
      title: "글로벌 커머스 플랫폼 고도화 계약서",
      type: "CONTRACT",
      status: "SENT",
      clientName: "글로벌커머스(주)",
      amount: 112_000_000,
      createdAt: new Date("2026-06-20T09:15:00+09:00"),
    },
  });

  // 8-3) 나머지 문서 — 월별 분포·상태·종류·금액을 다양하게
  const A = rep.id;
  const L = leader.id;
  type DocSeed = [string, string, string, string | null, number, string, string];
  const docSeeds: DocSeed[] = [
    // [title, type, status, clientName, amount, date(KST), authorId]
    // 2025-10 (도입기 — 실적 규모가 작다)
    ["세종테크 그룹웨어 구축 견적서", "QUOTE", "COMPLETED", "세종테크", 16_000_000, "2025-10-10T10:00:00+09:00", A],
    ["한라정보 보안 컨설팅 제안서", "PROPOSAL", "SENT", "한라정보", 12_000_000, "2025-10-22T14:00:00+09:00", A],
    // 2025-11
    ["동방물류 WMS 도입 견적서", "QUOTE", "COMPLETED", "동방물류", 21_000_000, "2025-11-06T11:00:00+09:00", L],
    ["우리제약 문서보안 계약서", "CONTRACT", "COMPLETED", "우리제약", 28_000_000, "2025-11-18T13:00:00+09:00", A],
    ["대성엔지니어링 표준 비밀유지계약서(NDA)", "NDA", "SENT", "대성엔지니어링", 0, "2025-11-27T09:30:00+09:00", A],
    // 2025-12
    ["금호에너지 통합 모니터링 구축 견적서", "QUOTE", "COMPLETED", "금호에너지", 33_000_000, "2025-12-04T10:20:00+09:00", A],
    ["서한테크 클라우드 백업 계약서", "CONTRACT", "COMPLETED", "서한테크", 24_000_000, "2025-12-15T14:10:00+09:00", L],
    ["뉴런소프트 AI 문서화 제안서", "PROPOSAL", "SENT", "뉴런소프트", 26_000_000, "2025-12-23T16:00:00+09:00", A],
    // 2026-01
    ["한빛소프트 사내 시스템 구축 견적서", "QUOTE", "COMPLETED", "한빛소프트", 38_000_000, "2026-01-12T10:00:00+09:00", A],
    ["누리테크 표준 비밀유지계약서(NDA)", "NDA", "SENT", "누리테크", 0, "2026-01-20T11:00:00+09:00", A],
    // 2026-02
    ["그린에너지 데이터 플랫폼 구축 제안서", "PROPOSAL", "COMPLETED", "그린에너지", 52_000_000, "2026-02-05T13:00:00+09:00", L],
    ["대명물산 ERP 도입 견적서", "QUOTE", "SENT", "대명물산", 27_500_000, "2026-02-14T15:00:00+09:00", A],
    ["성진산업 유지보수 변경합의서", "CONTRACT", "DRAFT", "성진산업", 9_600_000, "2026-02-22T09:30:00+09:00", A],
    // 2026-03
    ["동양네트웍스 통합 구축 계약서", "CONTRACT", "COMPLETED", "동양네트웍스", 88_000_000, "2026-03-04T10:20:00+09:00", A],
    ["미래바이오 연구 인프라 견적서", "QUOTE", "COMPLETED", "미래바이오", 41_000_000, "2026-03-15T14:10:00+09:00", L],
    ["코스모스랩 AI 도입 제안서", "PROPOSAL", "SENT", "코스모스랩", 33_000_000, "2026-03-27T16:40:00+09:00", A],
    // 2026-04
    ["삼정테크 클라우드 이전 견적서", "QUOTE", "COMPLETED", "삼정테크", 46_500_000, "2026-04-03T11:00:00+09:00", A],
    ["한결로지스 물류시스템 구축 계약서", "CONTRACT", "COMPLETED", "한결로지스", 120_000_000, "2026-04-12T13:30:00+09:00", L],
    ["블루오션 표준 비밀유지계약서(NDA)", "NDA", "SENT", "블루오션", 0, "2026-04-19T09:15:00+09:00", A],
    ["정우엔지니어링 설비 견적서", "QUOTE", "DRAFT", "정우엔지니어링", 18_700_000, "2026-04-28T15:50:00+09:00", A],
    // 2026-05
    ["케이팜 스마트팜 구축 제안서", "PROPOSAL", "COMPLETED", "케이팜", 64_000_000, "2026-05-06T10:40:00+09:00", L],
    ["대한제약 품질관리 시스템 견적서", "QUOTE", "COMPLETED", "대한제약", 55_000_000, "2026-05-13T14:00:00+09:00", A],
    ["우성모바일 앱 고도화 계약서", "CONTRACT", "SENT", "우성모바일", 72_000_000, "2026-05-20T11:20:00+09:00", A],
    ["신영정보 보안 솔루션 견적서", "QUOTE", "SENT", "신영정보", 29_900_000, "2026-05-25T16:00:00+09:00", L],
    ["이룸소프트 비밀유지계약서 초안", "NDA", "DRAFT", "이룸소프트", 0, "2026-05-30T09:00:00+09:00", A],
    // 2026-06
    ["제일건설 스마트빌딩 구축 견적서", "QUOTE", "COMPLETED", "제일건설", 97_000_000, "2026-06-03T10:10:00+09:00", L],
    ["한울전자 부품 공급 계약서", "CONTRACT", "COMPLETED", "한울전자", 134_000_000, "2026-06-10T13:00:00+09:00", A],
    ["넥스트게임즈 플랫폼 구축 제안서", "PROPOSAL", "COMPLETED", "넥스트게임즈", 58_000_000, "2026-06-16T15:30:00+09:00", A],
    ["세아상역 물류 자동화 견적서", "QUOTE", "SENT", "세아상역", 42_000_000, "2026-06-24T11:40:00+09:00", L],
    ["오렌지헬스 헬스케어 제안서 초안", "PROPOSAL", "DRAFT", "오렌지헬스", 31_000_000, "2026-06-28T09:20:00+09:00", A],
    // 2026-07 (데모 기준일 직전)
    ["가온소프트 SaaS 전환 계약서", "CONTRACT", "COMPLETED", "가온소프트", 76_000_000, "2026-07-02T10:00:00+09:00", A],
    ["다올테크 인프라 증설 견적서", "QUOTE", "SENT", "다올테크", 48_000_000, "2026-07-08T14:30:00+09:00", L],
    // 폐기(VOID) 예시 — 대시보드·통계 집계에서 제외되고 라이브러리 "폐기" 탭에서만 노출
    ["구버전 요율 반영 견적서(폐기)", "QUOTE", "VOID", "올드라인상사", 12_000_000, "2026-05-10T09:00:00+09:00", A],
  ];

  await prisma.document.createMany({
    data: docSeeds.map(([title, type, status, clientName, amount, date, authorId]) => ({
      orgId: org.id,
      authorId,
      title,
      type,
      status,
      clientName,
      amount,
      createdAt: new Date(date),
    })),
  });

  // 8-4) 보관함 폴더 (다단계) — 문서함은 하나뿐이라 팀/개인 파티션을 두지 않는다.
  //      Folder.isCommon 컬럼은 스키마에 남아 있지만 기본값(false)으로만 쓴다.
  const folderClients = await prisma.folder.create({
    data: { orgId: org.id, name: "주요 거래처", sortOrder: 0 },
  });
  // 하위 폴더 예시 (주요 거래처 > 글로벌커머스(주))
  const folderClientsGlobal = await prisma.folder.create({
    data: {
      orgId: org.id,
      name: "글로벌커머스(주)",
      parentId: folderClients.id,
      sortOrder: 0,
    },
  });
  const folderProposals = await prisma.folder.create({
    data: { orgId: org.id, name: "제안서", sortOrder: 1 },
  });
  await prisma.folder.create({
    data: { orgId: org.id, name: "진행 중", sortOrder: 2 },
  });
  // "표준 양식" 폴더는 하나다 — 문서함을 합치기 전에는 내/공용에 같은 이름이 하나씩
  // 있었는데, 한 트리에 나란히 두면 어느 쪽이 어느 쪽인지 구분할 방법이 없다.
  const folderStandard = await prisma.folder.create({
    data: { orgId: org.id, name: "표준 양식", sortOrder: 3 },
  });
  const folderMyStandard = folderStandard;
  const folderCommonContracts = await prisma.folder.create({
    data: { orgId: org.id, name: "공통 계약 문서", sortOrder: 4 },
  });

  // 8-5) 공통 계약 문서(NDA·합의서)를 해당 폴더로 모은다
  await prisma.document.updateMany({
    where: {
      orgId: org.id,
      title: {
        in: [
          "누리테크 표준 비밀유지계약서(NDA)",
          "블루오션 표준 비밀유지계약서(NDA)",
          "성진산업 유지보수 변경합의서",
        ],
      },
    },
    data: { folderId: folderCommonContracts.id },
  });

  // 8-6) 표준 양식(계약서·견적서 초안) — 공급자(우리 회사) 정보를 채운 블록 캔버스 문서
  //  · 공용 버전: 상호·대표·등록번호·주소만 채우고 전화·이메일은 담당자별로 비워 둔다
  //  · 개인 버전: 발신 담당자(김레인)의 전화·이메일까지 채워 "이미 템플릿화된" 상태로 시딩
  const repContact = { phone: "010-1234-5678", email: rep.email };
  const quoteItems = [
    {
      name: "메일보안 솔루션(스팸·스미싱 차단) 구축",
      description: "요건 분석·설치·정책 설정 일괄",
      quantity: 1,
      unitPrice: 18_000_000,
    },
    {
      name: "문서중앙화 라이선스",
      description: "사용자 50인 기준",
      quantity: 50,
      unitPrice: 120_000,
    },
    {
      name: "연간 기술지원",
      description: "1년 정기 점검·업데이트",
      quantity: 1,
      unitPrice: 4_800_000,
    },
  ];
  const contractItems = [
    {
      name: "정보보안 솔루션 공급 및 구축",
      description: "계약 범위 내 일괄 공급·구축",
      quantity: 1,
      unitPrice: 45_000_000,
    },
    {
      name: "연간 유지보수 (SLA 포함)",
      description: "1년, 장애 대응 포함",
      quantity: 1,
      unitPrice: 9_000_000,
    },
  ];

  // 클라우드 장기 이용 품목
  const cloudItems = [
    {
      name: "클라우드 인프라 이용료",
      description: "월 정액 · 12개월",
      quantity: 12,
      unitPrice: 3_200_000,
    },
    {
      name: "매니지드 운영 서비스",
      description: "연간 · 24/7 모니터링",
      quantity: 1,
      unitPrice: 18_000_000,
    },
    {
      name: "초기 마이그레이션",
      description: "데이터 이관·검증 일괄",
      quantity: 1,
      unitPrice: 8_000_000,
    },
  ];
  // 구축형 프로젝트 품목
  const buildItems = [
    {
      name: "구축형 솔루션 라이선스",
      description: "영구 라이선스 (사이트)",
      quantity: 1,
      unitPrice: 60_000_000,
    },
    {
      name: "설치·커스터마이징",
      description: "요건 분석·개발·검수 일괄",
      quantity: 1,
      unitPrice: 25_000_000,
    },
    {
      name: "사용자 교육·인수인계",
      description: "관리자·실무자 과정",
      quantity: 1,
      unitPrice: 3_000_000,
    },
  ];
  // 구축형 유지보수 품목
  const maintenanceItems = [
    {
      name: "연간 유지보수 (SLA)",
      description: "1년 · 장애 대응 포함",
      quantity: 1,
      unitPrice: 9_000_000,
    },
    {
      name: "정기 점검",
      description: "분기 1회 · 연 4회",
      quantity: 4,
      unitPrice: 1_200_000,
    },
    {
      name: "긴급 장애 대응",
      description: "연간 · 우선 대응",
      quantity: 1,
      unitPrice: 3_600_000,
    },
  ];

  // 조직 공통 표준 양식 4종 (전화·이메일 비움 — 조직 공통 정보만) — 내 문서함 › 표준 양식
  //  데모 시나리오 1("양식화")의 산출물로 보여지는 표준 양식 세트.
  //  "기본 견적서"는 생성 데모에서 열리고, 두 번째 생성의 참고 양식으로도 쓰인다.
  const standardForms = [
    {
      title: "기본 견적서",
      type: "QUOTE" as const,
      items: quoteItems,
      createdAt: "2026-01-02T09:00:00+09:00",
    },
    {
      title: "클라우드 장기 견적·계약서",
      type: "QUOTE" as const,
      items: cloudItems,
      createdAt: "2026-01-02T09:05:00+09:00",
    },
    {
      title: "구축형 견적·계약서",
      type: "QUOTE" as const,
      items: buildItems,
      createdAt: "2026-01-02T09:10:00+09:00",
    },
    {
      title: "구축형 유지보수 견적·계약서",
      type: "CONTRACT" as const,
      items: maintenanceItems,
      createdAt: "2026-01-02T09:15:00+09:00",
    },
  ];
  for (const f of standardForms) {
    await prisma.document.create({
      data: {
        orgId: org.id,
        authorId: rep.id,
        title: f.title,
        type: f.type,
        status: "DRAFT",
        clientName: null,
        amount: itemsTotal(f.items),
        // 표준 양식은 상시 비치 문서 → 오래된 날짜로 대시보드 "최근 문서" 왜곡 방지
        createdAt: new Date(f.createdAt),
        folderId: folderStandard.id,
        contentJson: buildStandardForm({
          type: f.type,
          clientName: null,
          items: f.items,
        }),
      },
    });
  }

  // 8-6-1) 표준 양식(Template) — PRD 4.2.1 의 "표준 양식" 엔티티
  //  같은 양식 본문을 Template 으로도 등록해, AI 문서 생성 화면에서 "양식 불러오기"(F-211)와
  //  변수 필드(F-204)를 API 키 없이도 바로 확인할 수 있게 한다.
  //  실제 운영 흐름은 /library/templates 에서 파일을 올려 AI 가 세팅하는 것이다(F-203).
  const quoteVariables = [
    { key: "고객사명", label: "고객사명", sample: "(주)글로벌커머스", required: true },
    { key: "수신자", label: "수신자", sample: "김레인 책임", required: false },
    { key: "견적일", label: "견적일", sample: "2026. 08. 07", required: false },
    { key: "유효기간", label: "유효기간", sample: "견적일로부터 1개월", required: false },
    { key: "품목", label: "품목", sample: "메일보안 솔루션 구축", required: true },
    { key: "수량", label: "수량", sample: "50", required: true },
    { key: "단가", label: "단가", sample: "120000", required: true },
  ];
  const contractVariables = [
    { key: "고객사명", label: "고객사명", sample: "(주)글로벌커머스", required: true },
    { key: "수신자", label: "수신자", sample: "김레인 책임", required: false },
    { key: "계약기간", label: "계약기간", sample: "2026. 09. 01 ~ 2027. 08. 31", required: true },
    { key: "계약금액", label: "계약금액", sample: "45000000", required: true },
    { key: "결제조건", label: "결제조건", sample: "납품 후 30일 이내", required: false },
  ];

  for (const f of standardForms) {
    const variables = f.type === "CONTRACT" ? contractVariables : quoteVariables;
    await prisma.template.create({
      data: {
        orgId: org.id,
        authorId: rep.id,
        name: f.title,
        type: f.type,
        scope: "COMMON",
        description: "팀 공용 표준 양식 — 문서 생성 시 값만 채워 씁니다.",
        prompt: "기존에 쓰던 양식을 팀 표준 양식으로 세팅",
        createdAt: new Date(f.createdAt),
        contentJson: buildStandardForm({
          type: f.type,
          clientName: null,
          items: f.items,
        }),
        variables: {
          create: variables.map((v, index) => ({ ...v, sortOrder: index })),
        },
      },
    });
  }

  // 개인 표준 양식 (내 발신 정보 반영 — 전화·이메일 채움)
  await prisma.document.create({
    data: {
      orgId: org.id,
      authorId: rep.id,
      title: "견적서 양식 (내 발신정보 반영)",
      type: "QUOTE",
      status: "DRAFT",
      clientName: null,
      amount: itemsTotal(quoteItems),
      createdAt: new Date("2026-01-02T09:20:00+09:00"),
      folderId: folderMyStandard.id,
      contentJson: buildStandardForm({
        type: "QUOTE",
        clientName: null,
        items: quoteItems,
        contact: repContact,
      }),
    },
  });
  await prisma.document.create({
    data: {
      orgId: org.id,
      authorId: rep.id,
      title: "계약서 양식 (내 발신정보 반영)",
      type: "CONTRACT",
      status: "DRAFT",
      clientName: null,
      amount: itemsTotal(contractItems),
      createdAt: new Date("2026-01-02T09:30:00+09:00"),
      folderId: folderMyStandard.id,
      contentJson: buildStandardForm({
        type: "CONTRACT",
        clientName: null,
        items: contractItems,
        contact: repContact,
      }),
    },
  });

  // 8-7) 폴더 배치 — 대표 계약서는 하위 폴더에 배치
  await prisma.document.update({
    where: { id: globalContract.id },
    data: { folderId: folderClientsGlobal.id },
  });
  await prisma.document.update({
    where: { id: abcQuote.id },
    data: { folderId: folderClients.id },
  });
  await prisma.document.updateMany({
    where: { orgId: org.id, type: "PROPOSAL", folderId: null },
    data: { folderId: folderProposals.id },
  });

  // 9) 발송 이력 (SENT 문서)
  await prisma.emailLog.create({
    data: {
      documentId: globalContract.id,
      senderId: rep.id,
      recipients: "purchasing@globalcommerce.co.kr; cto@globalcommerce.co.kr",
      subject: "[계약서] 글로벌 커머스 플랫폼 고도화 계약서 송부",
      body: "안녕하세요, Rainmaker를 통해 생성된 계약서를 전달드립니다. 검토 후 회신 부탁드립니다.",
      attachmentName: "2024_글로벌커머스_고도화계약서.pdf",
      status: "SENT",
      sentAt: new Date("2026-06-20T09:20:00+09:00"),
    },
  });

  // 10) AI 생성 요청 이력 (대표 견적서와 연결)
  await prisma.generationRequest.create({
    data: {
      userId: rep.id,
      prompt:
        "A사에 서버 인스턴스 5대와 유지보수 1년 포함한 견적서 작성해줘",
      status: "DONE",
      creditsUsed: 10,
      documentId: abcQuote.id,
      createdAt: new Date("2026-07-06T14:28:00+09:00"),
    },
  });

  // 10-1) 거래처(Account) — CRM 데모 데이터 (F-101 · 102 · 103)
  //   회사명을 기존 문서의 clientName 과 맞춰 두어, Phase 2 에서 기회·문서를 이 거래처에
  //   연결할 때 이름을 새로 만들지 않아도 되게 한다.
  //   사업자등록번호는 실재하지 않는 합성값이다.
  await prisma.account.createMany({
    data: [
      {
        orgId: org.id,
        companyName: "(주)에이비씨 테크놀로지",
        bizRegNo: "123-45-67890",
        memo: "그룹웨어 도입 검토 중. 견적 재발송 이력 있음(2026-07). 결재 라인은 팀장 → 본부장 2단계.",
      },
      {
        orgId: org.id,
        companyName: "글로벌커머스(주)",
        bizRegNo: "211-86-01234",
        memo: "통합 계약 체결 완료. 연간 유지보수 갱신 시점은 매년 4월.",
      },
      {
        orgId: org.id,
        companyName: "세종테크",
        bizRegNo: "305-81-45678",
        memo: null,
      },
      {
        orgId: org.id,
        companyName: "다올테크",
        bizRegNo: null,
        memo: "인프라 증설 견적 검토 중. 메일보다 전화 연락을 선호.",
      },
      {
        orgId: org.id,
        companyName: "Bluewave Systems Korea",
        bizRegNo: "412-88-90123",
        memo: "본사 승인 절차가 있어 계약까지 6주 이상 소요된다.",
      },
    ],
  });

  // 10-1-1) 거래처 담당자(Contact) — 거래처당 2~3명 (거래처-8)
  //   **배열의 맨 앞이 대표**다. 대표는 거래처당 한 명뿐이며 목록 화면에 노출되는 사람이고,
  //   나머지는 상세의 담당자 카드에서 본다. 실무처럼 결재선(현업 → 구매 → 임원)이 섞이도록
  //   담당자를 여러 명 두어야 "대표만 목록에 나온다"는 규칙이 화면에서 확인된다.
  //   연락처가 비어 있는 담당자도 섞어 둔다(선택 항목이라는 사실이 드러나야 한다).
  const accountIdByCompanyName = new Map(
    (
      await prisma.account.findMany({
        where: { orgId: org.id },
        select: { id: true, companyName: true },
      })
    ).map((account) => [account.companyName, account.id] as const),
  );

  const contactsByCompanyName: Record<
    string,
    Array<{
      name: string;
      position: string | null;
      phone: string | null;
      email: string | null;
    }>
  > = {
    "(주)에이비씨 테크놀로지": [
      {
        name: "이서준",
        position: "구매팀 과장",
        phone: "010-2345-6789",
        email: "seojun.lee@abctech.example.com",
      },
      {
        name: "오하늘",
        position: "정보시스템팀 대리",
        phone: "010-2345-1122",
        email: "haneul.oh@abctech.example.com",
      },
      {
        name: "강동원",
        position: "경영지원본부 본부장",
        phone: null,
        email: "dongwon.kang@abctech.example.com",
      },
    ],
    "글로벌커머스(주)": [
      {
        name: "박지훈",
        position: "IT기획팀 팀장",
        phone: "010-3456-7890",
        email: "jihoon.park@globalcommerce.example.com",
      },
      {
        name: "윤소라",
        position: "구매팀 사원",
        phone: "010-3456-4455",
        email: "sora.yoon@globalcommerce.example.com",
      },
    ],
    세종테크: [
      {
        name: "최유진",
        position: "정보보안팀 대리",
        phone: "010-4567-8901",
        email: "yujin.choi@sejongtech.example.com",
      },
      {
        name: "임재현",
        position: "정보보안팀 팀장",
        phone: "010-4567-3300",
        email: "jaehyun.lim@sejongtech.example.com",
      },
      {
        name: "서가온",
        position: "총무팀 주임",
        phone: "010-4567-7788",
        email: null,
      },
    ],
    다올테크: [
      {
        name: "정민석",
        position: "인프라팀 차장",
        phone: "010-5678-9012",
        email: null,
      },
      {
        name: "노지완",
        position: "구매팀 과장",
        phone: "010-5678-2244",
        email: "jiwan.noh@daoltech.example.com",
      },
    ],
    "Bluewave Systems Korea": [
      {
        name: "한그레이스",
        position: "Sales Director",
        phone: null,
        email: "grace.han@bluewave.example.com",
      },
      {
        name: "Daniel Cho",
        position: "Procurement Manager",
        phone: "010-6789-1234",
        email: "daniel.cho@bluewave.example.com",
      },
    ],
  };

  await prisma.contact.createMany({
    data: Object.entries(contactsByCompanyName).flatMap(
      ([companyName, people]) => {
        const accountId = accountIdByCompanyName.get(companyName);
        if (!accountId) return [];
        return people.map((person, index) => ({
          orgId: org.id,
          accountId,
          ...person,
          isPrimary: index === 0, // 맨 앞 한 명만 대표 (거래처당 1명 규칙)
        }));
      },
    ),
  });

  // 10-2) 영업 기회(Opportunity) + 활동 이력(ActivityLog) — 파이프라인 데모 (F-111 · F-114)
  //   단계가 INITIAL·PROPOSAL·NEGOTIATION·WON·LOST 로 고루 분포하도록 12건을 거래처 5곳에
  //   나눠 붙인다. 대시보드(F-401~406)·캘린더(F-301~306)가 의미 있는 그림을 그릴 수 있어야 한다.
  const accountIdByName = new Map(
    (
      await prisma.account.findMany({
        where: { orgId: org.id },
        select: { id: true, companyName: true },
      })
    ).map((account) => [account.companyName, account.id] as const),
  );

  const DAY_MS = 24 * 60 * 60 * 1000;
  const shiftDays = (base: Date, days: number) =>
    new Date(base.getTime() + days * DAY_MS);

  type SeedStage = "INITIAL" | "PROPOSAL" | "NEGOTIATION" | "WON" | "LOST";

  /**
   * 기회에 붙일 문서 (기회-5 · 기회-6).
   * **예상 금액은 여기서 온다** — 기회에 금액을 직접 적지 않고 확정 문서가 정한다.
   */
  type OpportunityDocumentSeed = {
    title: string;
    type: "QUOTE" | "CONTRACT" | "NDA" | "PROPOSAL";
    status: "DRAFT" | "SENT" | "COMPLETED" | "VOID";
    /** 총액 (KRW 정수) */
    amount: number;
    createdAt: string;
    /** 동순위 판정의 기준 — 비우면 createdAt 과 같다 */
    updatedAt?: string;
    /** 발송 이력을 함께 남길 때만 */
    sent?: { at: string; recipients: string };
  };

  type OpportunitySeed = {
    company: string;
    name: string;
    stage: SeedStage;
    /** 예상 마감일 — null 이면 미정 (목록에서 뒤로 정렬된다) */
    expectedCloseDate: string | null;
    ownerId: string;
    createdAt: string;
    /** WON·LOST 확정일 */
    actualCloseDate?: string;
    lostReason?: string;
    memo?: string;
    /** 이 기회에 붙는 문서. 비우면 확정 문서가 없어 예상 금액이 ₩0 이 된다 (기회-6 ④). */
    documents?: OpportunityDocumentSeed[];
    /** 자동 판정 대신 이 제목의 문서를 **수동 고정**한다 (기회-6 ③) */
    pinnedDocumentTitle?: string;
  };

  /*
   * 문서 배분 원칙 (기회-6) — 예상 금액이 확정 문서에서 오므로 문서 구성이 곧 파이프라인이다.
   *  - 12건 중 10건에 문서를 붙인다. 대부분의 기회에 근거 문서가 있어야 대시보드가 성립한다.
   *  - **2건은 일부러 비워 둔다** (2027 연간 유지보수 갱신 · 네트워크 이중화 검토) →
   *    `₩0 · 확정 문서 없음` 표시를 화면에서 바로 확인할 수 있다.
   *  - **1건은 수동 고정한다** (인프라 증설 1차) → 자동 판정이라면 최근 수정된 2차 견적서가
   *    뽑히지만 1차를 고정해 두어 "자동 판정으로 되돌리기" 를 눌러볼 수 있다.
   *  - 폐기(VOID) 문서를 낀 기회도 하나 둔다 (엔드포인트 보안 파일럿) → 폐기가 후보에서
   *    빠지는지 눈으로 확인된다.
   */
  const OPPORTUNITY_SEEDS: OpportunitySeed[] = [
    {
      company: "(주)에이비씨 테크놀로지",
      name: "2026 그룹웨어 도입",
      stage: "PROPOSAL",
      expectedCloseDate: "2026-09-30",
      ownerId: rep.id,
      createdAt: "2026-07-06T10:00:00+09:00",
      memo: "견적 재발송 이력 있음. 결재 라인은 팀장 → 본부장 2단계.",
      // 1차(초안)와 2차(발송완료)가 함께 있다 → 발송완료가 앞서 2차가 확정된다
      documents: [
        {
          title: "(주)에이비씨 테크놀로지 그룹웨어 견적서(2차)",
          type: "QUOTE",
          status: "SENT",
          amount: 48_000_000,
          createdAt: "2026-07-20T10:00:00+09:00",
          sent: {
            at: "2026-07-20T10:30:00+09:00",
            recipients: "seojun.lee@abctech.example.com",
          },
        },
      ],
    },
    {
      company: "(주)에이비씨 테크놀로지",
      name: "보안 솔루션 추가 도입",
      stage: "INITIAL",
      expectedCloseDate: "2026-11-20",
      ownerId: rep.id,
      createdAt: "2026-08-03T14:10:00+09:00",
      // 문서는 아래 DOCUMENT_EVENT_SEEDS 에서 붙는 초안 견적서 한 건뿐이다 (발송 전 흐름 데모)
    },
    {
      company: "글로벌커머스(주)",
      name: "커머스 플랫폼 고도화",
      stage: "WON",
      expectedCloseDate: "2026-06-30",
      ownerId: rep.id,
      createdAt: "2026-05-11T09:30:00+09:00",
      actualCloseDate: "2026-06-25T16:00:00+09:00",
      memo: "통합 계약 체결 완료. 연간 유지보수 갱신 시점은 매년 4월.",
      // 계약완료 체결본이 발송완료 계약서(아래에서 연결)를 제치고 확정된다
      documents: [
        {
          title: "커머스 플랫폼 고도화 계약서(체결본)",
          type: "CONTRACT",
          status: "COMPLETED",
          amount: 180_000_000,
          createdAt: "2026-06-24T14:00:00+09:00",
        },
      ],
    },
    {
      company: "글로벌커머스(주)",
      name: "2027 연간 유지보수 갱신",
      stage: "INITIAL",
      expectedCloseDate: "2027-03-31",
      ownerId: leader.id,
      createdAt: "2026-07-29T11:00:00+09:00",
      memo: "갱신 시점만 잡아 둔 단계. 견적은 4분기에 낸다.",
      // 문서 없음 → ₩0 · 확정 문서 없음
    },
    {
      company: "세종테크",
      name: "엔드포인트 보안 파일럿",
      stage: "NEGOTIATION",
      expectedCloseDate: "2026-08-28",
      ownerId: rep.id,
      createdAt: "2026-06-18T13:20:00+09:00",
      memo: "파일럿 10대 규모로 시작해 전사 확대를 검토 중.",
      documents: [
        // 폐기 견적서가 가장 최근·가장 큰 금액이지만 후보에서 빠진다
        {
          title: "세종테크 엔드포인트 보안 견적서(구버전 폐기)",
          type: "QUOTE",
          status: "VOID",
          amount: 31_000_000,
          createdAt: "2026-06-19T09:00:00+09:00",
          updatedAt: "2026-07-30T09:00:00+09:00",
        },
        {
          title: "세종테크 엔드포인트 보안 견적서",
          type: "QUOTE",
          status: "SENT",
          amount: 24_000_000,
          createdAt: "2026-06-25T11:00:00+09:00",
          sent: {
            at: "2026-06-25T11:20:00+09:00",
            recipients: "it@sejongtech.example.com",
          },
        },
      ],
    },
    {
      company: "세종테크",
      name: "통합 로그 관제 구축",
      stage: "PROPOSAL",
      expectedCloseDate: "2026-10-15",
      ownerId: leader.id,
      createdAt: "2026-07-14T15:45:00+09:00",
      documents: [
        {
          title: "세종테크 통합 로그 관제 견적서",
          type: "QUOTE",
          status: "SENT",
          amount: 65_000_000,
          createdAt: "2026-07-18T10:00:00+09:00",
          sent: {
            at: "2026-07-18T10:40:00+09:00",
            recipients: "infra@sejongtech.example.com",
          },
        },
      ],
    },
    {
      company: "세종테크",
      name: "임직원 보안 교육 프로그램",
      stage: "LOST",
      expectedCloseDate: "2026-06-15",
      ownerId: leader.id,
      createdAt: "2026-04-27T10:15:00+09:00",
      actualCloseDate: "2026-06-12T17:30:00+09:00",
      lostReason: "일정",
      documents: [
        {
          title: "세종테크 임직원 보안 교육 제안서",
          type: "PROPOSAL",
          status: "SENT",
          amount: 8_000_000,
          createdAt: "2026-05-08T13:00:00+09:00",
          sent: {
            at: "2026-05-08T13:30:00+09:00",
            recipients: "hr@sejongtech.example.com",
          },
        },
      ],
    },
    {
      company: "다올테크",
      name: "인프라 증설 1차",
      stage: "NEGOTIATION",
      expectedCloseDate: "2026-09-12",
      ownerId: rep.id,
      createdAt: "2026-06-02T09:00:00+09:00",
      memo: "메일보다 전화 연락을 선호. 담당 차장이 최종 검토 중. 2차 견적은 참고용이라 1차를 예상 금액 기준으로 고정해 두었다.",
      // 자동 판정이라면 최근 수정된 2차가 뽑히지만, 1차를 수동 고정해 둔다 (기회-6 ③)
      documents: [
        {
          title: "다올테크 인프라 증설 견적서(1차)",
          type: "QUOTE",
          status: "SENT",
          amount: 92_000_000,
          createdAt: "2026-06-10T10:00:00+09:00",
          updatedAt: "2026-06-10T10:00:00+09:00",
          sent: {
            at: "2026-06-10T10:30:00+09:00",
            recipients: "purchase@daoltech.example.com",
          },
        },
        {
          title: "다올테크 인프라 증설 견적서(2차 축소안)",
          type: "QUOTE",
          status: "SENT",
          amount: 88_000_000,
          createdAt: "2026-07-28T09:00:00+09:00",
          updatedAt: "2026-07-28T09:00:00+09:00",
          sent: {
            at: "2026-07-28T09:30:00+09:00",
            recipients: "purchase@daoltech.example.com",
          },
        },
      ],
      pinnedDocumentTitle: "다올테크 인프라 증설 견적서(1차)",
    },
    {
      company: "다올테크",
      name: "백업 스토리지 교체",
      stage: "LOST",
      expectedCloseDate: "2026-07-10",
      ownerId: rep.id,
      createdAt: "2026-05-19T16:40:00+09:00",
      actualCloseDate: "2026-07-08T11:20:00+09:00",
      lostReason: "가격",
      documents: [
        {
          title: "다올테크 백업 스토리지 견적서",
          type: "QUOTE",
          status: "SENT",
          amount: 30_000_000,
          createdAt: "2026-06-05T14:00:00+09:00",
          sent: {
            at: "2026-06-05T14:20:00+09:00",
            recipients: "purchase@daoltech.example.com",
          },
        },
      ],
    },
    {
      company: "다올테크",
      name: "네트워크 이중화 검토",
      stage: "INITIAL",
      expectedCloseDate: null,
      ownerId: rep.id,
      createdAt: "2026-08-07T09:50:00+09:00",
      memo: "예산·시점 모두 미정. 담당자 요청으로 사전 검토만 진행.",
      // 문서 없음 → ₩0 · 확정 문서 없음
    },
    {
      company: "Bluewave Systems Korea",
      name: "APAC 라이선스 확대",
      stage: "PROPOSAL",
      expectedCloseDate: "2026-12-18",
      ownerId: leader.id,
      createdAt: "2026-07-21T14:00:00+09:00",
      memo: "본사 승인 절차가 있어 계약까지 6주 이상 소요된다.",
      documents: [
        {
          title: "Bluewave APAC 라이선스 확대 견적서",
          type: "QUOTE",
          status: "SENT",
          amount: 140_000_000,
          createdAt: "2026-07-25T16:00:00+09:00",
          sent: {
            at: "2026-07-25T16:30:00+09:00",
            recipients: "apac.procurement@bluewave.example.com",
          },
        },
      ],
    },
    {
      company: "Bluewave Systems Korea",
      name: "국내 지사 PoC",
      stage: "WON",
      expectedCloseDate: "2026-05-29",
      ownerId: rep.id,
      createdAt: "2026-04-15T10:30:00+09:00",
      actualCloseDate: "2026-05-27T15:10:00+09:00",
      documents: [
        {
          title: "Bluewave 국내 지사 PoC 계약서",
          type: "CONTRACT",
          status: "COMPLETED",
          amount: 22_000_000,
          createdAt: "2026-05-26T11:00:00+09:00",
        },
      ],
    },
  ];

  const opportunityIdByName = new Map<string, string>();

  for (const seed of OPPORTUNITY_SEEDS) {
    const accountId = accountIdByName.get(seed.company);
    if (!accountId) continue;

    const createdAt = new Date(seed.createdAt);
    const opportunity = await prisma.opportunity.create({
      data: {
        orgId: org.id,
        accountId,
        ownerId: seed.ownerId,
        name: seed.name,
        stage: seed.stage,
        // 예상 금액은 아래 확정 문서 재판정 패스가 채운다 (기회-6) — 여기서 적지 않는다
        expectedCloseDate: seed.expectedCloseDate
          ? new Date(seed.expectedCloseDate)
          : null,
        actualCloseDate: seed.actualCloseDate
          ? new Date(seed.actualCloseDate)
          : null,
        lostReason: seed.lostReason ?? null,
        memo: seed.memo ?? null,
        createdAt,
      },
    });
    opportunityIdByName.set(seed.name, opportunity.id);

    // 타임라인: 생성 → (진행 단계면) 단계 변경 → (마감이면) 수주·실주.
    // detail 은 SQLite 가 Json scalar 를 지원하지 않아 JSON 문자열로 직렬화한다.
    const events: {
      eventType: string;
      detail: Record<string, unknown>;
      occurredAt: Date;
    }[] = [
      {
        eventType: "OPPORTUNITY_CREATED",
        detail: { accountId, ownerId: seed.ownerId },
        occurredAt: createdAt,
      },
    ];
    if (seed.stage !== "INITIAL") {
      events.push({
        eventType: "STAGE_CHANGED",
        detail: { from: "INITIAL", to: "PROPOSAL" },
        occurredAt: shiftDays(createdAt, 7),
      });
    }
    if (seed.stage === "NEGOTIATION" || seed.stage === "WON") {
      events.push({
        eventType: "STAGE_CHANGED",
        detail: { from: "PROPOSAL", to: "NEGOTIATION" },
        occurredAt: shiftDays(createdAt, 14),
      });
    }
    if (seed.stage === "WON" || seed.stage === "LOST") {
      events.push({
        eventType: seed.stage,
        detail: {
          from: seed.stage === "WON" ? "NEGOTIATION" : "PROPOSAL",
          to: seed.stage,
          ...(seed.lostReason ? { lostReason: seed.lostReason } : {}),
        },
        occurredAt: seed.actualCloseDate
          ? new Date(seed.actualCloseDate)
          : shiftDays(createdAt, 21),
      });
    }

    await prisma.activityLog.createMany({
      data: events.map((event) => ({
        orgId: org.id,
        opportunityId: opportunity.id,
        actorId: seed.ownerId,
        eventType: event.eventType,
        detail: JSON.stringify(event.detail),
        occurredAt: event.occurredAt,
      })),
    });

    // 이 기회의 문서 — 연결(DOCUMENT_CREATED)·발송(DOCUMENT_SENT) 이력을 함께 남긴다.
    // 확정 문서·예상 금액은 아래 재판정 패스가 한 번에 정한다.
    for (const documentSeed of seed.documents ?? []) {
      const documentCreatedAt = new Date(documentSeed.createdAt);
      const created = await prisma.document.create({
        data: {
          orgId: org.id,
          authorId: seed.ownerId,
          opportunityId: opportunity.id,
          title: documentSeed.title,
          type: documentSeed.type,
          status: documentSeed.status,
          clientName: seed.company,
          amount: documentSeed.amount,
          createdAt: documentCreatedAt,
          // 동순위(같은 상태)일 때 최근 수정이 앞서므로 판정이 눈에 보이도록 명시한다
          updatedAt: documentSeed.updatedAt
            ? new Date(documentSeed.updatedAt)
            : documentCreatedAt,
        },
      });

      const base = {
        documentId: created.id,
        documentType: documentSeed.type,
        documentTitle: documentSeed.title,
      };
      await prisma.activityLog.create({
        data: {
          orgId: org.id,
          opportunityId: opportunity.id,
          actorId: seed.ownerId,
          eventType: "DOCUMENT_CREATED",
          detail: JSON.stringify(base),
          occurredAt: documentCreatedAt,
        },
      });

      if (documentSeed.sent) {
        await prisma.emailLog.create({
          data: {
            documentId: created.id,
            senderId: seed.ownerId,
            recipients: documentSeed.sent.recipients,
            subject: documentSeed.title,
            attachmentName: `${documentSeed.title}.pdf`,
            status: "SENT",
            sentAt: new Date(documentSeed.sent.at),
          },
        });
        await prisma.activityLog.create({
          data: {
            orgId: org.id,
            opportunityId: opportunity.id,
            actorId: seed.ownerId,
            eventType: "DOCUMENT_SENT",
            detail: JSON.stringify({
              ...base,
              recipients: documentSeed.sent.recipients,
            }),
            occurredAt: new Date(documentSeed.sent.at),
          },
        });
      }
    }
  }

  // 10-3) 대표 문서를 대응 기회에 연결 + 문서·발송 이력 (F-113 · F-114)
  //   기회 상세의 "연관 문서" 탭과 타임라인이 실제 데이터로 채워져야 한다.
  //   `detail` 은 `src/lib/opportunity-stage.ts` 가 실제로 남기는 형식과 같아야
  //   타임라인의 문서 링크·수신자 표시가 시드 데이터에서도 동작한다.

  // 발송 전 초안 견적서 — 초기 단계 기회에 붙여 두면 발송 시 제안 단계로 자동 전이하는 흐름을
  // 시드 상태에서 바로 눌러볼 수 있다 (F-113 견적서 → 제안).
  const abcSecurityQuote = await prisma.document.create({
    data: {
      orgId: org.id,
      authorId: rep.id,
      title: "(주)에이비씨 테크놀로지 보안 솔루션 견적서",
      type: "QUOTE",
      status: "DRAFT",
      clientName: "(주)에이비씨 테크놀로지",
      amount: 12_000_000,
      folderId: folderClients.id,
      createdAt: new Date("2026-08-04T10:20:00+09:00"),
    },
  });

  type DocumentEventSeed = {
    opportunityName: string;
    documentId: string;
    documentType: string;
    documentTitle: string;
    /** 기회에 연결(=타임라인상 문서 등장) 시각 */
    linkedAt: string;
    /** 발송 이력을 함께 남길 때만 */
    sent?: { at: string; recipients: string };
  };

  const DOCUMENT_EVENT_SEEDS: DocumentEventSeed[] = [
    {
      opportunityName: "2026 그룹웨어 도입",
      documentId: abcQuote.id,
      documentType: "QUOTE",
      documentTitle: abcQuote.title,
      linkedAt: "2026-07-06T14:30:00+09:00",
    },
    {
      // 아직 발송하지 않은 초안 — 발송 버튼을 누르면 초기 → 제안으로 이동한다
      opportunityName: "보안 솔루션 추가 도입",
      documentId: abcSecurityQuote.id,
      documentType: "QUOTE",
      documentTitle: abcSecurityQuote.title,
      linkedAt: "2026-08-04T10:25:00+09:00",
    },
    {
      // 이미 검토/협상 단계에서 보낸 계약서 — 단계는 그대로 두고 발송 이력만 쌓인 사례
      opportunityName: "커머스 플랫폼 고도화",
      documentId: globalContract.id,
      documentType: "CONTRACT",
      documentTitle: globalContract.title,
      linkedAt: "2026-06-20T09:15:00+09:00",
      sent: {
        at: "2026-06-20T09:20:00+09:00",
        recipients: "purchasing@globalcommerce.co.kr; cto@globalcommerce.co.kr",
      },
    },
  ];

  for (const seed of DOCUMENT_EVENT_SEEDS) {
    const opportunityId = opportunityIdByName.get(seed.opportunityName);
    if (!opportunityId) continue;

    await prisma.document.update({
      where: { id: seed.documentId },
      data: { opportunityId },
    });

    const base = {
      documentId: seed.documentId,
      documentType: seed.documentType,
      documentTitle: seed.documentTitle,
    };

    await prisma.activityLog.create({
      data: {
        orgId: org.id,
        opportunityId,
        actorId: rep.id,
        eventType: "DOCUMENT_CREATED",
        detail: JSON.stringify(base),
        occurredAt: new Date(seed.linkedAt),
      },
    });

    if (seed.sent) {
      await prisma.activityLog.create({
        data: {
          orgId: org.id,
          opportunityId,
          actorId: rep.id,
          eventType: "DOCUMENT_SENT",
          detail: JSON.stringify({ ...base, recipients: seed.sent.recipients }),
          occurredAt: new Date(seed.sent.at),
        },
      });
    }
  }

  // 10-4) 확정 문서 재판정 — 예상 금액을 문서에서 도출한다 (기회-6)
  //   런타임(`src/lib/opportunity-amount.ts`)이 하는 일을 시드에서도 **같은 순수 함수**로
  //   재현한다. 여기서 숫자를 손으로 적으면 화면이 계산한 값과 어긋난 시드가 만들어진다.
  //   수동 고정(pinnedDocumentTitle)이 있으면 자동 판정보다 우선한다.
  const pinnedTitleByOpportunity = new Map(
    OPPORTUNITY_SEEDS.flatMap((seed) =>
      seed.pinnedDocumentTitle ? [[seed.name, seed.pinnedDocumentTitle]] : [],
    ),
  );

  const seededOpportunities = await prisma.opportunity.findMany({
    where: { orgId: org.id },
    select: {
      id: true,
      name: true,
      stage: true,
      documents: {
        select: {
          id: true,
          title: true,
          status: true,
          amount: true,
          updatedAt: true,
          // 버전 묶음 판정에 필요하다 (기회-6) — 런타임과 같은 입력을 넘겨야
          // 시드가 만든 금액과 화면이 계산한 금액이 어긋나지 않는다.
          rootId: true,
          version: true,
          isConfirmed: true,
        },
      },
    },
  });

  for (const opportunity of seededOpportunities) {
    const pinnedTitle = pinnedTitleByOpportunity.get(opportunity.name);
    const pinnedDocument = pinnedTitle
      ? opportunity.documents.find((document) => document.title === pinnedTitle)
      : undefined;

    const resolution = resolveConfirmedDocument(opportunity.documents, {
      confirmedDocumentId: pinnedDocument?.id ?? null,
      isPinned: Boolean(pinnedDocument),
    });

    await prisma.opportunity.update({
      where: { id: opportunity.id },
      data: {
        confirmedDocumentId: resolution.confirmedDocumentId,
        isConfirmedDocumentPinned: resolution.isPinned,
        expectedAmount: resolution.amount,
      },
    });
  }

  // 11) 팀원 초대 (대기 중)
  await prisma.invite.createMany({
    data: [
      {
        orgId: org.id,
        email: "newbie@rainmaker.ai",
        role: "SALES_REP",
        status: "PENDING",
      },
      {
        orgId: org.id,
        email: "manager@rainmaker.ai",
        role: "LEADER",
        status: "PENDING",
      },
    ],
  });

  // 12) 정책 라이브러리 24개
  await prisma.policy.createMany({
    data: POLICIES.map((p) => ({
      code: p.code,
      scope: "project",
      description: p.description,
    })),
  });

  // 요약 출력 — 파이프라인 합계는 확정 문서 기준이라 시드 구성이 바뀌면 함께 움직인다
  const pipelineTotals = await prisma.opportunity.aggregate({
    where: { orgId: org.id },
    _sum: { expectedAmount: true },
  });
  const openTotals = await prisma.opportunity.aggregate({
    where: { orgId: org.id, stage: { in: ["INITIAL", "PROPOSAL", "NEGOTIATION"] } },
    _sum: { expectedAmount: true },
  });
  const withoutConfirmed = await prisma.opportunity.count({
    where: { orgId: org.id, confirmedDocumentId: null },
  });

  const counts = {
    조직: await prisma.organization.count(),
    사용자: await prisma.user.count(),
    거래처: await prisma.account.count(),
    담당자: await prisma.contact.count(),
    기회: await prisma.opportunity.count(),
    활동이력: await prisma.activityLog.count(),
    문서: await prisma.document.count(),
    문서항목: await prisma.documentItem.count(),
    표준양식: await prisma.template.count(),
    양식변수: await prisma.templateVariable.count(),
    폴더: await prisma.folder.count(),
    카탈로그: await prisma.catalogItem.count(),
    메일계정: await prisma.emailAccount.count(),
    메일도메인: await prisma.teamMailDomain.count(),
    메일템플릿: await prisma.emailTemplate.count(),
    발송이력: await prisma.emailLog.count(),
    크레딧거래: await prisma.creditTransaction.count(),
    초대: await prisma.invite.count(),
    정책: await prisma.policy.count(),
  };
  console.log("✅ seeding 완료:", counts);
  console.log("📊 파이프라인(확정 문서 기준):", {
    전체합계: (pipelineTotals._sum.expectedAmount ?? 0).toLocaleString("ko-KR"),
    진행중합계: (openTotals._sum.expectedAmount ?? 0).toLocaleString("ko-KR"),
    확정문서없음: `${withoutConfirmed}건`,
  });
}

main()
  .catch((e) => {
    console.error("❌ seeding 실패:", e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
