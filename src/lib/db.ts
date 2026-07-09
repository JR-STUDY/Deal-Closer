import { PrismaBetterSqlite3 } from "@prisma/adapter-better-sqlite3";
import { PrismaClient } from "@/generated/prisma/client";

/**
 * Prisma 7 은 driver adapter 방식을 사용한다.
 * SQLite 는 better-sqlite3 어댑터로 연결한다.
 *
 * Next.js dev 모드는 모듈을 자주 리로드하므로, globalThis 에 인스턴스를
 * 캐싱해 커넥션이 무한히 늘어나는 것을 방지한다.
 */
const globalForPrisma = globalThis as unknown as {
  prisma?: PrismaClient;
};

function createPrismaClient(): PrismaClient {
  const adapter = new PrismaBetterSqlite3({
    url: process.env.DATABASE_URL ?? "file:./dev.db",
  });
  return new PrismaClient({ adapter });
}

export const prisma: PrismaClient = globalForPrisma.prisma ?? createPrismaClient();

if (process.env.NODE_ENV !== "production") {
  globalForPrisma.prisma = prisma;
}
