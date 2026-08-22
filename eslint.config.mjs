import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";

const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,
  // Override default ignores of eslint-config-next.
  globalIgnores([
    // Default ignores of eslint-config-next:
    ".next/**",
    "out/**",
    "build/**",
    "next-env.d.ts",
    // 검증용 git worktree(`.claude/worktrees/*`)는 프로젝트 안에 있어 그대로 두면
    // 그쪽 빌드 산출물(`.next/**`)까지 스캔한다. `.next/**` 는 **루트 기준**이라
    // 하위 경로의 같은 폴더를 걸러 주지 않는다 — 워크트리에서 서버를 한 번만 띄워도
    // `pnpm lint` 가 수백 건의 error 로 실패하고, 원인을 내 코드에서 찾게 된다.
    ".claude/worktrees/**",
  ]),
]);

export default eslintConfig;
