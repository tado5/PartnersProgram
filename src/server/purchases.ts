import { Prisma, type Purchase } from "@prisma/client";

import { netAmountFromGross, pointsForAmount, purchaseNeedsConfirmation } from "@/lib/purchases";
import { record } from "./audit";
import {
  lockCompanyContext,
  type CompanyContext,
} from "./auth/session";
import { prisma } from "./db";
export { pointsForAmount, purchaseNeedsConfirmation } from "@/lib/purchases";

export class PurchaseError extends Error {
  constructor(
    public code: string,
    message: string,
    public status = 409,
    public details?: Record<string, unknown>,
  ) {
    super(message);
  }
}

export function purchaseResponse(purchase: Purchase) {
  return {
    id: purchase.id.toString(),
    companyId: purchase.companyId.toString(),
    partnerId: purchase.partnerId.toString(),
    amount: purchase.amount.toFixed(2),
    netAmount: purchase.netAmount.toFixed(2),
    vatAmount: purchase.amount.sub(purchase.netAmount).toFixed(2),
    vatRatePercent: purchase.vatRatePercent.toFixed(2),
    points: purchase.points,
    partnerPresent: purchase.partnerPresent,
    note: purchase.note,
    purchasedAt: purchase.purchasedAt.toISOString(),
    source: purchase.source,
    tokenId: purchase.tokenId?.toString() ?? null,
    createdByUserId: purchase.createdByUserId.toString(),
    updatedByUserId: purchase.updatedByUserId?.toString() ?? null,
    isDeleted: purchase.isDeleted,
    deletedAt: purchase.deletedAt?.toISOString() ?? null,
    createdAt: purchase.createdAt.toISOString(),
    updatedAt: purchase.updatedAt.toISOString(),
  };
}

function valuesForAudit(purchase: Purchase) {
  return {
    partnerId: purchase.partnerId.toString(),
    amount: purchase.amount.toFixed(2),
    netAmount: purchase.netAmount.toFixed(2),
    vatRatePercent: purchase.vatRatePercent.toFixed(2),
    points: purchase.points,
    partnerPresent: purchase.partnerPresent,
    note: purchase.note,
    purchasedAt: purchase.purchasedAt.toISOString(),
    isDeleted: purchase.isDeleted,
  };
}

function sameIdempotentRequest(
  existing: Purchase,
  context: CompanyContext,
  data: {
    partnerId: bigint;
    amount: string;
    partnerPresent: boolean;
    note?: string;
    source: "qr" | "nfc" | "manual";
    tokenId?: bigint;
  },
) {
  return existing.createdByUserId === context.user.id &&
    existing.partnerId === data.partnerId &&
    existing.amount.equals(data.amount) &&
    existing.partnerPresent === data.partnerPresent &&
    existing.note === (data.note ?? null) &&
    existing.source === data.source &&
    existing.tokenId === (data.tokenId ?? null);
}

export async function createPurchase(
  context: CompanyContext,
  data: {
    partnerId: bigint;
    amount: string;
    partnerPresent: boolean;
    note?: string;
    source: "qr" | "nfc" | "manual";
    tokenId?: bigint;
    purchasedAt?: Date;
    idempotencyKey: string;
    highAmountConfirmed: boolean;
  },
) {
  return prisma.$transaction(async (tx) => {
    const company = await lockCompanyContext(tx, context, true);
    const existing = await tx.purchase.findFirst({
      where: { companyId: context.companyId, idempotencyKey: data.idempotencyKey },
    });
    if (existing) {
      if (!sameIdempotentRequest(existing, context, data)) {
        throw new PurchaseError("IDEMPOTENCY_CONFLICT", "Kľúč požiadavky už bol použitý.", 409);
      }
      return { purchase: existing, replayed: true };
    }

    const partner = await tx.partner.findFirst({
      where: { id: data.partnerId, companyId: context.companyId, isActive: true },
      select: { id: true },
    });
    if (!partner) throw new PurchaseError("NOT_FOUND", "Partner sa nenašiel.", 404);

    if (data.tokenId) {
      if (data.source === "manual") {
        throw new PurchaseError("VALIDATION_ERROR", "Ručný zápis nemôže obsahovať token.", 400);
      }
      const token = await tx.partnerToken.findFirst({
        where: {
          id: data.tokenId, companyId: context.companyId, partnerId: data.partnerId,
          type: data.source, isActive: true,
        },
        select: { id: true },
      });
      if (!token) throw new PurchaseError("NOT_FOUND", "Karta nie je platná.", 404);
    }

    const limit = company.purchaseConfirmAboveEur;
    const threshold = limit?.toFixed(2) ?? null;
    if (threshold !== null && purchaseNeedsConfirmation(data.amount, threshold) && !data.highAmountConfirmed) {
      throw new PurchaseError(
        "PURCHASE_CONFIRMATION_REQUIRED",
        `Potvrďte zápis nákupu od ${threshold} €.`,
        409,
        { threshold },
      );
    }

    const amounts = netAmountFromGross(data.amount, company.vatRatePercent.toFixed(2));
    const purchase = await tx.purchase.create({
      data: {
        companyId: context.companyId,
        partnerId: data.partnerId,
        amount: amounts.grossAmount,
        netAmount: amounts.netAmount,
        vatRatePercent: company.vatRatePercent,
        points: pointsForAmount(amounts.netAmount),
        partnerPresent: data.partnerPresent,
        note: data.note,
        source: data.source,
        tokenId: data.tokenId,
        purchasedAt: data.purchasedAt,
        idempotencyKey: data.idempotencyKey,
        createdByUserId: context.user.id,
      },
    });
    await record({
      companyId: context.companyId,
      userId: context.user.id,
      action: "purchase.create",
      entityType: "purchase",
      entityId: purchase.id,
      partnerId: purchase.partnerId,
      newValues: valuesForAudit(purchase),
    }, tx);
    return { purchase, replayed: false };
  });
}

export async function updatePurchase(
  context: CompanyContext,
  id: bigint,
  data: {
    partnerId?: bigint;
    amount?: string;
    partnerPresent?: boolean;
    note?: string | null;
    purchasedAt?: Date;
    reason: string;
  },
) {
  return prisma.$transaction(async (tx) => {
    await lockCompanyContext(tx, context, true);
    await tx.$queryRaw`SELECT id FROM purchases WHERE id = ${id} AND company_id = ${context.companyId} FOR UPDATE`;
    const current = await tx.purchase.findFirst({
      where: { id, companyId: context.companyId },
    });
    if (!current) throw new PurchaseError("NOT_FOUND", "Nákup sa nenašiel.", 404);
    if (current.isDeleted) throw new PurchaseError("PURCHASE_DELETED", "Zmazaný nákup nemožno upraviť.");

    const partnerId = data.partnerId ?? current.partnerId;
    if (data.partnerId !== undefined) {
      const partner = await tx.partner.findFirst({
        where: { id: partnerId, companyId: context.companyId, isActive: true },
        select: { id: true },
      });
      if (!partner) throw new PurchaseError("NOT_FOUND", "Partner sa nenašiel.", 404);
    }
    const amounts = data.amount === undefined
      ? null
      : netAmountFromGross(data.amount, current.vatRatePercent.toFixed(2));
    const updatedAt = new Date();
    await tx.purchase.updateMany({
      where: { id, companyId: context.companyId, isDeleted: false },
      data: {
        partnerId,
        ...(amounts ? {
          amount: amounts.grossAmount,
          netAmount: amounts.netAmount,
          points: pointsForAmount(amounts.netAmount),
        } : {}),
        ...(data.partnerPresent !== undefined ? { partnerPresent: data.partnerPresent } : {}),
        ...(data.note !== undefined ? { note: data.note || null } : {}),
        ...(data.purchasedAt !== undefined ? { purchasedAt: data.purchasedAt } : {}),
        updatedByUserId: context.user.id,
        updatedAt,
      },
    });
    const updated = await tx.purchase.findFirstOrThrow({
      where: { id, companyId: context.companyId },
    });
    await record({
      companyId: context.companyId,
      userId: context.user.id,
      action: "purchase.update",
      entityType: "purchase",
      entityId: updated.id,
      partnerId: updated.partnerId,
      oldValues: valuesForAudit(current),
      newValues: valuesForAudit(updated),
      reason: data.reason,
    }, tx);
    return updated;
  });
}

export async function deletePurchase(
  context: CompanyContext,
  id: bigint,
  reason: string,
) {
  return prisma.$transaction(async (tx) => {
    await lockCompanyContext(tx, context, true);
    await tx.$queryRaw`SELECT id FROM purchases WHERE id = ${id} AND company_id = ${context.companyId} FOR UPDATE`;
    const current = await tx.purchase.findFirst({
      where: { id, companyId: context.companyId },
    });
    if (!current) throw new PurchaseError("NOT_FOUND", "Nákup sa nenašiel.", 404);
    if (current.isDeleted) throw new PurchaseError("PURCHASE_DELETED", "Nákup už bol zmazaný.");

    const deletedAt = new Date();
    await tx.purchase.updateMany({
      where: { id, companyId: context.companyId, isDeleted: false },
      data: {
        isDeleted: true,
        deletedAt,
        deletedByUserId: context.user.id,
        updatedByUserId: context.user.id,
        updatedAt: deletedAt,
      },
    });
    const deleted = await tx.purchase.findFirstOrThrow({
      where: { id, companyId: context.companyId },
    });
    await record({
      companyId: context.companyId,
      userId: context.user.id,
      action: "purchase.delete",
      entityType: "purchase",
      entityId: deleted.id,
      partnerId: deleted.partnerId,
      oldValues: valuesForAudit(current),
      newValues: valuesForAudit(deleted),
      reason,
    }, tx);
    return deleted;
  });
}

export async function listPurchases(
  context: CompanyContext,
  where: Prisma.PurchaseWhereInput,
  skip: number,
  take: number,
) {
  const scopedWhere: Prisma.PurchaseWhereInput = {
    ...where,
    companyId: context.companyId,
  };
  const [items, total] = await Promise.all([
    prisma.purchase.findMany({
      where: scopedWhere,
      include: {
        partner: { select: { id: true, code: true, displayName: true } },
        createdBy: { select: { id: true, name: true } },
      },
      orderBy: [{ purchasedAt: "desc" }, { id: "desc" }],
      skip,
      take,
    }),
    prisma.purchase.count({ where: scopedWhere }),
  ]);
  return {
    items: items.map((purchase) => ({
      ...purchaseResponse(purchase),
      partner: {
        id: purchase.partner.id.toString(),
        code: purchase.partner.code,
        displayName: purchase.partner.displayName,
      },
      createdBy: { id: purchase.createdBy.id.toString(), name: purchase.createdBy.name },
    })),
    total,
  };
}
