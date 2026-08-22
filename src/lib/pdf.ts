import "server-only";

import { readFile, stat } from "node:fs/promises";
import path from "node:path";

import puppeteer, { type Browser, type PDFOptions } from "puppeteer-core";

import {
  parseContentJson,
  type Block,
  type BlockPropsMap,
  type EditorDoc,
  type FontFamily,
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
 * 브라우저 제어는 `puppeteer-core` 로 한다. 브라우저 바이너리를 내려받지 않는 패키지라
 * 실행 파일은 `PDF_CHROME_PATH`(또는 `PUPPETEER_EXECUTABLE_PATH`) 환경변수로 지정하고,
 * 없으면 OS 별 표준 경로를 탐색한다. 배포 이미지에는 Chrome/Chromium 을 깔아 두어야 한다.
 *
 * 글꼴 주의: 브라우저는 **서버에 설치된 글꼴**로 렌더한다. 한글 글꼴이 없는 서버에서는
 * 본문이 두부(□)로 나온다. 리눅스 이미지에는 `fonts-noto-cjk`(또는 나눔글꼴)를 설치할 것.
 * 검증 방법은 `docs/PDF-RENDERING.md` 참고.
 */

export type { PdfBranding } from "./pdf-html";

export type RenderDocumentPdfInput = DocumentHtmlInput & {
  /** 렌더 제한 시간(ms). 초과하면 브라우저를 정리하고 실패시킨다. */
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
const PDF_MAGIC = "%PDF-";

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
 * 페이지를 `setContent` 로 띄우므로 상대경로는 해석되지 않는다.
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

/**
 * 브랜딩 이미지(로고·인감)를 브라우저가 읽을 수 있는 값으로 바꾼다.
 *
 * **둘을 함께 처리한다.** 예전에는 로고만 인라인했는데, 인감이 붙은 뒤로는 한쪽만
 * 처리하면 `/stamp.png` 같은 루트 상대경로가 헤드리스 브라우저에서 빈 이미지가 된다
 * (도메인이 없으므로 받아올 곳이 없다). 두 값의 처리 규칙은 같으므로 함께 둔다.
 */
async function withInlinedBrandingImages(
  branding: PdfBranding | null | undefined,
): Promise<PdfBranding | null> {
  if (!branding) return null;
  const [logoUrl, stampUrl] = await Promise.all([
    resolveImageSrc(branding.logoUrl),
    resolveImageSrc(branding.stampUrl),
  ]);
  return { ...branding, logoUrl: logoUrl || null, stampUrl: stampUrl || null };
}

/** 컨테이너처럼 샌드박스를 못 쓰는 환경용 탈출구 (기본은 샌드박스 유지) */
function launchArgs(): string[] {
  const args = ["--disable-dev-shm-usage", "--disable-extensions"];
  if (process.env.PDF_CHROME_NO_SANDBOX === "1") {
    args.push("--no-sandbox", "--disable-setuid-sandbox");
  }
  return args;
}

/** 브라우저를 띄워 콜백에 넘기고, 어떤 경우에도 닫는다 */
async function withBrowser<T>(
  timeoutMs: number,
  run: (browser: Browser) => Promise<T>,
): Promise<T> {
  const browser = await puppeteer.launch({
    browser: "chrome",
    executablePath: await resolveChromeExecutable(),
    headless: true,
    args: launchArgs(),
    timeout: timeoutMs,
  });
  try {
    return await run(browser);
  } finally {
    await browser.close();
  }
}

/**
 * 인쇄용 HTML 을 PDF 바이트로 만든다.
 * 페이지 크기는 HTML 의 `@page` 규칙을 그대로 따른다(`preferCSSPageSize`)
 * — 캔버스 크기가 곧 용지 크기이므로 단일 소스를 유지한다.
 */
async function printHtmlToPdf(html: string, timeoutMs: number): Promise<Uint8Array> {
  return withBrowser(timeoutMs, async (browser) => {
    const page = await browser.newPage();
    // load = 이미지까지 다 받은 시점. 그 뒤 글꼴 준비까지 기다려야 빈 칸으로 찍히지 않는다
    await page.setContent(html, { waitUntil: "load", timeout: timeoutMs });
    await page.evaluate(() => document.fonts.ready);
    const options: PDFOptions = {
      printBackground: true,
      preferCSSPageSize: true,
      margin: { top: 0, right: 0, bottom: 0, left: 0 },
      timeout: timeoutMs,
    };
    return page.pdf(options);
  });
}

/**
 * 문서를 PDF 바이트로 렌더한다.
 *
 * @throws 브라우저를 찾지 못했거나, 제한 시간을 넘겼거나, 결과가 PDF 가 아닐 때
 */
export async function renderDocumentPdf(
  input: RenderDocumentPdfInput,
): Promise<Uint8Array> {
  const timeoutMs = input.timeoutMs ?? PDF_RENDER_TIMEOUT_MS;

  const [doc, branding] = await Promise.all([
    withInlinedAssets(input.doc),
    withInlinedBrandingImages(input.branding),
  ]);
  const html = buildDocumentHtml({ doc, title: input.title, branding });

  const bytes = await printHtmlToPdf(html, timeoutMs);
  if (Buffer.from(bytes.subarray(0, PDF_MAGIC.length)).toString("latin1") !== PDF_MAGIC) {
    throw new Error("렌더 결과가 올바른 PDF 가 아닙니다.");
  }
  return bytes;
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

/** 한글 렌더 진단 결과 */
export type KoreanFontReport = {
  /** 글꼴 계열별로 브라우저가 실제 사용한 글꼴 이름 */
  byFamily: Record<FontFamily, string[]>;
  /** 한글을 그릴 글꼴이 없는 계열 (비어 있어야 정상) */
  missing: FontFamily[];
  /** 세 계열 모두 한글이 정상 렌더되는지 */
  ok: boolean;
};

/** 한글 렌더 진단에 쓰는 표본 문자열 */
const KOREAN_PROBE_TEXT = "견적서 금액 부가세";

/** 글꼴을 찾지 못했을 때 브라우저가 쓰는 최후 대체 글꼴 */
const LAST_RESORT_FONT = "LastResort";

const PROBE_FAMILIES: readonly FontFamily[] = ["sans", "serif", "mono"];

function probeBlock(family: FontFamily, index: number): Block {
  return {
    id: `probe-${family}`,
    type: "text",
    x: 0,
    y: index * 60,
    w: 400,
    h: 60,
    z: 1,
    locked: false,
    props: {
      text: KOREAN_PROBE_TEXT,
      align: "left",
      fontSize: 20,
      fontFamily: family,
      color: "#111827",
      border: false,
      borderColor: "#e5e7eb",
    },
  };
}

/**
 * 서버에 한글 글꼴이 깔려 있는지 브라우저에 직접 물어본다.
 *
 * CSS 에 적은 글꼴 이름이 아니라 **브라우저가 실제로 사용한 글꼴**을 CDP
 * (`CSS.getPlatformFontsForNode`)로 읽는다. 글꼴이 없는 서버에서 두부(□)로 찍히는 사고를
 * 배포 전에 잡는 용도다.
 */
export async function checkKoreanFonts(
  timeoutMs: number = PDF_RENDER_TIMEOUT_MS,
): Promise<KoreanFontReport> {
  return withBrowser(timeoutMs, async (browser) => {
    const page = await browser.newPage();
    const html = buildDocumentHtml({
      doc: {
        version: 1,
        canvas: { w: 400, h: PROBE_FAMILIES.length * 60, pages: 1 },
        blocks: PROBE_FAMILIES.map(probeBlock),
      },
      title: "글꼴 진단",
    });
    await page.setContent(html, { waitUntil: "load", timeout: timeoutMs });
    await page.evaluate(() => document.fonts.ready);

    const cdp = await page.createCDPSession();
    await cdp.send("DOM.enable");
    await cdp.send("CSS.enable");
    const { root } = await cdp.send("DOM.getDocument");
    const { nodeIds } = await cdp.send("DOM.querySelectorAll", {
      nodeId: root.nodeId,
      selector: ".blk-text",
    });

    const byFamily = {} as Record<FontFamily, string[]>;
    for (const [index, family] of PROBE_FAMILIES.entries()) {
      const nodeId = nodeIds[index];
      if (nodeId === undefined) {
        byFamily[family] = [];
        continue;
      }
      const { fonts } = await cdp.send("CSS.getPlatformFontsForNode", { nodeId });
      // glyphCount 가 0 인 글꼴은 후보였을 뿐 실제로 쓰이지 않았다.
      byFamily[family] = fonts
        .filter((font) => font.glyphCount > 0 && font.familyName.length > 0)
        .map((font) => font.familyName);
    }

    // 대체 글꼴(LastResort)이 끼었거나 사용 글꼴이 없으면 한글을 그릴 글꼴이 없다는 뜻이다.
    const missing = PROBE_FAMILIES.filter(
      (family) =>
        byFamily[family].length === 0 ||
        byFamily[family].some((name) => name.includes(LAST_RESORT_FONT)),
    );
    return { byFamily, missing, ok: missing.length === 0 };
  });
}
