import type { PartnerToken, Prisma } from "@prisma/client";

import { record } from "../audit";
import { prisma, type DbClient } from "../db";
import { lockCompanyContext, type CompanyContext } from "../auth/session";

export class TokenSelectionChangedError extends Error {}

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

export async function rotatePartnerToken(
  context: CompanyContext,
  data: {
    partnerId: bigint;
    type: "qr" | "nfc";
    tokenHash: string;
    tokenEncrypted: string;
    tokenHint: string;
    label?: string;
    deactivateTokenIds: bigint[];
    deactivationReason?: string;
  },
) {
  return prisma.$transaction(async (tx) => {
    await lockCompanyContext(tx, context, true);
    const partner = await tx.partner.findFirst({
      where: { id: data.partnerId, companyId: context.companyId },
      select: { id: true, isActive: true },
    });
    if (!partner || !partner.isActive) return { error: "PARTNER_NOT_FOUND" as const };

    const deactivatedIds = data.deactivateTokenIds;
    if (deactivatedIds.length) {
      const members = await tx.partnerToken.count({
        where: {
          id: { in: deactivatedIds },
          companyId: context.companyId,
          partnerId: data.partnerId,
        },
      });
      if (members !== deactivatedIds.length) return { error: "TOKEN_NOT_FOUND" as const };
    }

    const activeTokens = await tx.partnerToken.findMany({
      where: {
        companyId: context.companyId,
        partnerId: data.partnerId,
        type: data.type,
        isActive: true,
      },
      select: { id: true },
    });
    if (activeTokens.some((active) => !deactivatedIds.includes(active.id))) {
      if (deactivatedIds.length) return { error: "TOKEN_SELECTION_CHANGED" as const };
      return { error: "ACTIVE_TOKEN_EXISTS" as const };
    }

    if (deactivatedIds.length) {
      const selected = await tx.partnerToken.findMany({
        where: {
          companyId: context.companyId,
          id: { in: deactivatedIds },
          partnerId: data.partnerId,
          type: data.type,
          isActive: true,
        },
        select: { id: true, type: true, tokenHint: true, label: true },
      });
      if (selected.length !== deactivatedIds.length) {
        return { error: "TOKEN_SELECTION_CHANGED" as const };
      }

      const update = await tx.partnerToken.updateMany({
        where: {
          companyId: context.companyId,
          id: { in: deactivatedIds },
          partnerId: data.partnerId,
          type: data.type,
          isActive: true,
        },
        data: {
          isActive: false,
          deactivatedAt: new Date(),
          deactivatedByUserId: context.user.id,
          deactivationReason: data.deactivationReason,
        },
      });
      if (update.count !== deactivatedIds.length) throw new TokenSelectionChangedError();

      for (const oldToken of selected) {
        await record({
          userId: context.user.id,
          companyId: context.companyId,
          action: "token.deactivate",
          entityType: "token",
          entityId: oldToken.id,
          partnerId: data.partnerId,
          oldValues: { type: oldToken.type, tokenHint: oldToken.tokenHint, isActive: true },
          newValues: { type: oldToken.type, tokenHint: oldToken.tokenHint, isActive: false },
          reason: data.deactivationReason,
        }, tx);
      }
    }

    const created = await tx.partnerToken.create({
      data: {
        companyId: context.companyId,
        partnerId: data.partnerId,
        type: data.type,
        tokenHash: data.tokenHash,
        tokenEncrypted: data.tokenEncrypted,
        tokenHint: data.tokenHint,
        label: data.label,
        createdByUserId: context.user.id,
      },
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
    });
    await record({
      userId: context.user.id,
      companyId: context.companyId,
      action: "token.create",
      entityType: "token",
      entityId: created.id,
      partnerId: data.partnerId,
      newValues: {
        type: created.type,
        tokenHint: created.tokenHint,
        label: created.label,
        isActive: created.isActive,
      },
    }, tx);
    return { token: created };
  });
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
