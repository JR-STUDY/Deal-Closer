import "server-only";

import { spawn } from "node:child_process";
import { mkdtemp, readFile, rm, stat, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { pathToFileURL } from "node:url";

import {
  parseContentJson,
  type BlockPropsMap,
  type EditorDoc,
} from "./editor-schema";
import {
  buildDocumentHtml,
  sanitizeImageSrc,
  type DocumentHtmlInput,
  type PdfBranding,
} from "./pdf-html";

/**
 * 문서 → PDF 바이트 (서버 전용).
 *
 * 블록 캔버스는 절대좌표 배치라 HTML 재현이 단순하다. 그래서 좌표를 직접 그리는 대신
 * `pdf-html.ts` 로 인쇄용 HTML 을 만들고 헤드리스 브라우저의 print 로 PDF 를 뽑는다
 * (docs/PRD-IMPLEMENTATION-PLAN.md §7 결정 항목).
 *
 * 브라우저는 CLI(`--headless --print-to-pdf`)로 띄운다. puppeteer 같은 런타임 의존성을
 * 더하지 않으므로 배포 이미지에 브라우저 실행 파일만 있으면 된다. 실행 파일 경로는
 * `PDF_CHROME_PATH` 환경변수로 지정할 수 있고, 없으면 OS 별 표준 경로를 탐색한다.
 *
 * 플랫폼 주의: macOS 의 Chrome 인쇄 백엔드는 글꼴을 임베딩하지 않고 시스템 글꼴을 참조한다.
 * 개발 기기에서 뽑은 PDF 는 한글 글꼴이 없는 수신자 환경에서 대체 글꼴로 보일 수 있다.
 * 배포 대상인 리눅스에서는 글꼴 서브셋이 임베딩되므로, 서버에 한글 글꼴을 설치해 두어야 한다.
 */

export type { PdfBranding } from "./pdf-html";

export type RenderDocumentPdfInput = DocumentHtmlInput & {
  /** 렌더 제한 시간(ms). 초과하면 브라우저를 강제 종료하고 실패시킨다. */
  timeoutMs?: number;
};

/** 기본 렌더 제한 시간 — 원격 이미지 로딩까지 감안한 값 */
export const PDF_RENDER_TIMEOUT_MS = 30_000;

/** 브라우저 실행 파일 경로를 지정하는 환경변수 (우선순위 순) */
const CHROME_PATH_ENV_KEYS = [
  "PDF_CHROME_PATH",
  "CHROME_PATH",
  "PUPPETEER_EXECUTABLE_PATH",
] as const;

/** OS 별 표준 설치 경로 후보 */
const CHROME_CANDIDATES: Record<string, readonly string[]> = {
  darwin: [
    "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
    "/Applications/Chromium.app/Contents/MacOS/Chromium",
    "/Applications/Microsoft Edge.app/Contents/MacOS/Microsoft Edge",
  ],
  linux: [
    "/usr/bin/google-chrome",
    "/usr/bin/google-chrome-stable",
    "/usr/bin/chromium",
    "/usr/bin/chromium-browser",
    "/usr/bin/microsoft-edge",
  ],
  win32: [
    "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe",
    "C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe",
    "C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe",
  ],
};

/** public/ 안의 이미지를 data URL 로 인라인할 때 허용하는 확장자 */
const INLINE_ASSET_MIME: Record<string, string> = {
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".gif": "image/gif",
  ".svg": "image/svg+xml",
  ".webp": "image/webp",
};

const MAX_INLINE_ASSET_BYTES = 4 * 1024 * 1024;
const STDERR_CAPTURE_LIMIT = 4096;
const PDF_MAGIC = "%PDF-";
const PDF_EOF_MARKER = "%%EOF";
const PDF_TRAILER_SCAN_BYTES = 2048;
const PDF_POLL_INTERVAL_MS = 100;

let cachedChromePath: string | null = null;

async function isExecutableFile(candidate: string): Promise<boolean> {
  try {
    return (await stat(candidate)).isFile();
  } catch {
    return false;
  }
}

/**
 * 헤드리스 브라우저 실행 파일을 찾는다 (한 번 찾으면 캐시).
 * 못 찾으면 조치 방법을 담은 오류를 던진다.
 */
export async function resolveChromeExecutable(): Promise<string> {
  if (cachedChromePath) return cachedChromePath;

  const fromEnv = CHROME_PATH_ENV_KEYS.map((key) => process.env[key]?.trim()).find(
    (value): value is string => Boolean(value),
  );
  if (fromEnv) {
    if (!(await isExecutableFile(fromEnv))) {
      throw new Error(
        `PDF 렌더용 브라우저를 찾을 수 없습니다: ${fromEnv} (환경변수 경로가 잘못되었습니다)`,
      );
    }
    cachedChromePath = fromEnv;
    return fromEnv;
  }

  for (const candidate of CHROME_CANDIDATES[process.platform] ?? []) {
    if (await isExecutableFile(candidate)) {
      cachedChromePath = candidate;
      return candidate;
    }
  }

  throw new Error(
    "PDF 렌더용 헤드리스 브라우저를 찾을 수 없습니다. Chrome/Chromium 을 설치하거나 PDF_CHROME_PATH 환경변수에 실행 파일 경로를 지정해 주세요.",
  );
}

/**
 * 루트 상대경로(`/brand-logo.png`)를 public/ 에서 읽어 data URL 로 바꾼다.
 * 브라우저가 HTML 을 file:// 로 열기 때문에 상대경로는 그대로 해석되지 않는다.
 * 허용 확장자·용량·경로 탈출을 모두 검사하고, 실패하면 빈 문자열(이미지 생략)을 준다.
 */
async function inlinePublicAsset(src: string): Promise<string> {
  const publicDir = path.join(process.cwd(), "public");
  const relative = decodeURIComponent(src.split(/[?#]/)[0]).replace(/^\/+/, "");
  const absolute = path.resolve(publicDir, relative);
  if (absolute !== publicDir && !absolute.startsWith(publicDir + path.sep)) {
    return "";
  }

  const mime = INLINE_ASSET_MIME[path.extname(absolute).toLowerCase()];
  if (!mime) return "";

  try {
    const info = await stat(absolute);
    if (!info.isFile() || info.size > MAX_INLINE_ASSET_BYTES) return "";
    const bytes = await readFile(absolute);
    return `data:${mime};base64,${bytes.toString("base64")}`;
  } catch {
    return "";
  }
}

/** `/...` 경로만 인라인하고 나머지(data:·http(s))는 그대로 둔다 */
async function resolveImageSrc(src: string | null | undefined): Promise<string> {
  const safe = sanitizeImageSrc(src);
  return safe.startsWith("/") ? inlinePublicAsset(safe) : safe;
}

/** 이미지 블록의 src 를 브라우저가 읽을 수 있는 값으로 바꾼 새 문서를 만든다 (원본 불변) */
async function withInlinedAssets(doc: EditorDoc): Promise<EditorDoc> {
  const blocks = await Promise.all(
    doc.blocks.map(async (block) => {
      if (block.type !== "image") return block;
      const props = block.props as BlockPropsMap["image"];
      const dataUrl = await resolveImageSrc(props.dataUrl);
      if (dataUrl === props.dataUrl) return block;
      return { ...block, props: { ...props, dataUrl } };
    }),
  );
  return { ...doc, blocks };
}

async function withInlinedLogo(
  branding: PdfBranding | null | undefined,
): Promise<PdfBranding | null> {
  if (!branding) return null;
  const logoUrl = await resolveImageSrc(branding.logoUrl);
  return { ...branding, logoUrl: logoUrl || null };
}

function chromeArgs(
  profileDir: string,
  outputPath: string,
  pageUrl: string,
): string[] {
  const args = [
    "--headless",
    "--disable-gpu",
    "--disable-dev-shm-usage",
    "--no-first-run",
    "--no-default-browser-check",
    "--disable-extensions",
    "--disable-background-networking",
    "--disable-sync",
    "--mute-audio",
    // 사용자의 실제 브라우저 프로필과 격리한다 (세션 오염·중복 실행 방지)
    `--user-data-dir=${profileDir}`,
    "--no-pdf-header-footer",
    `--print-to-pdf=${outputPath}`,
    pageUrl,
  ];
  // 컨테이너처럼 샌드박스를 못 쓰는 환경용 탈출구 (기본은 샌드박스 유지)
  if (process.env.PDF_CHROME_NO_SANDBOX === "1") {
    args.unshift("--no-sandbox");
  }
  return args;
}

const delay = (ms: number): Promise<void> =>
  new Promise((resolve) => setTimeout(resolve, ms));

/** 트레일러(`%%EOF`)까지 쓰인 완결된 PDF 인지 확인한다 */
async function readCompletePdf(filePath: string): Promise<Buffer | null> {
  try {
    const bytes = await readFile(filePath);
    if (bytes.subarray(0, PDF_MAGIC.length).toString("latin1") !== PDF_MAGIC) {
      return null;
    }
    const trailer = bytes.subarray(-PDF_TRAILER_SCAN_BYTES).toString("latin1");
    return trailer.includes(PDF_EOF_MARKER) ? bytes : null;
  } catch {
    return null;
  }
}

/**
 * 브라우저로 인쇄해 완성된 PDF 바이트를 얻는다.
 *
 * 프로세스 종료가 아니라 **산출물 완결**을 성공 판정으로 삼는다.
 * Chrome 은 `--print-to-pdf` 로 파일을 다 쓰고도 프로세스가 남는 경우가 있어
 * 종료를 기다리면 매번 제한 시간까지 매달린다. 파일이 `%%EOF` 까지 쓰이면 곧바로
 * 프로세스 그룹을 정리하고 반환한다.
 */
async function printToPdf(
  executable: string,
  args: string[],
  outputPath: string,
  timeoutMs: number,
): Promise<Buffer> {
  // detached: 렌더러·GPU 헬퍼까지 한 번에 정리하려고 새 프로세스 그룹으로 띄운다
  const child = spawn(executable, args, {
    stdio: ["ignore", "ignore", "pipe"],
    detached: true,
  });
  const state: { exited: boolean; code: number | null; failure: Error | null } = {
    exited: false,
    code: null,
    failure: null,
  };
  let stderr = "";

  child.stderr?.on("data", (chunk: Buffer) => {
    if (stderr.length < STDERR_CAPTURE_LIMIT) stderr += chunk.toString("utf8");
  });
  child.on("error", (error: Error) => {
    state.failure = new Error(
      `헤드리스 브라우저를 실행하지 못했습니다: ${error.message}`,
    );
    state.exited = true;
  });
  child.on("exit", (code) => {
    state.exited = true;
    state.code = code;
  });

  try {
    const deadline = Date.now() + timeoutMs;
    let previousSize = -1;
    while (Date.now() < deadline) {
      const pdf = await readCompletePdf(outputPath);
      // 브라우저가 이미 끝났다면 더 쓸 주체가 없다. 아직 살아 있다면 크기가 두 번
      // 연속 같을 때만 완결로 본다 — 쓰는 도중의 파일을 읽지 않기 위해서다.
      if (pdf && (state.exited || pdf.byteLength === previousSize)) return pdf;
      if (pdf) previousSize = pdf.byteLength;
      if (state.failure) throw state.failure;
      if (state.exited) {
        throw new Error(
          `헤드리스 브라우저가 PDF 를 만들지 못하고 종료했습니다 (code=${state.code}). ${stderr.trim()}`.trim(),
        );
      }
      await delay(PDF_POLL_INTERVAL_MS);
    }
    throw new Error(`PDF 렌더가 제한 시간(${timeoutMs}ms)을 초과했습니다.`);
  } finally {
    killProcessGroup(child);
    child.stderr?.destroy();
  }
}

/** 브라우저와 헬퍼 프로세스를 통째로 정리한다 (이미 종료했으면 무시) */
function killProcessGroup(child: ReturnType<typeof spawn>): void {
  if (child.exitCode !== null || child.signalCode !== null || !child.pid) return;
  try {
    process.kill(-child.pid, "SIGKILL");
  } catch {
    child.kill("SIGKILL");
  }
}

/**
 * 문서를 PDF 바이트로 렌더한다.
 *
 * @throws 브라우저를 찾지 못했거나, 제한 시간을 넘겼거나, PDF 를 만들지 못하고 종료했을 때
 */
export async function renderDocumentPdf(
  input: RenderDocumentPdfInput,
): Promise<Uint8Array> {
  const timeoutMs = input.timeoutMs ?? PDF_RENDER_TIMEOUT_MS;
  const executable = await resolveChromeExecutable();

  const [doc, branding] = await Promise.all([
    withInlinedAssets(input.doc),
    withInlinedLogo(input.branding),
  ]);
  const html = buildDocumentHtml({ doc, title: input.title, branding });

  const workDir = await mkdtemp(path.join(tmpdir(), "rainmaker-pdf-"));
  try {
    const htmlPath = path.join(workDir, "document.html");
    const pdfPath = path.join(workDir, "document.pdf");
    const profileDir = path.join(workDir, "profile");
    await writeFile(htmlPath, html, "utf8");

    const bytes = await printToPdf(
      executable,
      chromeArgs(profileDir, pdfPath, pathToFileURL(htmlPath).href),
      pdfPath,
      timeoutMs,
    );
    return new Uint8Array(bytes);
  } finally {
    await rm(workDir, { recursive: true, force: true });
  }
}

/**
 * `Document.contentJson` 을 PDF 로 렌더한다.
 * contentJson 이 비었거나 형식이 깨졌으면 렌더할 내용이 없으므로 null 을 반환한다
 * (호출부가 "문서를 먼저 편집해 주세요" 같은 안내를 하도록).
 */
export async function renderDocumentPdfFromContentJson(input: {
  contentJson: string | null | undefined;
  title: string;
  branding?: PdfBranding | null;
  timeoutMs?: number;
}): Promise<Uint8Array | null> {
  const doc = parseContentJson(input.contentJson);
  if (!doc) return null;
  return renderDocumentPdf({
    doc,
    title: input.title,
    branding: input.branding,
    timeoutMs: input.timeoutMs,
  });
}
