"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { FolderOpen } from "lucide-react";
import { Button } from "@/components/ui/button";
import { FolderBatchPanel } from "./folder-batch-panel";

type Payload = {
  folderName: string;
  fileNames: string[];
  saveAsCommon: boolean;
};

/** 새 문서 생성에서 폴더 드롭 시 sessionStorage 로 넘긴 변환 대상을 읽어 렌더한다. */
export function BatchConvertClient() {
  const router = useRouter();
  const processedRef = useRef(false);
  const [state, setState] = useState<{ ready: boolean; payload: Payload | null }>(
    { ready: false, payload: null },
  );

  useEffect(() => {
    if (processedRef.current) return; // StrictMode 중복 실행 시 데이터 소실 방지
    processedRef.current = true;
    let payload: Payload | null = null;
    try {
      const raw = sessionStorage.getItem("batch-convert");
      if (raw) {
        const parsed = JSON.parse(raw) as Payload;
        if (parsed && Array.isArray(parsed.fileNames) && parsed.fileNames.length) {
          payload = {
            folderName:
              typeof parsed.folderName === "string" && parsed.folderName
                ? parsed.folderName
                : "가져온 양식",
            fileNames: parsed.fileNames.filter((n) => typeof n === "string"),
            saveAsCommon: parsed.saveAsCommon === true,
          };
        }
      }
      // 1회 소비 후 제거 (뒤로 갔다 와도 재변환하지 않도록)
      sessionStorage.removeItem("batch-convert");
    } catch {
      /* 무시 */
    }
    // 외부 저장소(sessionStorage) 1회 소비 — 마운트 후 상태 확정
    setState({ ready: true, payload });
  }, []);

  if (!state.ready) return null;

  if (!state.payload) {
    return (
      <div className="mx-auto flex max-w-2xl flex-col items-center gap-3 rounded-lg border border-dashed py-20 text-center">
        <FolderOpen className="size-10 text-muted-foreground" />
        <p className="text-sm text-muted-foreground">
          변환할 폴더가 없습니다. 새 문서 생성에서 파일 첨부 영역에 폴더를 끌어다
          놓아 주세요.
        </p>
        <Button asChild>
          <Link href="/generator">새 문서 생성으로</Link>
        </Button>
      </div>
    );
  }

  return (
    <FolderBatchPanel
      folderName={state.payload.folderName}
      fileNames={state.payload.fileNames}
      saveAsCommon={state.payload.saveAsCommon}
      onRestart={() => router.push("/generator")}
    />
  );
}
