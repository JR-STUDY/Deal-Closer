import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { PageHeader } from "@/components/page-header";
import { Button } from "@/components/ui/button";
import { BatchConvertClient } from "./_components/batch-convert-client";

export default function BatchConvertPage() {
  return (
    <>
      <PageHeader
        title="양식 일괄 변환"
        description="업로드한 폴더의 양식들을 문서로 변환합니다."
        actions={
          <Button asChild variant="outline">
            <Link href="/generator">
              <ArrowLeft className="size-4" />
              새 문서 생성
            </Link>
          </Button>
        }
      />

      <div className="flex-1 overflow-auto p-8">
        <BatchConvertClient />
      </div>
    </>
  );
}
