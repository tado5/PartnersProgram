import type { Prisma, Purchase } from "@prisma/client";

import { prisma, type DbClient } from "../db";
import { lockCompanyContext, type CompanyContext } from "../auth/session";

export function findPurchaseById(
  context: CompanyContext,
  id: bigint,
  db: DbClient = prisma,
): Promise<Purchase | null> {
  return db.purchase.findFirst({ where: { id, companyId: context.companyId } });
}

export async function createPurchase(
  context: CompanyContext,
  data: Omit<Prisma.PurchaseUncheckedCreateInput, "companyId" | "createdByUserId" | "updatedByUserId" | "deletedByUserId">,
  db: Prisma.TransactionClient,
): Promise<Purchase> {
  await lockCompanyContext(db, context, true);
  const partner = await db.partner.findFirst({
    where: { id: data.partnerId, companyId: context.companyId, isActive: true },
  });
  if (!partner) throw new Error("Partner not found in company.");
  if (data.tokenId && !await db.partnerToken.findFirst({
    where: { id: data.tokenId, companyId: context.companyId, partnerId: data.partnerId, isActive: true },
  })) throw new Error("Token not found for partner in company.");
  return db.purchase.create({ data: { ...data, companyId: context.companyId, createdByUserId: context.user.id } });
}

export function listPartnerPurchases(
  context: CompanyContext,
  partnerId: bigint,
  skip: number,
  take: number,
  db: DbClient = prisma,
) {
  return db.purchase.findMany({
    where: { partnerId, companyId: context.companyId, isDeleted: false },
    orderBy: [{ purchasedAt: "desc" }, { id: "desc" }],
    skip,
    take,
  });
}
