"use client";

import {
  type ChangeEvent,
  useDeferredValue,
  useEffect,
  useRef,
  useState,
} from "react";
import { Upload, Code, MousePointerClick } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import {
  MAX_SIGNATURE_FILE_BYTES,
  MAX_SIGNATURE_LENGTH,
} from "@/lib/constants";
import { isHtmlSignature } from "@/lib/signature";
import { SignaturePreview } from "@/components/signature-preview";
import { SignatureHtmlEditor } from "@/components/signature-html-editor";

type EditMode = "wysiwyg" | "source";

/**
 * 메일 서명 편집 폼.
 * - 텍스트/HTML 직접 입력·붙여넣기, .html 파일 업로드로 채운다.
 * - HTML 서명은 기본적으로 미리보기에서 값을 직접 수정(WYSIWYG)하며,
 *   'HTML 직접 편집'으로 소스 편집으로 전환할 수 있다.
 * - 미저장 변경이 있으면 브라우저 이탈 시 경고한다(beforeunload).
 */
export function SignatureForm({
  initialSignature,
}: {
  initialSignature: string;
}) {
  const [signature, setSignature] = useState(() => initialSignature);
  const [saved, setSaved] = useState(() => initialSignature);
  const [isSaving, setIsSaving] = useState(false);
  const [editMode, setEditMode] = useState<EditMode>(() =>
    isHtmlSignature(initialSignature) ? "wysiwyg" : "source",
  );
  // 에디터에 실린 HTML. 인라인 편집(setSignature)은 이 값을 바꾸지 않으므로
  // srcDoc 이 그대로라 iframe 이 리로드되지 않는다. 내용 교체 시에만 함께 갱신한다.
  const [frozenHtml, setFrozenHtml] = useState(() => initialSignature);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const isDirty = signature !== saved;
  const isHtml = isHtmlSignature(signature);
  const showWysiwyg = isHtml && editMode === "wysiwyg";
  const previewSignature = useDeferredValue(signature);

  // 미저장 변경 이탈 경고 (새로고침·탭 닫기·주소 이동). 정책 STATE_*.
  useEffect(() => {
    if (!isDirty) return;
    const handler = (event: BeforeUnloadEvent) => {
      event.preventDefault();
      event.returnValue = "";
    };
    window.addEventListener("beforeunload", handler);
    return () => window.removeEventListener("beforeunload", handler);
  }, [isDirty]);

  /** 내용을 통째로 교체 (업로드·모드 전환) → 에디터 재렌더(srcDoc 갱신) */
  const applyValue = (value: string) => {
    setFrozenHtml(value);
    setSignature(value);
  };

  const toggleEditMode = () => {
    if (editMode === "wysiwyg") {
      setEditMode("source");
    } else {
      applyValue(signature); // 편집된 소스로 미리보기 에디터 재구성
      setEditMode("wysiwyg");
    }
  };

  const handleFile = async (e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = ""; // 같은 파일 재선택 가능하도록 초기화
    if (!file) return;

    const name = file.name.toLowerCase();
    const isHtmlFile =
      file.type === "text/html" ||
      name.endsWith(".html") ||
      name.endsWith(".htm");
    if (!isHtmlFile) {
      toast.error("HTML 파일(.html)만 올릴 수 있습니다.");
      return;
    }
    if (file.size > MAX_SIGNATURE_FILE_BYTES) {
      toast.error(
        `파일이 너무 큽니다. 서명은 ${MAX_SIGNATURE_LENGTH.toLocaleString()}자 이내여야 합니다.`,
      );
      return;
    }

    try {
      const text = await file.text();
      if (text.length > MAX_SIGNATURE_LENGTH) {
        toast.error(
          `서명은 ${MAX_SIGNATURE_LENGTH.toLocaleString()}자 이내여야 합니다.`,
        );
        return;
      }
      applyValue(text);
      setEditMode(isHtmlSignature(text) ? "wysiwyg" : "source");
      toast.success(
        `"${file.name}" 서명을 불러왔습니다. 확인 후 저장해주세요.`,
      );
    } catch {
      toast.error("파일을 읽지 못했습니다.");
    }
  };

  const handleSave = async () => {
    setIsSaving(true);
    try {
      const res = await fetch("/api/signature", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ signature }),
      });
      const json = await res.json().catch(() => null);
      if (!res.ok || !json) {
        toast.error(json?.error ?? "저장에 실패했습니다.");
        return;
      }
      const next = (json.data?.signature as string) ?? "";
      setFrozenHtml(next);
      setSignature(next);
      setSaved(next);
      toast.success("메일 서명을 저장했습니다.");
    } catch {
      toast.error("저장에 실패했습니다.");
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <span className="text-sm font-medium">서명 내용</span>
        <div className="flex items-center gap-2">
          {isHtml ? (
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={toggleEditMode}
            >
              {editMode === "wysiwyg" ? (
                <>
                  <Code className="size-3.5" />
                  HTML 직접 편집
                </>
              ) : (
                <>
                  <MousePointerClick className="size-3.5" />
                  미리보기에서 편집
                </>
              )}
            </Button>
          ) : null}
          <input
            ref={fileInputRef}
            type="file"
            accept=".html,.htm,text/html"
            aria-label="HTML 서명 파일 선택"
            className="sr-only"
            onChange={handleFile}
          />
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => fileInputRef.current?.click()}
          >
            <Upload className="size-3.5" />
            HTML 파일 올리기
          </Button>
        </div>
      </div>

      {showWysiwyg ? (
        <>
          <SignatureHtmlEditor html={frozenHtml} onChange={setSignature} />
          <p className="text-xs text-muted-foreground">
            서명에서 텍스트를 클릭해 이름·연락처 등 값을 직접 수정할 수
            있습니다. HTML 소스를 고치려면 &lsquo;HTML 직접 편집&rsquo;을
            누르세요.
          </p>
        </>
      ) : (
        <>
          <Textarea
            id="signature"
            value={signature}
            maxLength={MAX_SIGNATURE_LENGTH}
            aria-label="메일 서명"
            className="min-h-32 font-mono text-xs"
            placeholder="일반 텍스트 또는 HTML 서명을 입력·붙여넣으세요.&#10;예) 홍길동 | 영업팀&#10;SpecFlow AI&#10;010-1234-5678"
            onChange={(e) => setSignature(e.target.value)}
          />
          <p className="text-xs text-muted-foreground">
            직접 입력·붙여넣거나 <b>HTML 파일(.html)</b>을 올릴 수 있습니다.
            {isHtml
              ? " 아래 미리보기로 결과를 확인하세요."
              : " HTML 서명은 미리보기에서 값을 직접 수정할 수도 있습니다."}
          </p>

          {isHtml && previewSignature.trim() ? (
            <div className="space-y-1.5">
              <p className="text-xs font-medium text-muted-foreground">
                미리보기
              </p>
              <div className="rounded-lg border bg-muted/30 p-3">
                <SignaturePreview signature={previewSignature} />
              </div>
            </div>
          ) : null}
        </>
      )}

      <div className="flex items-center justify-end gap-3">
        {isDirty ? (
          <span className="text-xs text-muted-foreground" role="status">
            저장되지 않은 변경사항이 있습니다
          </span>
        ) : null}
        <Button onClick={handleSave} disabled={isSaving || !isDirty}>
          {isSaving ? "저장 중…" : "서명 저장"}
        </Button>
      </div>
    </div>
  );
}
