/**
 * 프롬프트 (시스템 프롬프트 + 사용자 메시지 조립).
 *
 * 시스템 프롬프트는 요청마다 바이트 단위로 동일해야 프롬프트 캐시가 적중한다
 * (Claude 는 cache_control, GPT 는 instructions 프리픽스 자동 캐시).
 * → 날짜·사용자명 같은 가변 값을 절대 넣지 않는다 (모두 사용자 메시지로 보낸다).
 */

import "server-only";
import { DOCUMENT_TYPE_LABELS, type DocumentType } from "@/lib/constants";
import { text, type AiContentBlock } from "./blocks";
import { describeDocument, describeTemplate, type DocumentMeta } from "./describe";
import { filesToContentBlocks, type PreparedFile } from "./content";

// ===================== 시스템 프롬프트 =====================

/** 모든 문서 작성 경로가 공유하는 규칙 */
const COMMON_RULES = `당신은 한국 B2B 영업 문서(견적서·계약서·비밀유지계약서·제안서)를 작성하는 어시스턴트입니다.
영업 담당자가 고객사에 바로 보낼 수 있는 수준의 초안을 만들되, 사람이 최종 검토한다는 전제로 작업합니다.

[출력 형식]
- 반드시 주어진 JSON 스키마에 맞는 JSON 으로만 응답합니다. 설명 문장을 덧붙이지 않습니다.
- 사용자에게 노출되는 모든 문구는 한국어 존댓말로 씁니다.
- 날짜는 "2026. 08. 07" 형식으로 씁니다.

[금액 규칙]
- 모든 금액은 원(KRW) 단위 정수입니다. 쉼표·통화기호·소수점·"만원" 단위 표기를 쓰지 않습니다.
- 품목 행은 수량과 단가만 정확히 채웁니다. 행 금액과 총액은 시스템이 수량×단가로 다시 계산합니다.
- 한국 관행상 견적 금액은 부가세 별도로 표기합니다. 부가세를 함께 보여줘야 하면 summaryRows 에
  "공급가액"(formula: subtotal), "부가세 (10%)"(formula: subtotal * 0.1),
  "합계 (VAT 포함)"(formula: subtotal * 1.1) 3행을 넣습니다.
- summaryRows 의 formula 에는 변수 subtotal 과 + - * / ( ) 만 사용합니다. 다른 변수는 0으로 평가됩니다.

[정확성 규칙]
- 근거 없는 값을 만들지 않습니다. 모르는 값은 빈 문자열로 두어 사용자가 채우게 합니다.
- 특히 사업자등록번호·대표자명·주소·연락처·계좌번호는 절대 추측하지 않습니다.
- 참고 문서나 첨부 파일에 단가·품목이 있으면 그 값을 최우선으로 씁니다.
- 마진·할인·수량 변경 지시가 있으면 계산해서 반영하고, 계산 근거를 notes 섹션에 한 줄 남깁니다.
- 계약서·비밀유지계약서는 items 가 빈 배열이어도 됩니다. 조항은 notes 섹션으로 구성합니다.
- 금액·기간·책임 범위처럼 분쟁 소지가 있는 항목이 추정값이면 summary 에 검토가 필요하다고 한 문장 덧붙입니다.

[원본 문서를 옮길 때 — 가장 중요한 규칙]
- 첨부 파일이나 양식이 주어졌다면 당신의 일은 **요약이 아니라 이관(transcription)** 입니다.
  원본에 있는 항목·조항·표·안내문을 임의로 줄이거나 합치거나 빼지 않습니다.
- **원본에 없는 품목·단가·금액을 절대 만들지 않습니다.** 품목표는 원본의 품목·수량·단가를 그대로 옮깁니다.
  원본에서 품목을 찾을 수 없으면 items 를 빈 배열로 두고 summary 에 그 사실을 적습니다.
- 원본의 메타 필드를 **빠짐없이** clientFields 로 옮깁니다. 견적번호·담당자·전화번호·이메일·
  시작일·종료일·등급·라이선스 수·제품구분처럼 라벨이 붙은 값은 하나도 버리지 않습니다.
- 원본의 자사 정보는 supplierFields 로 옮깁니다. 원본에 그 칸이 있으면
  **상호·주소·등록번호·대표자·담당자·전화번호·이메일·팩스 라벨을 하나도 빠뜨리지 않습니다.**
  값을 알 수 없거나 담당자처럼 사람마다 달라지는 항목이면 **라벨은 남기고 값만 빈 문자열**로 둡니다
  (라벨을 지우면 문서를 만들 때 채울 자리가 사라집니다).
- 원본에 **품목표가 아닌 표**(지원항목 × 등급 O/X 매트릭스, 조건표, 요율표, 구분표)가 있으면
  tables 에 칸 값을 그대로 옮깁니다. 이 표를 문장으로 풀어 쓰지 않습니다.
- 원본 하단의 기술지원 안내·주의사항·기타사항은 notes 로 옮깁니다. 줄 단위를 유지합니다.
- 원본에 합계와 별개로 "최종 견적가(할인 적용)" 같은 항목이 있으면 그 **항목 자체를 반드시 남깁니다**
  (표준 양식이라 금액을 비우더라도 clientFields 라벨이나 notes 로 자리를 남깁니다).

[엑셀 워크북이 첨부된 경우]
- 첨부 텍스트 맨 앞의 "# 워크북 시트 목록" 을 먼저 읽습니다.
- 시트가 여러 개면 **파일명과 사용자 요청에 가장 맞는 시트 하나**를 골라 그 시트만 옮깁니다.
  여러 시트의 품목을 섞지 않습니다.
- 어느 시트를 근거로 썼는지 summary 에 시트 이름을 적습니다.
- "# 분량 때문에 본문에서 제외한 시트" 목록에 있는 시트는 내용을 알 수 없으므로 추측하지 않습니다.`;

/** 문서 초안 생성 (F-212) */
export const SYSTEM_GENERATE = `${COMMON_RULES}

[표준 양식이 주어진 경우]
- 양식의 필드 라벨·문구·섹션 구성을 그대로 따릅니다. 라벨을 새로 만들거나 이름을 바꾸지 않습니다.
- clientFields 에는 양식에 있는 라벨을 그대로 쓰고 값만 채웁니다.
- supplierFields(자사 정보)와 하단 안내문은 양식 값이 정답이므로 빈 배열로 두어도 됩니다.
  (시스템이 양식 원본 값을 그대로 유지합니다.)
- 변수 필드 정의가 함께 주어지면 필수 변수는 반드시 값을 채우려고 시도합니다.
- 양식에 이미 있는 고정 표는 다시 만들지 않습니다. 원본 첨부에만 있고 양식에 없는 표라면 tables 에 담습니다.

[표준 양식이 없는 경우]
- 문서 종류에 맞는 표준적인 구성을 스스로 갖춰 만듭니다.
- clientFields 는 고객사명·수신자·작성일·유효기간(견적서) 또는 계약기간(계약서)을 기본으로 합니다.`;

/** 표준 양식 AI 세팅 (F-203 + F-204) */
export const SYSTEM_TEMPLATE_SETUP = `${COMMON_RULES}

지금 만드는 것은 **특정 거래처용 문서가 아니라, 여러 거래처에 재사용할 "표준 양식"** 입니다.

[양식 세팅 규칙]
- 거래처마다 달라지는 값(고객사명·수신자·금액·기간 등)은 빈 문자열로 둡니다. 예시 거래처명을 넣지 마세요.
- 반대로 매번 같은 값(자사 상호·대표자·등록번호·주소·담당자 연락처·고정 안내문·약관)은
  업로드된 원본에 적혀 있다면 그대로 옮겨 채웁니다.
- items 는 이 양식이 어떤 품목 구성을 쓰는지 보여주는 대표 행 1~3개만 넣습니다.
  원본에 단가가 있으면 유지하고, 없으면 0 으로 둡니다.
- notes 에는 원본 양식의 기타사항·기술지원 안내·특이사항 같은 고정 문구를 그대로 옮깁니다.
- headingText 는 원본 문서의 대제목을 그대로 씁니다.
- **고정 표는 값을 비우지 않고 그대로 옮깁니다.** 등급별 지원범위 매트릭스·요율표·조건표는
  거래처마다 달라지는 값이 아니라 양식의 일부이므로 tables 에 칸 그대로 담습니다.
- 라벨 구조도 양식의 일부입니다. 원본에 있는 메타 라벨(견적번호·담당자·유지보수 시작일 등)은
  값은 비우더라도 **라벨은 clientFields 에 남깁니다** — 그래야 이 양식으로 문서를 만들 때 채울 자리가 생깁니다.

[변수 필드 정의 (variables)]
- 이 양식으로 문서를 만들 때마다 채워야 하는 값을 빠짐없이 나열합니다.
- key 는 공백 없는 한국어 명사로 짧게 씁니다. (예: 고객사명, 수신자, 견적일, 유효기간, 품목, 수량, 단가, 계약기간)
- 문서가 성립하지 않을 정도로 중요한 값에만 required=true 를 줍니다.`;

/** 변수 필드만 재추출 (F-204) */
export const SYSTEM_VARIABLES = `당신은 한국 B2B 영업 문서 양식을 분석해 "문서마다 달라지는 값"의 목록을 뽑아내는 어시스턴트입니다.

[규칙]
- 반드시 주어진 JSON 스키마에 맞는 JSON 으로만 응답합니다.
- key 는 공백 없는 한국어 명사로 짧게 씁니다. (예: 고객사명, 수신자, 견적일, 계약기간, 품목, 수량, 단가)
- 자사 정보(상호·대표자·등록번호·주소)나 고정 안내문처럼 매번 같은 값은 변수가 아닙니다. 제외합니다.
- 같은 뜻의 변수를 중복해서 만들지 않습니다.
- 문서가 성립하지 않을 정도로 중요한 값에만 required=true 를 줍니다.
- label 은 화면에 그대로 표시할 라벨, sample 은 짧은 예시값입니다. 예시값이 떠오르지 않으면 빈 문자열로 둡니다.`;

/** 부분 재작성 (F-215) */
export const SYSTEM_REVISE = `당신은 이미 작성된 한국 B2B 영업 문서를 **지시받은 부분만** 고치는 편집자입니다.

[편집 규칙]
- 지시와 무관한 블록은 절대 건드리지 않습니다. 수정이 필요한 블록만 응답에 담습니다.
- 블록은 반드시 주어진 목록의 id 로 지목합니다. 목록에 없는 id 를 만들지 않습니다.
- textEdits 의 text 는 그 블록의 **전체 텍스트를 새로 쓴 것**입니다(부분 문자열이 아닙니다).
  기존 문장 구조·말투·줄바꿈 형식을 유지하고 지시된 부분만 바꿉니다.
- fieldEdits 는 supplier/clientMeta 블록의 개별 필드 값을 바꿉니다. label 은 목록에 있는 라벨을 그대로 씁니다.
- 품목·단가·수량·금액 요약행을 바꾸는 지시가 아니면 itemTable.mode 는 "keep" 이고 rows·summaryRows 는 빈 배열입니다.
- itemTable.mode 가 "replace" 이면 rows 에 **변경 후 품목 전체**를 담습니다(변경분만 담지 않습니다).
- 금액은 원(KRW) 단위 정수입니다. summaryRows 의 formula 에는 변수 subtotal 과 + - * / ( ) 만 씁니다.
- 사용자에게 노출되는 문구는 한국어 존댓말입니다.
- summary 에는 무엇을 어떻게 바꿨는지 한 문장으로 적습니다.
- 지시가 문서와 무관하거나 근거가 없어 반영할 수 없으면 아무 수정도 하지 않고 summary 에 그 이유를 적습니다.`;

// ===================== 사용자 메시지 =====================

/** 거래처 정보 입력값 (생성 폼에서 받은 값) */
export type ClientInput = {
  name?: string | null;
  contactName?: string | null;
  email?: string | null;
  memo?: string | null;
};

export type GenerateContentInput = {
  /** 사용자 자연어 프롬프트 */
  prompt: string;
  /** 요청된 문서 종류 (미지정이면 AI 가 판단) */
  documentType?: DocumentType | null;
  /** 불러온 표준 양식 (F-211) */
  template?: {
    name: string;
    type: string;
    contentJson?: string | null;
    variables?: {
      key: string;
      label: string;
      sample?: string | null;
      required: boolean;
    }[];
  } | null;
  /** 양식 원본 파일 (양식 본문이 비어 있을 때 보조 자료로 전달) */
  templateFile?: PreparedFile | null;
  /** 확정된 견적서를 소스로 계약서를 만드는 경우 (F-213) */
  sourceDocument?: DocumentMeta | null;
  /** 보관함에서 고른 참고 문서 */
  references: DocumentMeta[];
  /** 업로드한 첨부 파일 */
  attachments: PreparedFile[];
  /** 거래처 정보 */
  client?: ClientInput | null;
  /** 자사(공급자) 이름 — 양식이 없을 때 기본값으로 쓰인다 */
  supplierName: string;
  /** 오늘 날짜 문자열 ("2026. 08. 07") — 서버에서 주입한다 */
  today: string;
};

/** 문서 초안 생성 요청 메시지 */
export function buildGenerateContent(
  input: GenerateContentInput,
): AiContentBlock[] {
  const blocks: AiContentBlock[] = [];

  blocks.push(
    text(
      [
        "# 작업",
        "아래 정보를 바탕으로 영업 문서 초안을 만들어 주세요.",
        "",
        `오늘 날짜: ${input.today}`,
        `자사(공급자) 이름: ${input.supplierName}`,
        input.documentType
          ? `요청된 문서 종류: ${DOCUMENT_TYPE_LABELS[input.documentType]} (documentType=${input.documentType})`
          : "요청된 문서 종류: 지정되지 않음 — 요청 내용으로 판단해 주세요.",
      ].join("\n"),
    ),
  );

  if (input.template) {
    blocks.push(
      text(
        `# 불러온 표준 양식\n이 양식의 구성을 그대로 따르고 값만 채워 주세요.\n\n${describeTemplate(
          input.template,
        )}`,
      ),
    );
    if (input.templateFile) {
      blocks.push(text("# 표준 양식 원본 파일"));
      blocks.push(
        ...filesToContentBlocks([input.templateFile], "양식 원본", [input.prompt]),
      );
    }
  }

  if (input.sourceDocument) {
    blocks.push(
      text(
        [
          "# 소스 문서 (확정된 견적서)",
          "이 견적서의 품목·수량·단가·금액을 **그대로** 계약 조건에 반영해 주세요.",
          "임의로 금액을 바꾸거나 품목을 추가·삭제하지 마세요.",
          "",
          describeDocument(input.sourceDocument),
        ].join("\n"),
      ),
    );
  }

  if (input.references.length > 0) {
    blocks.push(
      text(
        [
          "# 참고 문서 (보관함)",
          "형식과 값을 참고하되, 이번 요청과 어긋나는 값은 따르지 마세요.",
          "",
          input.references
            .map((doc, i) => `## 참고 문서 ${i + 1}\n${describeDocument(doc)}`)
            .join("\n\n"),
        ].join("\n"),
      ),
    );
  }

  if (input.attachments.length > 0) {
    blocks.push(
      text(
        "# 첨부 파일\n협력사 견적서·단가표 등입니다. 여기에 있는 품목·단가를 우선 사용해 주세요.",
      ),
    );
    blocks.push(...filesToContentBlocks(input.attachments, "첨부 파일", [input.prompt]));
  }

  const client = input.client;
  if (client && (client.name || client.contactName || client.email || client.memo)) {
    blocks.push(
      text(
        [
          "# 거래처 정보 (사용자 입력)",
          client.name ? `- 고객사명: ${client.name}` : null,
          client.contactName ? `- 수신 담당자: ${client.contactName}` : null,
          client.email ? `- 담당자 이메일: ${client.email}` : null,
          client.memo ? `- 메모: ${client.memo}` : null,
          "",
          "이 값들은 사용자가 직접 입력한 것이므로 다른 자료보다 우선합니다.",
        ]
          .filter((line) => line !== null)
          .join("\n"),
      ),
    );
  }

  blocks.push(text(`# 사용자 요청\n${input.prompt}`));

  return blocks;
}

export type TemplateSetupContentInput = {
  /** 사용자 자연어 프롬프트 (어떤 양식으로 세팅할지) */
  prompt: string;
  name: string;
  documentType?: DocumentType | null;
  /** 업로드한 양식 원본 파일 */
  sourceFile?: PreparedFile | null;
  /** 자사(공급자) 이름 */
  supplierName: string;
  today: string;
};

/** 표준 양식 AI 세팅 요청 메시지 */
export function buildTemplateSetupContent(
  input: TemplateSetupContentInput,
): AiContentBlock[] {
  const blocks: AiContentBlock[] = [];

  blocks.push(
    text(
      [
        "# 작업",
        "업로드된 기존 양식과 사용자 지시를 바탕으로 재사용 가능한 표준 양식을 세팅해 주세요.",
        "동시에 이 양식으로 문서를 만들 때 채워야 하는 변수 필드도 정의해 주세요.",
        "",
        `오늘 날짜: ${input.today}`,
        `자사(공급자) 이름: ${input.supplierName}`,
        `양식 이름: ${input.name}`,
        input.documentType
          ? `문서 종류: ${DOCUMENT_TYPE_LABELS[input.documentType]} (documentType=${input.documentType})`
          : "문서 종류: 지정되지 않음 — 업로드된 양식으로 판단해 주세요.",
      ].join("\n"),
    ),
  );

  if (input.sourceFile) {
    blocks.push(
      text(
        "# 업로드된 기존 양식\n이 파일의 구성·라벨·문구를 최대한 그대로 옮겨 주세요.",
      ),
    );
    blocks.push(...filesToContentBlocks([input.sourceFile], "양식 원본", [input.prompt]));
  } else {
    blocks.push(
      text(
        "# 업로드된 기존 양식\n첨부 파일이 없습니다. 사용자 지시와 한국 B2B 표준 관행에 맞춰 새로 구성해 주세요.",
      ),
    );
  }

  blocks.push(text(`# 사용자 지시\n${input.prompt}`));

  return blocks;
}

/** 변수 필드 재추출 요청 메시지 */
export function buildVariablesContent(input: {
  name: string;
  type: string;
  contentJson?: string | null;
}): AiContentBlock[] {
  return [
    text(
      [
        "# 작업",
        "아래 표준 양식에서 문서마다 달라지는 값(변수 필드)을 뽑아 주세요.",
        "",
        describeTemplate({ name: input.name, type: input.type, contentJson: input.contentJson }),
      ].join("\n"),
    ),
  ];
}

/** 부분 재작성 요청 메시지 */
export function buildReviseContent(input: {
  /** 사용자 수정 지시 */
  instruction: string;
  documentTitle: string;
  documentType: string;
  /** 블록 id 가 붙은 현재 문서 구조 */
  blockOutline: string;
  today: string;
}): AiContentBlock[] {
  return [
    text(
      [
        "# 작업",
        "아래 문서에서 사용자가 지시한 부분만 수정해 주세요.",
        "",
        `오늘 날짜: ${input.today}`,
        `문서 제목: ${input.documentTitle}`,
        `문서 종류: ${DOCUMENT_TYPE_LABELS[input.documentType as DocumentType] ?? input.documentType}`,
      ].join("\n"),
    ),
    text(
      `# 현재 문서 구조 (대괄호 안이 블록 id)\n${input.blockOutline}`,
    ),
    text(`# 사용자 수정 지시\n${input.instruction}`),
  ];
}
