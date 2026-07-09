import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // exceljs 는 Node 전용 라이브러리이므로 서버 번들에서 외부 모듈로 유지한다
  // (Route Handler 에서 XLSX 파싱에 사용).
  serverExternalPackages: ["exceljs"],
};

export default nextConfig;
