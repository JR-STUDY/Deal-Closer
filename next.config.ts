import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Node 전용 라이브러리는 서버 번들에서 외부 모듈로 유지한다.
  // - exceljs: Route Handler 에서 XLSX 파싱
  // - puppeteer-core: PDF 렌더(src/lib/pdf.ts). 번들되면 브라우저 실행이 깨진다
  serverExternalPackages: ["exceljs", "puppeteer-core"],
};

export default nextConfig;
