import { PrismaClient, type Prisma } from "@prisma/client";
import { createDatabaseAdapter } from "./db-adapter.mjs";
import { env } from "@/lib/env";

const globalForPrisma = globalThis as typeof globalThis & {
  prisma?: PrismaClient;
};

export const prisma =
  globalForPrisma.prisma ??
  new PrismaClient({
    adapter: createDatabaseAdapter(env.DATABASE_URL),
    log: process.env.NODE_ENV === "development" ? ["warn", "error"] : ["error"],
  });

if (process.env.NODE_ENV !== "production") {
  globalForPrisma.prisma = prisma;
}

export type DbClient = PrismaClient | Prisma.TransactionClient;
