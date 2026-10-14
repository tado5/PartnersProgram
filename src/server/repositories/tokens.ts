import type { PartnerToken, Prisma } from "@prisma/client";

import { prisma, type DbClient } from "../db";
import { lockCompanyContext, type CompanyContext } from "../auth/session";

export function findActiveTokenByHash(
  context: CompanyContext,
  tokenHash: string,
  db: DbClient = prisma,
): Promise<PartnerToken | null> {
  return db.partnerToken.findFirst({
    where: { companyId: context.companyId, company: { isActive: true }, tokenHash, isActive: true, partner: { isActive: true } },
  });
}

export async function createToken(
  context: CompanyContext,
  data: Omit<Prisma.PartnerTokenUncheckedCreateInput, "companyId" | "createdByUserId" | "deactivatedByUserId">,
  db: Prisma.TransactionClient,
): Promise<PartnerToken> {
  await lockCompanyContext(db, context, true);
  if (!await db.partner.findFirst({ where: { id: data.partnerId, companyId: context.companyId, isActive: true } })) {
    throw new Error("Partner not found in company.");
  }
  return db.partnerToken.create({ data: { ...data, companyId: context.companyId, createdByUserId: context.user.id } });
}

export function listPartnerTokens(context: CompanyContext, partnerId: bigint, db: DbClient = prisma) {
  return db.partnerToken.findMany({
    where: { partnerId, companyId: context.companyId },
    select: {
      id: true,
      type: true,
      tokenHint: true,
      label: true,
      isActive: true,
      createdAt: true,
      deactivatedAt: true,
      deactivationReason: true,
      lastUsedAt: true,
    },
    orderBy: [{ createdAt: "desc" }, { id: "desc" }],
  });
}
