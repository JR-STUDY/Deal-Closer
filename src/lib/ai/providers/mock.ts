/**
 * 로컬 검증용 목(mock) 프로바이더 (서버 전용).
 *
 * 실제 LLM 을 호출하지 않고 스키마에 맞는 그럴듯한 응답을 즉시 돌려준다.
 * 목적은 **파이프라인 검증**이다 — 생성→DocSpec→EditorDoc→에디터 렌더링,
 * 총액 서버 재계산, 양식 레이아웃 보존, 버전 저장, 크레딧 차감 같은
 * 코드 경로가 제대로 이어지는지 무료·즉시·결정적으로 확인한다.
 *
 * 문장 품질·추론 정확도는 이 프로바이더로 검증할 수 없다. 그건 실제 키로 확인한다.
 *
 * 켜는 방법: .env 에 AI_PROVIDER="mock"
 * 프로덕션 빌드에서는 절대 동작하지 않는다 (아래 가드 참고).
 */

import "server-only";
import { AiGenerationError, AiNotConfiguredError } from "../config";
import type { AiContentBlock } from "../blocks";
import type { StructuredCall, StructuredResult } from "../invoke";
import type {
  DocSpec,
  SpecItem,
  SpecNote,
  SpecVariable,
  TemplateSpec,
} from "../doc-spec";
import type { RevisionSpec } from "../revision-spec";

/** 목 응답에 붙는 모델 이름 (usage 로그에서 구분되도록) */
const MOCK_MODEL = "mock-local";

// ===================== 프롬프트에서 정보 긁어오기 =====================

/** 사용자 메시지의 텍스트 블록만 이어붙인다 */
function promptText(content: AiContentBlock[]): string {
  return content
    .filter((block): block is Extract<AiContentBlock, { type: "text" }> => block.type === "text")
    .map((block) => block.text)
    .join("\n");
}

/** "# 사용자 요청" / "# 사용자 지시" 섹션 본문을 뽑는다 */
function userRequestOf(text: string): string {
  const match = text.match(/^# 사용자 (?:요청|지시|수정 지시)\n([\s\S]*)$/m);
  return (match?.[1] ?? "").trim();
}

/** "- 고객사명: OOO" 또는 프롬프트 안의 회사명스러운 토큰을 찾는다 */
function clientNameOf(text: string): string {
  const explicit = text.match(/^- 고객사명: (.+)$/m);
  if (explicit) return explicit[1].trim();
  // (주)OOO · OOO 주식회사 · OOO㈜ 형태
  const guess = text.match(/(\(주\)\s*\S+|\S+\s*주식회사|\S+㈜)/);
  return guess ? guess[1].replace(/\s+/g, "") : "";
}

/** 문서 종류 (프롬프트에 documentType=XXX 로 들어온다) */
function documentTypeOf(text: string): DocSpec["documentType"] {
  const match = text.match(/documentType=(QUOTE|CONTRACT|NDA|PROPOSAL)/);
  return (match?.[1] as DocSpec["documentType"]) ?? "QUOTE";
}

/** 오늘 날짜 (프롬프트에서 주입된 값을 그대로 재사용해 결정적으로 만든다) */
function todayOf(text: string): string {
  return text.match(/^오늘 날짜: (.+)$/m)?.[1]?.trim() ?? "";
}

/** 블록 id 목록 — describeEditorDocWithIds 가 "[id] 라벨: …" 형태로 넣어준다 */
function blockOutlineOf(text: string): { id: string; label: string }[] {
  return text
    .split("\n")
    .map((line) => line.match(/^\[([^\]]+)\]\s*([^:]+)/))
    .filter((m): m is RegExpMatchArray => Boolean(m))
    .map((m) => ({ id: m[1], label: m[2].trim() }));
}

// ===================== 픽스처 =====================

const MOCK_ITEMS: SpecItem[] = [
  {
    name: "RAINMAKER 스탠다드 라이선스",
    description: "연간 구독 · 사용자 20명",
    quantity: 20,
    unitPrice: 180_000,
  },
  {
    name: "초기 구축 · 데이터 이관",
    description: "1회성",
    quantity: 1,
    unitPrice: 3_500_000,
  },
  {
    name: "기술지원 (프리미엄)",
    description: "월 단위 · 12개월",
    quantity: 12,
    unitPrice: 150_000,
  },
];

/** 견적 관행에 맞춘 부가세 요약행 */
const VAT_SUMMARY_ROWS = [
  { label: "공급가액", formula: "subtotal" },
  { label: "부가세 (10%)", formula: "subtotal * 0.1" },
  { label: "합계 (VAT 포함)", formula: "subtotal * 1.1" },
];

function mockNotes(request: string): SpecNote[] {
  return [
    {
      heading: "기타사항",
      lines: [
        "본 견적의 금액은 부가세 별도입니다.",
        "결제 조건은 납품 완료 후 30일 이내 현금 지급을 원칙으로 합니다.",
        "견적 유효기간 경과 후에는 재견적이 필요할 수 있습니다.",
      ],
    },
    {
      heading: "검증 메모 (목 프로바이더)",
      lines: [
        "이 문서는 실제 AI 호출 없이 로컬 검증용으로 생성되었습니다.",
        request
          ? `전달된 요청: ${request.slice(0, 200)}`
          : "전달된 요청이 비어 있었습니다.",
      ],
    },
  ];
}

function mockVariables(): SpecVariable[] {
  return [
    { key: "고객사명", label: "고객사명", sample: "(주)글로벌커머스", required: true },
    { key: "수신자", label: "수신 담당자", sample: "김철수 팀장", required: false },
    { key: "견적일", label: "견적일", sample: "2026. 08. 10", required: false },
    { key: "유효기간", label: "견적 유효기간", sample: "발행일로부터 30일", required: false },
    { key: "품목", label: "품목명", sample: "스탠다드 라이선스", required: true },
    { key: "수량", label: "수량", sample: "20", required: true },
    { key: "단가", label: "단가", sample: "180000", required: true },
  ];
}

// ===================== 스키마별 응답 =====================

function mockDocSpec(text: string): DocSpec {
  const request = userRequestOf(text);
  const client = clientNameOf(text) || "(주)예시커머스";
  const documentType = documentTypeOf(text);
  const today = todayOf(text);
  const isQuote = documentType === "QUOTE";

  return {
    title: `${client} ${isQuote ? "견적서" : "계약서"}`,
    documentType,
    headingText: isQuote ? "견 적 서" : "계 약 서",
    clientName: client,
    summary: `[목 프로바이더] ${client} 대상 ${isQuote ? "견적서" : "계약서"} 초안을 생성했습니다. 실제 AI 호출은 하지 않았습니다.`,
    clientFields: [
      { label: "고객사명", value: client },
      { label: "수신", value: "구매담당자님" },
      { label: isQuote ? "견적일" : "작성일", value: today },
      { label: isQuote ? "유효기간" : "계약기간", value: isQuote ? "발행일로부터 30일" : "12개월" },
    ],
    // 공급자 정보는 비워 둔다 — 양식이 있으면 양식 값이 그대로 보존되는지 확인하는 목적
    supplierFields: [],
    items: isQuote ? MOCK_ITEMS : [],
    summaryRows: isQuote ? VAT_SUMMARY_ROWS : [],
    notes: mockNotes(request),
  };
}

function mockTemplateSpec(text: string): TemplateSpec {
  const spec = mockDocSpec(text);
  return {
    ...spec,
    // 양식은 거래처별 값을 비워 둔다 (F-203 규칙)
    clientName: "",
    clientFields: spec.clientFields.map((field) => ({ ...field, value: "" })),
    summary: "[목 프로바이더] 표준 양식과 변수 필드를 세팅했습니다.",
    variables: mockVariables(),
  };
}

/**
 * 부분 재작성 목 응답.
 *
 * 프롬프트에 들어온 블록 id 를 실제로 골라 써야 applyRevision 이 변경을 반영하고
 * 새 버전이 만들어진다 → revise 경로 전체를 검증할 수 있다.
 */
function mockRevisionSpec(text: string): RevisionSpec {
  const instruction = userRequestOf(text) || "(지시 없음)";
  const blocks = blockOutlineOf(text);

  const textBlock = blocks.find((b) => b.label === "텍스트" || b.label === "대제목");
  const metaBlock = blocks.find((b) => b.label === "거래처·문서 메타");
  const itemBlock = blocks.find((b) => b.label.startsWith("품목표"));

  const stamp = `[목 수정] ${instruction}`;

  // 텍스트 블록이 있으면 그것을 고친다 (가장 안전한 변경)
  if (textBlock) {
    return {
      summary: `[목 프로바이더] 지시를 텍스트 블록에 반영했습니다: ${instruction}`,
      textEdits: [{ blockId: textBlock.id, text: stamp }],
      fieldEdits: [],
      itemTable: { blockId: itemBlock?.id ?? "", mode: "keep", rows: [], summaryRows: [] },
    };
  }

  // 없으면 거래처 메타의 첫 필드를 고친다
  if (metaBlock) {
    const label =
      text
        .split("\n")
        .find((line) => line.startsWith(`[${metaBlock.id}]`))
        ?.match(/:\s*([^=]+)=/)?.[1]
        ?.trim() ?? "고객사명";
    return {
      summary: `[목 프로바이더] 지시를 거래처 메타에 반영했습니다: ${instruction}`,
      textEdits: [],
      fieldEdits: [{ blockId: metaBlock.id, label, value: stamp }],
      itemTable: { blockId: itemBlock?.id ?? "", mode: "keep", rows: [], summaryRows: [] },
    };
  }

  // 마지막으로 품목표를 교체한다 (총액 재계산 경로 검증)
  if (itemBlock) {
    return {
      summary: `[목 프로바이더] 지시를 품목표에 반영했습니다: ${instruction}`,
      textEdits: [],
      fieldEdits: [],
      itemTable: {
        blockId: itemBlock.id,
        mode: "replace",
        rows: MOCK_ITEMS.map((item) => ({ ...item, quantity: item.quantity + 1 })),
        summaryRows: VAT_SUMMARY_ROWS,
      },
    };
  }

  // 고칠 블록이 없으면 changed:false 경로를 검증한다
  return {
    summary: "[목 프로바이더] 수정할 블록을 찾지 못했습니다. (changed:false 경로 검증)",
    textEdits: [],
    fieldEdits: [],
    itemTable: { blockId: "", mode: "keep", rows: [], summaryRows: [] },
  };
}

// ===================== 진입점 =====================

/** schemaName → 목 응답 생성기 */
const RESPONDERS: Record<string, (text: string) => unknown> = {
  document_spec: mockDocSpec,
  template_spec: mockTemplateSpec,
  template_variables: () => ({ variables: mockVariables() }),
  revision_spec: mockRevisionSpec,
};

export async function callMock(call: StructuredCall): Promise<StructuredResult> {
  // 프로덕션에서는 절대 목 응답이 나가지 않게 막는다.
  // (가짜 견적서가 고객에게 발송되는 사고를 코드로 차단한다)
  if (process.env.NODE_ENV === "production") {
    throw new AiNotConfiguredError(
      "목(mock) AI 프로바이더는 개발 환경에서만 사용할 수 있습니다. AI_PROVIDER 를 anthropic 또는 openai 로 설정해주세요.",
    );
  }

  const responder = call.schemaName ? RESPONDERS[call.schemaName] : undefined;
  if (!responder) {
    throw new AiGenerationError(
      `목 프로바이더가 처리할 수 없는 요청입니다. (schemaName=${call.schemaName ?? "없음"})`,
    );
  }

  const text = promptText(call.content);
  const value = responder(text);

  return {
    raw: JSON.stringify(value),
    model: MOCK_MODEL,
    usage: { inputTokens: 0, outputTokens: 0, cacheReadInputTokens: 0 },
  };
}
