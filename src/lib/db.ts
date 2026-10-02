import { PrismaBetterSqlite3 } from "@prisma/adapter-better-sqlite3";
import { PrismaPg } from "@prisma/adapter-pg";
import { Prisma, PrismaClient } from "@/generated/prisma/client";
import { PrismaClient as SqlitePrismaClient } from "@/generated/prisma-test/client";

const globalForPrisma = globalThis as unknown as { prisma?: PrismaClient };
const databaseUrl = process.env.DATABASE_URL ?? "file:./dev.db";

export const usesPostgres = /^postgres(?:ql)?:\/\//i.test(databaseUrl);

function createClient() {
  if (!usesPostgres) {
    if (!databaseUrl.startsWith("file:")) throw new Error("DATABASE_URL must use postgresql:// or file:");
    const adapter = new PrismaBetterSqlite3({ url: databaseUrl });
    return new SqlitePrismaClient({ adapter }) as unknown as PrismaClient;
  }

  const adapter = new PrismaPg({
    connectionString: databaseUrl,
    max: Number(process.env.DB_POOL_MAX ?? 10),
    connectionTimeoutMillis: Number(process.env.DB_CONNECT_TIMEOUT_MS ?? 5_000),
    idleTimeoutMillis: Number(process.env.DB_IDLE_TIMEOUT_MS ?? 10_000),
  });
  return new PrismaClient({ adapter });
}

export const db = globalForPrisma.prisma ?? createClient();

if (process.env.NODE_ENV !== "production") globalForPrisma.prisma = db;

/**
 * PostgreSQL's serializable isolation turns write races into retryable P2034
 * conflicts. SQLite tests retain their native serialized-write behaviour.
 */
export async function serializableTransaction<T>(
  operation: (tx: Prisma.TransactionClient) => Promise<T>,
  maxAttempts = 3
): Promise<T> {
  for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
    try {
      return await db.$transaction(
        operation,
        usesPostgres
          ? { isolationLevel: Prisma.TransactionIsolationLevel.Serializable, maxWait: 5_000, timeout: 15_000 }
          : undefined
      );
    } catch (error) {
      const code = typeof error === "object" && error !== null && "code" in error ? String(error.code) : "";
      if (!usesPostgres || code !== "P2034" || attempt === maxAttempts) throw error;
    }
  }
  throw new Error("Serializable transaction retry limit reached");
}
