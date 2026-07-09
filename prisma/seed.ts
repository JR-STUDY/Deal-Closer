import "dotenv/config";
import { PrismaBetterSqlite3 } from "@prisma/adapter-better-sqlite3";
import { PrismaClient } from "../src/generated/prisma/client";
import {
  seedTemplate,
  calcItemTableTotal,
  type BlockPropsMap,
} from "../src/lib/editor-schema";

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
 * 데모 영업 담당자(홍길동)의 기본 메일 서명 (HTML).
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
                          홍길동 <span style="font-weight:400; color:#555555; font-size:16px;">Gildong Hong</span>
                        </div>
                        <div style="margin-top:6px; font-size:14px; letter-spacing:-0.7px; line-height:20px; color:#555555; font-weight:700;">
                          브랜드경영실 전략홍보팀 <span style="color:#999999; font-weight:400;">|</span> 과장
                        </div>
                      </td>
                    </tr>

                    <!-- Spacer -->
                    <tr>
                      <td bgcolor="#F5F5F5" style="background-color:#F5F5F5; height:75px; line-height:75px; font-size:0;">&nbsp;</td>
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

                    <!-- Phone (office) -->
                    <tr>
                      <td bgcolor="#F5F5F5" valign="top" style="padding:2px 0; background-color:#F5F5F5;">
                        <table role="presentation" cellpadding="0" cellspacing="0" border="0" style="border-collapse:collapse;">
                          <tr>
                            <td bgcolor="#F5F5F5" valign="middle" style="padding:0 10px 0 0; background-color:#F5F5F5;">
                              <img src="https://design.jirandata.co.kr/mail/2026/icon-tel.png" width="15" height="15" alt="" style="display:block; border:0; outline:none; -ms-interpolation-mode:bicubic;" />
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
                              kildong.hong@rainmaker.ai
                            </td>
                          </tr>
                        </table>
                      </td>
                    </tr>

                    <!-- Fax -->
                    <tr>
                      <td bgcolor="#F5F5F5" valign="top" style="padding:2px 0; background-color:#F5F5F5;">
                        <table role="presentation" cellpadding="0" cellspacing="0" border="0" style="border-collapse:collapse;">
                          <tr>
                            <td bgcolor="#F5F5F5" valign="middle" style="padding:0 10px 0 0; background-color:#F5F5F5;">
                              <img src="https://design.jirandata.co.kr/mail/2026/icon-fax.png" width="15" height="15" alt="" style="display:block; border:0; outline:none; -ms-interpolation-mode:bicubic;" />
                            </td>
                            <td bgcolor="#F5F5F5" valign="middle" style="background-color:#F5F5F5; font-family:Arial, Helvetica sans-serif; font-size:14px; line-height:25px; color:#111111; font-weight:400; letter-spacing: 0;">
                              070-4709-9185
                            </td>
                          </tr>
                        </table>
                      </td>
                    </tr>

                    <!-- Addresses -->
                    <tr>
                      <td bgcolor="#F5F5F5" style="padding:10px 0 0 0; font-family:Malgun Gothic, Apple SD Gothic Neo, 'Noto Sans KR', Arial, sans-serif; font-size:10px; letter-spacing:-0.5px; line-height:18px; color:#777777; background-color:#F5F5F5;">
                        34016 대전광역시 유성구 테크노3로 65 (관평동) 한신S메카 603호<br />
                        13453 경기도 성남시 수정구 금토로 80번길 37 (금토동) 인피니티타워 W동 10,11F
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
      email: "kildong.hong@rainmaker.ai",
      name: "홍길동",
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
  //  · rep 은 기본적으로 개인 계정(sales-pro@gmail.com) 발신 상태로 두어
  //    "팀 도메인 선택" 흐름을 데모에서 직접 확인할 수 있게 한다
  //  · defaultCc: 팀 도메인 발송 시 기본 참조(CC) — 영업팀(리더·담당자) 전원
  await prisma.teamMailDomain.create({
    data: {
      orgId: org.id,
      domain: "rainmaker.ai",
      label: "회사 공식 도메인",
      status: "VERIFIED",
      isDefault: true,
      defaultCc: `${leader.email}; ${rep.email}`,
    },
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
        subject: "[{{문서종류}}] {{거래처}}님께 드리는 {{문서제목}}",
        body: "안녕하세요, {{거래처}} 담당자님.\n\n요청주신 {{문서제목}} 건에 대한 {{문서종류}}를 첨부와 같이 보내드립니다. 총액은 {{총액}}(부가세 포함)이며, 상세 내역은 첨부 문서를 확인 부탁드립니다.\n\n견적 유효기간은 발행일로부터 30일입니다. 궁금하신 점이 있으시면 언제든 회신 주세요.\n\n감사합니다.",
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
      // ── 개인 (홍길동) ──
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

  // 8-4) 문서함별 폴더 (다단계) — 내 문서함(isCommon=false) / 공용문서함(isCommon=true)
  const folderClients = await prisma.folder.create({
    data: { orgId: org.id, name: "주요 거래처", isCommon: false, sortOrder: 0 },
  });
  // 하위 폴더 예시 (주요 거래처 > 글로벌커머스(주))
  const folderClientsGlobal = await prisma.folder.create({
    data: {
      orgId: org.id,
      name: "글로벌커머스(주)",
      isCommon: false,
      parentId: folderClients.id,
      sortOrder: 0,
    },
  });
  const folderProposals = await prisma.folder.create({
    data: { orgId: org.id, name: "제안서", isCommon: false, sortOrder: 1 },
  });
  await prisma.folder.create({
    data: { orgId: org.id, name: "진행 중", isCommon: false, sortOrder: 2 },
  });
  // 내 문서함에도 "표준 양식" 폴더 — 내 발신 정보(전화·이메일)가 채워진 개인 사본을 모아 둔다
  const folderMyStandard = await prisma.folder.create({
    data: { orgId: org.id, name: "표준 양식", isCommon: false, sortOrder: 3 },
  });
  // 공용문서함: 표준 양식(계약서·견적서 초안) + 공통 계약 문서(NDA·합의서)
  const folderStandard = await prisma.folder.create({
    data: { orgId: org.id, name: "표준 양식", isCommon: true, sortOrder: 0 },
  });
  const folderCommonContracts = await prisma.folder.create({
    data: { orgId: org.id, name: "공통 계약 문서", isCommon: true, sortOrder: 1 },
  });

  // 8-5) 공용문서함(공유) 문서 지정 — 기존 NDA·합의서를 "공통 계약 문서"로 승격 (문서는 내/공용 중 하나)
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
    data: { isCommon: true, folderId: folderCommonContracts.id },
  });

  // 8-6) 표준 양식(계약서·견적서 초안) — 공급자(우리 회사) 정보를 채운 블록 캔버스 문서
  //  · 공용 버전: 상호·대표·등록번호·주소만 채우고 전화·이메일은 담당자별로 비워 둔다
  //  · 개인 버전: 발신 담당자(홍길동)의 전화·이메일까지 채워 "이미 템플릿화된" 상태로 시딩
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

  // 공용 표준 양식 (전화·이메일 비움)
  await prisma.document.create({
    data: {
      orgId: org.id,
      authorId: rep.id,
      title: "표준 견적서 양식",
      type: "QUOTE",
      status: "DRAFT",
      clientName: null,
      amount: itemsTotal(quoteItems),
      // 표준 양식은 상시 비치 문서 → 오래된 날짜로 두어 대시보드 "최근 문서"를 실제 딜이 차지하게 한다
      createdAt: new Date("2026-01-02T09:00:00+09:00"),
      isCommon: true,
      folderId: folderStandard.id,
      contentJson: buildStandardForm({
        type: "QUOTE",
        clientName: null,
        items: quoteItems,
      }),
    },
  });
  await prisma.document.create({
    data: {
      orgId: org.id,
      authorId: rep.id,
      title: "표준 계약서 양식",
      type: "CONTRACT",
      status: "DRAFT",
      clientName: null,
      amount: itemsTotal(contractItems),
      createdAt: new Date("2026-01-02T09:10:00+09:00"),
      isCommon: true,
      folderId: folderStandard.id,
      contentJson: buildStandardForm({
        type: "CONTRACT",
        clientName: null,
        items: contractItems,
      }),
    },
  });

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
      isCommon: false,
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
      isCommon: false,
      folderId: folderMyStandard.id,
      contentJson: buildStandardForm({
        type: "CONTRACT",
        clientName: null,
        items: contractItems,
        contact: repContact,
      }),
    },
  });

  // 8-7) 내 문서함 폴더 배치 (isCommon=false 문서만) — 대표 계약서는 하위 폴더에 배치
  await prisma.document.update({
    where: { id: globalContract.id },
    data: { folderId: folderClientsGlobal.id },
  });
  await prisma.document.update({
    where: { id: abcQuote.id },
    data: { folderId: folderClients.id },
  });
  await prisma.document.updateMany({
    where: { orgId: org.id, type: "PROPOSAL", isCommon: false, folderId: null },
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

  // 요약 출력
  const counts = {
    조직: await prisma.organization.count(),
    사용자: await prisma.user.count(),
    문서: await prisma.document.count(),
    문서항목: await prisma.documentItem.count(),
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
}

main()
  .catch((e) => {
    console.error("❌ seeding 실패:", e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
