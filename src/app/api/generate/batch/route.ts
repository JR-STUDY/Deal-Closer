import type { NextRequest } from "next/server";
import { prisma } from "@/lib/db";
import { getCurrentOrg, getCurrentUser } from "@/lib/session";
import { ok, fail } from "@/lib/api";
import {
  computeAmount,
  parseContentJson,
  type EditorDoc,
  type BlockPropsMap,
} from "@/lib/editor-schema";
import {
  BATCH_BASE_TYPE,
  BATCH_BASE_CLIENT_NAME,
  BATCH_BASE_CONTENT_JSON,
} from "@/lib/batch-template";

/**
 * POST /api/generate/batch — 폴더 업로드 데모 변환 (MVP 목업)
 *
 * body: { folderName, fileNames: string[], saveAsCommon? }
 *
 * 데모 시나리오: 업로드한 파일의 실제 내용과 무관하게, 파일 하나당 "더미 기준본"
 * (src/lib/batch-template.ts — 실제 견적서 문서의 저장 스냅샷)을 복제해 문서를
 * 생성한다. 기준본 포맷(공급자·품목 구성·문구·레이아웃)은 그대로 두고, 두 가지만
 * 문서마다 다르게 한다:
 *   ① 고객사명(거래처명) — 파일명에서 추정한 회사명으로 치환
 *   ② 금액 — 품목 단가에 항목별 랜덤 배수를 적용해 총액을 다양화
 * 업로드 폴더명으로 보관함 폴더를 만들어 그 안에 모아 담는다.
 * (실제 문서 파싱/AI 없음 — 화면 시연용)
 */

/** 최대 변환 건수 (과대 입력 방지) */
const MAX_FILES = 200;

/** 문서 종류/상태를 뜻해 거래처명이 아닌 토큰 */
const NON_CLIENT_TOKENS = new Set([
  "견적서",
  "견적",
  "계약서",
  "제안서",
  "최종",
  "초안",
  "양식",
  "사본",
  "복사본",
]);

/** 파일명에서 확장자 제거 → 문서 제목 */
function titleFromName(name: string): string {
  const base = name.replace(/\.[^.]+$/, "").trim();
  return base || name;
}

/**
 * 파일명에서 거래처명(상호명)을 추정한다 (데모 시연용).
 * `2024_삼정물류_WMS구축_견적서.xlsx` → `삼정물류` 처럼, 확장자를 떼고 구분자로
 * 나눈 첫 "의미있는" 토큰을 거래처명으로 본다. 연도·버전·문서종류어는 건너뛴다.
 * 추정에 실패하면 null.
 */
function clientFromName(name: string): string | null {
  const base = name.replace(/\.[^.]+$/, "").trim();
  if (!base) return null;
  for (const tok of base.split(/[_\s()]+/).filter(Boolean)) {
    if (/^\d+$/.test(tok)) continue; // 연도/일련번호 (2024 등)
    if (/^v?\d+(\.\d+)?$/i.test(tok)) continue; // 버전 (v2, 1.0 등)
    if (NON_CLIENT_TOKENS.has(tok)) continue; // 문서 종류/상태어
    return tok;
  }
  return null;
}

/** 기준본 문서 모델(파싱 실패 시 null) — 요청마다 이 값을 복제해 사용한다. */
const BASE_DOC = parseContentJson(BATCH_BASE_CONTENT_JSON);

/** 기준본을 깊은 복제한다 (요청·문서 간 상태 공유 방지). */
function cloneBaseDoc(): EditorDoc | null {
  return BASE_DOC ? (JSON.parse(JSON.stringify(BASE_DOC)) as EditorDoc) : null;
}

/** clientMeta 블록의 "고객사명" 값을 치환한다. */
function applyClientName(doc: EditorDoc, clientName: string): void {
  const meta = doc.blocks.find((b) => b.type === "clientMeta");
  if (!meta) return;
  const props = meta.props as BlockPropsMap["clientMeta"];
  if (!Array.isArray(props.fields)) return;
  props.fields = props.fields.map((f) =>
    f.label?.includes("고객사") ? { ...f, value: clientName } : f,
  );
}

/**
 * itemTable 단가를 항목별 랜덤 배수(≈0.55~1.85)로 조정해 총액을 다양화한다.
 * 수량·품목명·설명은 유지한다("50 사용자" 같은 설명과 어긋나지 않도록).
 * 단가는 만원 단위로 반올림하고 최소 1만원을 보장한다.
 */
function randomizeAmounts(doc: EditorDoc): void {
  const table = doc.blocks.find((b) => b.type === "itemTable");
  if (!table) return;
  const props = table.props as BlockPropsMap["itemTable"];
  if (!Array.isArray(props.rows)) return;
  props.rows = props.rows.map((row) => {
    const factor = 0.55 + Math.random() * 1.3; // [0.55, 1.85)
    const adjusted = Math.round((row.unitPrice * factor) / 10_000) * 10_000;
    return { ...row, unitPrice: Math.max(10_000, adjusted) };
  });
}

export async function POST(req: NextRequest) {
  const org = await getCurrentOrg();
  const user = await getCurrentUser();

  let body: {
    folderName?: unknown;
    fileNames?: unknown;
    saveAsCommon?: unknown;
  };
  try {
    body = await req.json();
  } catch {
    return fail("잘못된 요청 본문입니다.");
  }

  const folderName =
    typeof body.folderName === "string" && body.folderName.trim()
      ? body.folderName.trim()
      : "가져온 양식";
  const fileNames = Array.isArray(body.fileNames)
    ? body.fileNames
        .filter((n): n is string => typeof n === "string" && n.trim().length > 0)
        .slice(0, MAX_FILES)
    : [];
  if (fileNames.length === 0) {
    return fail("변환할 파일이 없습니다.");
  }
  const saveAsCommon = body.saveAsCommon === true;

  // 업로드 폴더명으로 보관함 폴더 생성 (같은 문서함 맨 뒤 순서)
  const last = await prisma.folder.findFirst({
    where: { orgId: org.id, isCommon: saveAsCommon, parentId: null },
    orderBy: { sortOrder: "desc" },
    select: { sortOrder: true },
  });
  const folder = await prisma.folder.create({
    data: {
      orgId: org.id,
      name: folderName,
      isCommon: saveAsCommon,
      parentId: null,
      sortOrder: (last?.sortOrder ?? -1) + 1,
    },
  });

  // 파일마다 더미 기준본을 복제 — 고객사명(파일명)·금액(랜덤)만 다르게
  const documents: { id: string; title: string }[] = [];
  for (const name of fileNames) {
    const clientName = clientFromName(name) ?? BATCH_BASE_CLIENT_NAME;
    const doc = cloneBaseDoc();
    if (doc) {
      if (clientName) applyClientName(doc, clientName);
      randomizeAmounts(doc);
    }
    const contentJson = doc ? JSON.stringify(doc) : BATCH_BASE_CONTENT_JSON;
    const amount = doc ? computeAmount(doc) : 0;

    const created = await prisma.document.create({
      data: {
        orgId: org.id,
        authorId: user.id,
        title: titleFromName(name),
        type: BATCH_BASE_TYPE,
        status: "DRAFT",
        isCommon: saveAsCommon,
        folderId: folder.id,
        clientName,
        contentJson,
        amount,
      },
      select: { id: true, title: true },
    });
    documents.push(created);
  }

  return ok(
    {
      folder: { id: folder.id, name: folder.name, isCommon: folder.isCommon },
      documents,
    },
    { status: 201 },
  );
}
