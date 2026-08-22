"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import {
  Sparkles,
  Target,
  FolderOpen,
  Paperclip,
  ReceiptText,
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
import { DOCUMENT_TYPES, DOCUMENT_TYPE_LABELS } from "@/lib/constants";
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
import { ModeChoice } from "./mode-choice";
import { SelectionChips, ToolbarButton } from "./composer-toolbar";
import { PromptExamples } from "./prompt-examples";
import { TemplatePicker } from "./template-picker";
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

  /** 툴바 버튼에 적을 현재 모델 이름 — 무엇으로 만들지가 누르기 전에 보여야 한다 */
  const modelLabel = models.find((m) => m.id === model)?.label ?? "AI 모델";

  /** 지금 AI 에게 함께 주는 것들 — 툴바가 접혀 있어도 이 줄에서 보인다 */
  const chips = [
    ...files.map((file, index) => ({
      id: `file-${file.name}-${index}`,
      icon: Paperclip,
      label: file.name,
      onRemove: () => setFiles(files.filter((_, i) => i !== index)),
      removeLabel: `${file.name} 첨부 해제`,
    })),
    ...(folderAttach
      ? [
          {
            id: "folder",
            icon: FolderOpen,
            label: `${folderAttach.name} (${folderAttach.fileNames.length}개 파일)`,
            onRemove: () => setFolderAttach(null),
            removeLabel: "폴더 첨부 해제",
          },
        ]
      : []),
    ...selectedRefs.map((doc) => ({
      id: `ref-${doc.id}`,
      icon: FolderOpen,
      label: doc.title,
      onRemove: () => setRefIds(refIds.filter((x) => x !== doc.id)),
      removeLabel: `${doc.title} 참고 해제`,
    })),
    ...(showQuoteSource && sourceQuoteId !== NO_TEMPLATE
      ? [
          {
            id: "quote",
            icon: ReceiptText,
            label:
              confirmedQuotes.find((q) => q.id === sourceQuoteId)?.title ??
              "확정 견적서",
            onRemove: () => setSourceQuoteId(NO_TEMPLATE),
            removeLabel: "확정 견적서 해제",
          },
        ]
      : []),
  ];

  return (
    /*
     * 컴포저 중심 배치 — 지시문이 주인공이고 부수 입력은 그 아래 한 줄이다.
     *
     * 예전에는 번호 붙은 섹션 네 개(무엇을·누구에게·무엇을 보고·무엇을 지시)가 세로로
     * 쌓여 있었다. 다섯 가지 입력이 늘 펼쳐져 있어 지시문 칸이 화면 아래로 밀렸고,
     * 정작 대부분의 생성은 **아무 것도 붙이지 않고 지시문만 적는다**. 매번 쓰는 것이
     * 가장 가까이 있어야 한다 — 그래서 지시문을 위로 올리고 나머지를 툴바로 접었다.
     * 접은 것은 감춘 것이 아니다: 고른 값은 툴바 아래 칩으로 남는다.
     */
    <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_17rem] lg:items-start">
      <div className="min-w-0 space-y-4">
        {/*
         * 어느 기회에 붙을 문서인지 **먼저** 알린다 (기회-2) — 만들고 나서야 알게 되면 늦다.
         * 칩이 아니라 띠인 이유는, 기회에서 들어온 사용자가 되돌아갈 길도 함께 필요하기
         * 때문이다. 기회를 바꾸거나 떼는 것은 툴바의 `거래처` 팝오버 한 곳에서 한다.
         */}
        {selectedOpportunity ? (
          <div className="flex flex-wrap items-center gap-x-2 gap-y-1 rounded-lg border bg-muted/30 px-3 py-2 text-sm">
            <Target className="size-4 shrink-0 text-primary" aria-hidden="true" />
            <span className="min-w-0">
              <span className="font-medium">{selectedOpportunity.name}</span>
              <span className="text-muted-foreground">
                {" "}
                · {selectedOpportunity.accountName}
              </span>
            </span>
            <span className="text-xs text-muted-foreground">
              이 기회에 연결할 문서를 만듭니다.
            </span>
            <Link
              href={`/opportunities/${selectedOpportunity.id}`}
              className="ml-auto shrink-0 rounded text-xs text-muted-foreground transition-colors hover:text-primary hover:underline focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
            >
              기회로 돌아가기
            </Link>
          </div>
        ) : null}

        <div className="rounded-xl border bg-card p-4 shadow-sm sm:p-5">
          <div className="space-y-4">
            {/*
             * 생성 방식이 맨 위다 — 빈 문서와 양식 기반은 AI 에게 주는 것과 결과물이
             * 달라서, 지시문을 적기 전에 정해져 있어야 한다.
             */}
            <ModeChoice
              mode={mode}
              onModeChange={changeMode}
              templateCount={templates.length}
              disabled={isSubmitting}
            />

            {/* 방식에 따라 이 자리의 입력이 바뀐다 — 같은 것을 두 번 묻지 않는다 */}
            {mode === "template" ? (
              <TemplatePicker
                templates={templates}
                value={templateId === NO_TEMPLATE ? null : templateId}
                onChange={setTemplateId}
                disabled={isSubmitting}
              />
            ) : (
              <div className="flex flex-wrap items-center gap-2">
                <Label htmlFor="type-select" className="text-xs text-muted-foreground">
                  문서 종류
                </Label>
                <Select
                  value={documentType}
                  onValueChange={setDocumentType}
                  disabled={isSubmitting}
                >
                  <SelectTrigger id="type-select" size="sm" className="w-44">
                    <SelectValue placeholder="AI 가 판단" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value={AUTO_TYPE}>AI 가 판단</SelectItem>
                    {DOCUMENT_TYPES.map((type) => (
                      <SelectItem key={type} value={type}>
                        {DOCUMENT_TYPE_LABELS[type]}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            )}

            <div className="space-y-1">
              <Textarea
                value={prompt}
                onChange={(e) => setPrompt(e.target.value.slice(0, MAX_LENGTH))}
                maxLength={MAX_LENGTH}
                disabled={isSubmitting}
                aria-label="문서 생성 지시문"
                placeholder={
                  mode === "template"
                    ? "이번 건에서 달라지는 점만 적으시면 됩니다. 예: 라이선스 30명, 1년 계약"
                    : "만들고 싶은 문서를 자연어로 적어주세요. 예: A사에 서버 5대와 유지보수 1년 포함한 견적서"
                }
                className="min-h-44 resize-y text-base"
              />
              <span className="block text-right text-xs tabular-nums text-muted-foreground">
                {prompt.length.toLocaleString("ko-KR")} /{" "}
                {MAX_LENGTH.toLocaleString("ko-KR")}
              </span>
            </div>

            {/* 부수 입력 한 줄 — 자리를 미리 잡지 않고 누를 때 펼친다 */}
            <div className="flex flex-wrap items-center gap-2">
              <ToolbarButton
                label="거래처"
                icon={Target}
                count={selectedOpportunity ? 1 : 0}
                disabled={isSubmitting}
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
              </ToolbarButton>

              <ToolbarButton
                label="파일"
                icon={Paperclip}
                count={files.length + (folderAttach ? 1 : 0)}
                disabled={isSubmitting}
              >
                <AttachmentFields
                  files={files}
                  setFiles={setFiles}
                  folderAttach={folderAttach}
                  setFolderAttach={setFolderAttach}
                  isSubmitting={isSubmitting}
                />
              </ToolbarButton>

              <DocumentPicker
                documents={libraryDocuments}
                selectedIds={refIds}
                onConfirm={setRefIds}
                disabled={isSubmitting}
                triggerLabel={
                  refIds.length > 0 ? `참고 문서 ${refIds.length}` : "참고 문서"
                }
                triggerClassName="h-9"
              />

              {/* 계약서를 만들 때만 의미가 있는 입력이다 (F-213) — 그때만 나타난다 */}
              {showQuoteSource ? (
                <ToolbarButton
                  label="확정 견적서"
                  icon={ReceiptText}
                  count={sourceQuoteId === NO_TEMPLATE ? 0 : 1}
                  disabled={isSubmitting}
                >
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
                            {quote.title} · v{quote.version} ·{" "}
                            {formatKRW(quote.amount)}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <p className="text-xs text-muted-foreground">
                      고르신 견적서의 품목·금액을 그대로 계약 조건에 반영합니다.
                    </p>
                  </div>
                </ToolbarButton>
              ) : null}

              <div className="ml-auto flex items-center gap-2">
                <ToolbarButton
                  label={modelLabel}
                  icon={Sparkles}
                  disabled={isSubmitting}
                  contentClassName="w-[20rem]"
                >
                  <AiModelSelect
                    models={models}
                    value={model}
                    onChange={setModel}
                    disabled={isSubmitting}
                    mock={mockProvider}
                  />
                </ToolbarButton>
                <Button
                  onClick={handleGenerate}
                  disabled={!prompt.trim() || isSubmitting}
                >
                  {isSubmitting ? (
                    <Loader2 className="size-4 animate-spin" />
                  ) : (
                    <Sparkles className="size-4" />
                  )}
                  {isSubmitting ? "생성 중…" : "초안 생성"}
                </Button>
              </div>
            </div>

            <SelectionChips items={chips} />
          </div>
        </div>

        <p className="text-xs text-muted-foreground">
          입력하신 내용은 문서를 만드는 데만 쓰이며 AI 학습에 사용되지 않습니다.
        </p>
      </div>

      <PromptExamples
        examples={EXAMPLES}
        onPick={setPrompt}
        hasDraft={prompt.trim().length > 0}
        disabled={isSubmitting}
      />
    </div>
  );
}
