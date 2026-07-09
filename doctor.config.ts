import { defineConfig } from "react-doctor/api";

/**
 * react-doctor 설정 — https://react.doctor/docs/configuration/config-files
 *
 * 자동 생성물·빌드 산출물은 우리 소스가 아니므로 스캔에서 제외한다.
 * (이 폴더들은 gitignore 대상이기도 하다)
 */
export default defineConfig({
  ignore: {
    files: [
      "src/generated/**", // Prisma Client (자동 생성)
      ".next/**", // Next.js 빌드 산출물
      "prisma/migrations/**", // 마이그레이션 SQL
    ],
  },
});
