import type { Partner, Prisma } from "@prisma/client";

import { prisma, type DbClient } from "../db";
import { lockCompanyContext, type CompanyContext } from "../auth/session";

export function findPartnerById(
  context: CompanyContext,
  id: bigint,
  db: DbClient = prisma,
): Promise<Partner | null> {
  return db.partner.findFirst({ where: { id, companyId: context.companyId } });
}

export function findPartnerByCode(
  context: CompanyContext,
  code: string,
  db: DbClient = prisma,
): Promise<Partner | null> {
  return db.partner.findFirst({ where: { code, companyId: context.companyId } });
}

export async function createPartner(
  context: CompanyContext,
  data: Omit<Prisma.PartnerUncheckedCreateInput, "companyId">,
  db: Prisma.TransactionClient,
): Promise<Partner> {
  await lockCompanyContext(db, context);
  return db.partner.create({ data: { ...data, companyId: context.companyId, createdByUserId: context.user.id } });
}
