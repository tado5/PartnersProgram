import type { Prisma, User } from "@prisma/client";

import { prisma, type DbClient } from "../db";
import { lockCompanyContext, type CompanyContext } from "../auth/session";

export function findUserById(context: CompanyContext, id: bigint, db: DbClient = prisma): Promise<User | null> {
  return db.user.findFirst({ where: { id, companyId: context.companyId } });
}

export function findUserByEmail(
  context: CompanyContext,
  email: string,
  db: DbClient = prisma,
): Promise<User | null> {
  return db.user.findFirst({ where: { email, companyId: context.companyId } });
}

export async function createUser(
  context: CompanyContext,
  data: Omit<Prisma.UserUncheckedCreateInput, "companyId" | "role"> & { role: "admin" | "seller" },
  db: Prisma.TransactionClient,
): Promise<User> {
  await lockCompanyContext(db, context);
  return db.user.create({ data: { ...data, companyId: context.companyId } });
}
