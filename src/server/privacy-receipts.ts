import type { Prisma } from "@prisma/client";
import { NextResponse } from "next/server";

import { privacyReceiptSchema } from "@/lib/privacy";
import { z } from "zod";
import { record } from "./audit";
import type { CompanyContext } from "./auth/session";
import { currentPrivacyNotice } from "./privacy";
import { prisma, type DbClient } from "./db";

export class PrivacyReceiptError extends Error {
  constructor(public code: string, message: string, public status: number) { super(message); }
}

export function withPrivacyReceiptErrors<Args extends unknown[]>(handler: (...args: Args) => Promise<Response>) {
  return async (...args: Args) => {
    try { return await handler(...args); } catch (error) {
      if (!(error instanceof PrivacyReceiptError)) throw error;
      return NextResponse.json({ error: { code: error.code, message: error.message } }, {
        status: error.status, headers: { "Cache-Control": "no-store" },
      });
    }
  };
}

export async function requirePublishedPrivacy(companyId: bigint, db: DbClient = prisma) {
  const current = await currentPrivacyNotice(companyId, db);
  if (!current) throw new PrivacyReceiptError(
    "PRIVACY_NOTICE_REQUIRED", "Pred registráciou partnera musí admin firmy publikovať informačné oznámenie.", 409,
  );
  return current;
}

export async function validatePrivacyReceipt(
  tx: Prisma.TransactionClient, companyId: bigint,
  input: z.infer<typeof privacyReceiptSchema>, requireCurrent = false,
) {
  if (BigInt(input.noticeId) > BigInt("9223372036854775807")) {
    throw new PrivacyReceiptError("PRIVACY_NOTICE_NOT_FOUND", "Oznámenie sa nenašlo.", 404);
  }
  const notice = await tx.companyPrivacyNotice.findFirst({
    where: { id: BigInt(input.noticeId), companyId },
  });
  if (!notice) throw new PrivacyReceiptError("PRIVACY_NOTICE_NOT_FOUND", "Oznámenie sa nenašlo.", 404);
  if (requireCurrent) {
    const current = await requirePublishedPrivacy(companyId, tx);
    if (notice.id !== current.id) throw new PrivacyReceiptError(
      "PRIVACY_NOTICE_CHANGED", "Oznámenie sa zmenilo. Obnovte formulár a poskytnite aktuálnu verziu.", 409,
    );
  }
  const providedAt = new Date(input.providedAt);
  if (providedAt.getTime() > Date.now() || providedAt < notice.publishedAt) {
    throw new PrivacyReceiptError(
      "INVALID_PRIVACY_DATE", "Dátum poskytnutia nesmie byť v budúcnosti ani pred publikovaním uvedenej verzie.", 400,
    );
  }
  return { notice, providedAt };
}

export async function appendPrivacyReceipt(
  tx: Prisma.TransactionClient, context: CompanyContext, partnerId: bigint,
  input: z.infer<typeof privacyReceiptSchema>, requireCurrent = false,
) {
  const { providedAt } = await validatePrivacyReceipt(tx, context.companyId, input, requireCurrent);
  const previous = await tx.companyPrivacyReceipt.findFirst({
    where: { companyId: context.companyId, partnerId }, select: { id: true },
  });
  if (previous && !input.reason) throw new PrivacyReceiptError(
    "PRIVACY_REASON_REQUIRED", "Pri ďalšom zázname uveďte dôvod opakovaného informovania alebo opravy.", 400,
  );
  const receipt = await tx.companyPrivacyReceipt.create({
    data: {
      companyId: context.companyId, partnerId, noticeId: BigInt(input.noticeId),
      providedAt, method: input.method, recordedByUserId: context.user.id, reason: input.reason ?? null,
    },
  });
  await record({
    companyId: context.companyId, userId: context.user.id, partnerId,
    action: "partner.privacy_provided", entityType: "partner", entityId: partnerId,
    reason: input.reason ?? null,
    newValues: { noticeId: input.noticeId, providedAt: providedAt.toISOString(), method: input.method, receiptId: receipt.id.toString() },
  }, tx);
  return receipt;
}

export async function listPrivacyReceipts(companyId: bigint, partnerId: bigint, db: DbClient = prisma) {
  const receipts = await db.companyPrivacyReceipt.findMany({
    where: { companyId, partnerId }, orderBy: [{ recordedAt: "desc" }, { id: "desc" }],
    include: { notice: { select: { version: true } }, recordedBy: { select: { name: true } } },
  });
  return receipts.map((receipt) => ({
    id: receipt.id.toString(), noticeId: receipt.noticeId.toString(), version: receipt.notice.version,
    providedAt: receipt.providedAt.toISOString(), method: receipt.method,
    recordedAt: receipt.recordedAt.toISOString(), recordedBy: receipt.recordedBy.name, reason: receipt.reason,
  }));
}
