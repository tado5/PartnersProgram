import type { AuditLog, Prisma } from "@prisma/client";

import { sanitizeAuditValues } from "@/lib/audit";
import { prisma, type DbClient } from "./db";

export async function record(
  data: Prisma.AuditLogUncheckedCreateInput,
  db: DbClient = prisma,
): Promise<AuditLog> {
  if (data.userId) {
    const actor = await db.user.findUnique({ where: { id: data.userId } });
    if (!actor || (actor.role !== "superadmin" && actor.companyId !== (data.companyId ?? null))) {
      throw new Error("Audit actor does not belong to the event company.");
    }
  }
  if (data.partnerId) {
    if (!data.companyId || !await db.partner.findFirst({
      where: { id: data.partnerId, companyId: data.companyId },
      select: { id: true },
    })) throw new Error("Audit partner does not belong to the event company.");
  }
  return db.auditLog.create({
    data: {
      ...data,
      ...(data.oldValues === undefined ? {} : { oldValues: sanitizeAuditValues(data.oldValues) }),
      ...(data.newValues === undefined ? {} : { newValues: sanitizeAuditValues(data.newValues) }),
    },
  });
}
