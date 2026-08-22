"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import {
  Sparkles,
  MessageSquareText,
  Target,
  X,
  FolderOpen,
  Loader2,
} from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { DocTypeBadge } from "@/components/status-badge";
import { formatKRW } from "@/lib/format";
import { DocumentPicker, type LibraryDoc } from "./document-picker";
import { AiModelSelect } from "@/components/ai-model-select";
import type { AiModelOption } from "@/lib/ai/models";
import type {
  ConfirmedQuote,
  GenerateMode,
  OpportunityChoice,
  TemplateChoice,
} from "./types";
import { AttachmentFields } from "./attachment-fields";
import { DocumentKindFields } from "./document-kind-fields";
import { FormSection } from "./form-section";
import { TargetFields } from "./target-fields";

export type { ConfirmedQuote, OpportunityChoice, TemplateChoice } from "./types";




/** 문서 종류 미지정 = AI 가 프롬프트를 보고 판단 */
const AUTO_TYPE = "AUTO";
/** 양식 미선택 = 양식 없이 새로 구성 */
const NO_TEMPLATE = "NONE";

const MAX_LENGTH = 2000;

/** 데모 일괄 변환 시나리오를 트리거하는 예시 프롬프트 (폴더 첨부와 함께 사용) */
const FOLDER_SCENARIO_PROMPT =
  "이전에 쓰던 견적서 양식을 첨부해, 같은 형식으로 새로 만들어줘 (파일 첨부)";

const EXAMPLES = [
  "A사에 서버 인스턴스 5대와 유지보수 1년 포함한 견적서",
  "협력사 견적서 기준으로 마진 20%를 붙인 견적서 (파일 첨부)",
  FOLDER_SCENARIO_PROMPT,
];

/** AI 대화형 문서 생성기 입력 폼 (클라이언트 전용 상태) */
export function GeneratorForm({
  libraryDocuments,
  templates,
  confirmedQuotes,
  initialTemplateId,
  models,
  defaultModel,
  mockProvider,
  opportunities,
  initialOpportunityId,
}: {
  libraryDocuments: LibraryDoc[];
  templates: TemplateChoice[];
  confirmedQuotes: ConfirmedQuote[];
  /** 표준 양식 화면에서 넘어온 경우 미리 선택할 양식 (?template=) */
  initialTemplateId?: string | null;
  /** 선택 가능한 AI 모델 (키가 설정된 프로바이더만) */
  models: AiModelOption[];
  defaultModel: string;
  /** 목 프로바이더로 동작 중 */
  mockProvider: boolean;
  /** 문서를 붙일 수 있는 진행 중 기회 (F-212). 고르면 CRM 거래처 정보가 AI 에 그대로 간다 */
  opportunities: OpportunityChoice[];
  /**
   * 기회 상세에서 "문서 작성"으로 들어온 경우 미리 선택할 기회 (`?opportunityId=`, 기회-2).
   * 서버가 후보 목록 안에 있는지 확인한 값만 내려온다.
   */
  initialOpportunityId?: string | null;
}) {
  const router = useRouter();
  const [prompt, setPrompt] = useState("");
  // 문서 설정 (F-211 · F-213)
  const [templateId, setTemplateId] = useState<string>(
    initialTemplateId ?? NO_TEMPLATE,
  );
  // 생성 플로우는 둘로 나뉜다: 새로 작성 / 표준 양식으로 (F-211 · F-212)
  // 양식이 미리 지정돼 들어오면(?template=) 양식 모드로 연다.
  const [mode, setMode] = useState<GenerateMode>(
    initialTemplateId ? "template" : "blank",
  );
  const [documentType, setDocumentType] = useState<string>(AUTO_TYPE);
  const [model, setModel] = useState<string>(defaultModel);
  // 기회 연결은 선택 — 고르지 않으면 "기회 미연결" 빠른 초안이 된다
  const [opportunityId, setOpportunityId] = useState<string>(
    initialOpportunityId ?? NO_TEMPLATE,
  );
  const selectedOpportunity =
    opportunityId === NO_TEMPLATE
      ? null
      : (opportunities.find((o) => o.id === opportunityId) ?? null);
  const [sourceQuoteId, setSourceQuoteId] = useState<string>(NO_TEMPLATE);
  const [clientName, setClientName] = useState("");
  const [clientContact, setClientContact] = useState("");
  const [clientEmail, setClientEmail] = useState("");
  const [files, setFiles] = useState<File[]>([]);
  const [folderAttach, setFolderAttach] = useState<{
    name: string;
    fileNames: string[];
  } | null>(null);
  const [refIds, setRefIds] = useState<string[]>([]);
  const [isSubmitting, setIsSubmitting] = useState(false);

  // 선택된 참고 문서 (id → 원본 메타)
  const selectedRefs = refIds
    .map((id) => libraryDocuments.find((d) => d.id === id))
    .filter((d): d is LibraryDoc => Boolean(d));

  // 양식 모드가 아니면 양식은 적용하지 않는다 (모드와 전송값이 어긋나지 않게)
  const selectedTemplate =
    mode !== "template" || templateId === NO_TEMPLATE
      ? null
      : (templates.find((t) => t.id === templateId) ?? null);

  const changeMode = (next: GenerateMode) => {
    setMode(next);
    // 새로 작성으로 돌아가면 양식 선택을 비운다 — 숨은 채로 적용되면 사용자가 알 수 없다
    if (next === "blank") setTemplateId(NO_TEMPLATE);
  };

  // 양식을 고르면 그 양식의 문서 종류를 따른다 (수동 선택이 있으면 그 값 우선)
  const effectiveType =
    documentType !== AUTO_TYPE ? documentType : (selectedTemplate?.type ?? AUTO_TYPE);

  // 확정 견적서 소스 선택은 계약서를 만들 때만 의미가 있다 (F-213)
  const showQuoteSource =
    effectiveType === "CONTRACT" && confirmedQuotes.length > 0;


  /** 폴더명+파일명을 세션에 담고 데모 변환 페이지로 이동 */
  const goToBatch = (folderName: string, fileNames: string[]) => {
    try {
      sessionStorage.setItem(
        "batch-convert",
        JSON.stringify({
          folderName: folderName || "가져온 양식",
          fileNames,
        }),
      );
    } catch {
      /* 세션 저장 실패는 무시 */
    }
    router.push("/generator/batch");
  };

  const handleGenerate = async () => {
    if (!prompt.trim() || isSubmitting) return;

    // 데모 트리거: 폴더가 첨부됐고 프롬프트가 지정 예시면 → 목업 일괄 변환 시나리오
    if (folderAttach && prompt.trim() === FOLDER_SCENARIO_PROMPT) {
      goToBatch(folderAttach.name, folderAttach.fileNames);
      return;
    }

    setIsSubmitting(true);

    const formData = new FormData();
    formData.append("prompt", prompt.trim());
    for (const file of files) {
      formData.append("files", file);
    }
    for (const id of refIds) {
      formData.append("referenceIds", id);
    }
    // 표준 양식 불러오기 (F-211)
    if (mode === "template" && templateId !== NO_TEMPLATE) {
      formData.append("templateId", templateId);
    }
    if (effectiveType !== AUTO_TYPE) {
      formData.append("documentType", effectiveType);
    }
    // 확정 견적서를 소스로 계약서 생성 (F-213)
    if (showQuoteSource && sourceQuoteId !== NO_TEMPLATE) {
      formData.append("sourceDocumentId", sourceQuoteId);
    }
    if (model) formData.append("model", model);
    // 고른 기회에 문서를 연결한다 (기회-2 · F-212).
    // 연결 여부·권한은 서버가 orgId 로 다시 확인한다 — 여기 값은 그대로 믿지 않는다.
    if (opportunityId !== NO_TEMPLATE) {
      formData.append("opportunityId", opportunityId);
    }
    if (clientName.trim()) formData.append("clientName", clientName.trim());
    if (clientContact.trim()) formData.append("clientContact", clientContact.trim());
    if (clientEmail.trim()) formData.append("clientEmail", clientEmail.trim());

    try {
      const res = await fetch("/api/generate", {
        method: "POST",
        body: formData,
      });
      const json = await res.json().catch(() => null);

      if (!res.ok) {
        toast.error(json?.error ?? "문서 생성에 실패했습니다.");
        setIsSubmitting(false);
        return;
      }

      const documentId: string | undefined = json?.data?.document?.id;
      if (!documentId) {
        toast.error("생성된 문서를 찾을 수 없습니다.");
        setIsSubmitting(false);
        return;
      }

      // 생성 요약(무엇을 어떻게 만들었는지)을 그대로 보여준다.
      // 실제로 연결됐는지는 서버 응답으로 판단한다 — 요청에 실어 보낸 값이 아니라
      // 서버가 확인해 되돌려준 값이라야 "연결됐다"고 말할 수 있다.
      const linkedOpportunityId: string | null =
        json?.data?.opportunityId ?? null;
      const summary: string = json?.data?.summary ?? "AI 초안을 생성했습니다.";
      toast.success(
        linkedOpportunityId && selectedOpportunity
          ? `${summary} ‘${selectedOpportunity.name}’ 기회에 연결했습니다.`
          : summary,
      );
      router.push(`/editor/${documentId}`);
      // 성공 시 페이지 이동하므로 isSubmitting 을 유지해 중복 제출을 막는다.
    } catch {
      toast.error("네트워크 오류로 생성에 실패했습니다.");
      setIsSubmitting(false);
    }
  };

  return (
    <div className="mx-auto flex max-w-2xl flex-col gap-6">
      {/* 어느 기회에 붙을 문서인지 먼저 알린다 (기회-2) — 만들고 나서야 알게 되면 늦다 */}
      {selectedOpportunity ? (
        <div className="flex flex-wrap items-center gap-x-2 gap-y-1 rounded-md border bg-muted/30 px-4 py-3 text-sm">
          <Target className="size-4 shrink-0 text-primary" aria-hidden="true" />
          <span>
            <span className="font-medium">{selectedOpportunity.name}</span>
            <span className="text-muted-foreground">
              {" "}
              · {selectedOpportunity.accountName}
            </span>
          </span>
          <span className="text-muted-foreground">
            기회에 연결할 문서를 만듭니다.
          </span>
          <Link
            href={`/opportunities/${selectedOpportunity.id}`}
            className="ml-auto shrink-0 rounded text-xs text-muted-foreground transition-colors hover:text-primary hover:underline focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
          >
            기회로 돌아가기
          </Link>
        </div>
      ) : null}

      <Card>
        <CardHeader className="items-center text-center">
          <CardTitle className="text-xl">
            어떤 문서를 만들어 드릴까요?
          </CardTitle>
          <CardDescription className="max-w-lg text-pretty">
            입력하신 데이터는 안전하게 보호되며, AI 학습에 사용되지 않습니다.
            <br />
            자연어로 필요하신 내용을 자유롭게 적어주세요.
          </CardDescription>
        </CardHeader>
        {/*
          * 한 화면 · 네 섹션이다 (위저드로 나누지 않는다 — 네 값이 서로를 바꾼다:
          * 양식 → 문서 종류 → 확정 견적서 노출까지 이어진다).
          * 묶음의 뜻은 `form-section.tsx` 주석에 적어 두었다.
          */}
        <CardContent className="space-y-5">
          <FormSection
            step={1}
            title="무엇을 만드는가"
            description="새로 작성하거나, 우리 팀의 표준 양식을 불러와 채웁니다."
          >
            <DocumentKindFields
              mode={mode}
              onModeChange={changeMode}
              templates={templates}
              templateId={templateId === NO_TEMPLATE ? null : templateId}
              onTemplateChange={setTemplateId}
              documentType={documentType}
              onDocumentTypeChange={setDocumentType}
              autoType={AUTO_TYPE}
              disabled={isSubmitting}
            />
          </FormSection>

          <FormSection
            step={2}
            title="누구에게 보내는 문서인가"
            description="영업 기회를 고르면 거래처 정보를 CRM 에서 그대로 가져옵니다."
          >
            <TargetFields
              opportunities={opportunities}
              opportunityId={opportunityId}
              onOpportunityChange={setOpportunityId}
              selectedOpportunity={selectedOpportunity}
              noOpportunityValue={NO_TEMPLATE}
              clientName={clientName}
              onClientNameChange={setClientName}
              clientContact={clientContact}
              onClientContactChange={setClientContact}
              clientEmail={clientEmail}
              onClientEmailChange={setClientEmail}
              disabled={isSubmitting}
            />
          </FormSection>

          <FormSection
            step={3}
            title="무엇을 보고 만드는가"
            description="근거가 되는 문서·파일을 주면 그 값을 최우선으로 씁니다. 없어도 됩니다."
          >
            {/* 계약서: 확정된 견적서를 소스로 지정 (F-213) */}
            {showQuoteSource && (
              <div className="space-y-1.5">
                <Label htmlFor="quote-select" className="text-xs">
                  근거가 되는 확정 견적서
                </Label>
                <Select
                  value={sourceQuoteId}
                  onValueChange={setSourceQuoteId}
                  disabled={isSubmitting}
                >
                  <SelectTrigger id="quote-select" className="w-full">
                    <SelectValue placeholder="선택 안 함" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value={NO_TEMPLATE}>선택 안 함</SelectItem>
                    {confirmedQuotes.map((quote) => (
                      <SelectItem key={quote.id} value={quote.id}>
                        {quote.title} · v{quote.version} · {formatKRW(quote.amount)}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <p className="text-xs text-muted-foreground">
                  선택한 견적서의 품목·금액을 그대로 계약 조건에 반영합니다.
                </p>
              </div>
            )}

            <AttachmentFields
              files={files}
              setFiles={setFiles}
              folderAttach={folderAttach}
              setFolderAttach={setFolderAttach}
              isSubmitting={isSubmitting}
            />

            {/* 문서 보관함 참고 문서 (기존 견적서 등) */}
            <DocumentPicker
              documents={libraryDocuments}
              selectedIds={refIds}
              onConfirm={setRefIds}
              disabled={isSubmitting}
            />

            {selectedRefs.length > 0 && (
              <ul className="space-y-1.5">
                {selectedRefs.map((doc) => (
                  <li
                    key={doc.id}
                    className="flex min-h-11 items-center gap-2 rounded-md border bg-muted/30 px-3 py-1.5 text-sm"
                  >
                    <FolderOpen className="size-4 shrink-0 text-muted-foreground" />
                    <span className="flex-1 truncate" title={doc.title}>
                      {doc.title}
                    </span>
                    <DocTypeBadge type={doc.type} />
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      className="size-9 shrink-0"
                      disabled={isSubmitting}
                      aria-label={`${doc.title} 참고 해제`}
                      onClick={() =>
                        setRefIds((prev) => prev.filter((x) => x !== doc.id))
                      }
                    >
                      <X className="size-4" />
                    </Button>
                  </li>
                ))}
              </ul>
            )}
          </FormSection>

          {/*
            * ④ 지시문은 **마지막**이다 — 위 세 섹션이 정해진 뒤에 "이번 건에서 달라지는
            * 점"을 적는 자리이고(양식 모드의 안내 문구가 그렇게 말한다), 생성 버튼이
            * 바로 아래 있어야 마지막으로 읽은 것과 누르는 것이 이어진다.
            */}
          <FormSection
            step={4}
            title="무엇을 지시하는가"
            description="자연어로 적어 주세요. 모델을 고른 뒤 생성을 시작합니다."
          >
            <Textarea
              value={prompt}
              onChange={(e) => setPrompt(e.target.value.slice(0, MAX_LENGTH))}
              maxLength={MAX_LENGTH}
              disabled={isSubmitting}
              aria-label="문서 생성 지시문"
              placeholder={
                mode === "template"
                  ? "예: 라이선스 30명, 1년 계약으로 채워줘 (이번 건에서 달라지는 점만 적으면 됩니다)"
                  : "예: 협력사에게 받은 견적서에 마진 20%를 붙여서 견적서를 만들어줘"
              }
              className="min-h-40 resize-none text-base"
            />
            <span className="block text-right text-xs tabular-nums text-muted-foreground">
              {prompt.length.toLocaleString("ko-KR")} /{" "}
              {MAX_LENGTH.toLocaleString("ko-KR")}
            </span>

            <AiModelSelect
              models={models}
              value={model}
              onChange={setModel}
              disabled={isSubmitting}
              mock={mockProvider}
            />

            <Button
              className="w-full"
              onClick={handleGenerate}
              disabled={!prompt.trim() || isSubmitting}
            >
              {isSubmitting ? (
                <Loader2 className="size-4 animate-spin" />
              ) : (
                <Sparkles className="size-4" />
              )}
              {isSubmitting ? "생성 중…" : "AI 초안 생성 시작"}
            </Button>
          </FormSection>
        </CardContent>
      </Card>

      <div>
        <p className="mb-3 flex items-center gap-1.5 text-sm font-medium text-muted-foreground">
          <MessageSquareText className="size-4" />
          이렇게 말해보세요
        </p>
        <div className="grid gap-3 sm:grid-cols-3">
          {EXAMPLES.map((example) => (
            <Card
              key={example}
              role="button"
              tabIndex={0}
              onClick={() => setPrompt(example)}
              onKeyDown={(e) => {
                if (e.key === "Enter" || e.key === " ") {
                  e.preventDefault();
                  setPrompt(example);
                }
              }}
              className="cursor-pointer transition-colors hover:bg-muted/50"
            >
              <CardContent className="text-sm leading-relaxed">
                {example}
              </CardContent>
            </Card>
          ))}
        </div>
      </div>
    </div>
  );
}
