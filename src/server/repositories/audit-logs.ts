import type { AuditLog, Prisma } from "@prisma/client";

import { prisma, type DbClient } from "../db";
import type { CompanyContext } from "../auth/session";
import { record } from "../audit";
import { AUDIT_PAGE_SIZE } from "@/lib/audit";
import { zonedCalendarDayRange } from "@/lib/dates";
import { parseUserId } from "@/server/auth/http";

const filterableEntityTypes = new Set(["auth", "company", "export", "partner", "purchase", "token", "user"]);

export type CompanyAuditFilters = {
  from: string;
  to: string;
  userId: bigint | null;
  action: string;
  entityType: string;
  entityId: bigint | null;
  partnerId: bigint | null;
  page: number;
  where: Prisma.AuditLogWhereInput;
};

export function parseCompanyAuditFilters(
  query: URLSearchParams,
  companyId: bigint,
  timeZone: string,
): CompanyAuditFilters | null {
  const from = query.get("from") ?? "";
  const to = query.get("to") ?? "";
  const userIdInput = query.get("userId") ?? "";
  const entityIdInput = query.get("entityId") ?? "";
  const partnerIdInput = query.get("partnerId") ?? "";
  const action = query.get("action") ?? "";
  const entityType = query.get("entityType") ?? "";
  const pageInput = query.get("page") ?? "1";
  const page = /^\d{1,5}$/.test(pageInput) ? Number(pageInput) : NaN;
  const userId = userIdInput ? parseUserId(userIdInput) : null;
  const entityId = entityIdInput ? parseUserId(entityIdInput) : null;
  const partnerId = partnerIdInput ? parseUserId(partnerIdInput) : null;

  if (
    (from && !isCalendarDate(from)) ||
    (to && !isCalendarDate(to)) ||
    (from && to && from > to) ||
    (userIdInput && !userId) ||
    (entityIdInput && !entityId) ||
    (partnerIdInput && !partnerId) ||
    (action && !/^[a-z][a-z0-9_.-]{0,63}$/.test(action)) ||
    (entityType && !filterableEntityTypes.has(entityType)) ||
    !Number.isInteger(page) || page < 1 || page > 10_000
  ) {
    return null;
  }

  let createdAt: Prisma.DateTimeFilter<"AuditLog"> | undefined;
  try {
    if (from || to) {
      const start = from ? zonedCalendarDayRange(...parseDateParts(from), timeZone).start : undefined;
      const end = to ? zonedCalendarDayRange(...parseDateParts(to), timeZone).end : undefined;
      createdAt = { ...(start ? { gte: start } : {}), ...(end ? { lt: end } : {}) };
    }
  } catch {
    return null;
  }

  const where: Prisma.AuditLogWhereInput = {
    companyId,
    ...(createdAt ? { createdAt } : {}),
    ...(userId ? { userId } : {}),
    ...(action ? { action } : {}),
    ...(entityType ? { entityType } : {}),
    ...(entityId ? { entityId } : {}),
    ...(partnerId ? { partnerId } : {}),
  };
  return { from, to, userId, action, entityType, entityId, partnerId, page, where };
}

export async function listCompanyAuditLogs(
  filters: CompanyAuditFilters,
  db: DbClient = prisma,
) {
  const [items, total] = await Promise.all([
    db.auditLog.findMany({
      where: filters.where,
      include: {
        user: { select: { id: true, name: true, role: true } },
        partner: { select: { id: true, code: true, displayName: true } },
      },
      orderBy: [{ createdAt: "desc" }, { id: "desc" }],
      skip: (filters.page - 1) * AUDIT_PAGE_SIZE,
      take: AUDIT_PAGE_SIZE,
    }),
    db.auditLog.count({ where: filters.where }),
  ]);
  return { items, page: filters.page, pageSize: AUDIT_PAGE_SIZE, total };
}

function isCalendarDate(value: string) {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  if (!match) return false;
  const [year, month, day] = match.slice(1).map(Number);
  const date = new Date(Date.UTC(year, month - 1, day));
  return date.getUTCFullYear() === year && date.getUTCMonth() + 1 === month && date.getUTCDate() === day;
}

function parseDateParts(value: string): [number, number, number] {
  const [year, month, day] = value.split("-").map(Number);
  return [year, month, day];
}

export function createAuditLog(
  context: CompanyContext,
  data: Omit<Prisma.AuditLogUncheckedCreateInput, "companyId" | "userId">,
  db: DbClient = prisma,
): Promise<AuditLog> {
  return record({ ...data, companyId: context.companyId, userId: context.user.id }, db);
}

export function listPartnerAuditLogs(
  context: CompanyContext,
  partnerId: bigint,
  skip: number,
  take: number,
  db: DbClient = prisma,
) {
  return db.auditLog.findMany({
    where: { partnerId, companyId: context.companyId },
    include: { user: { select: { id: true, name: true, role: true } } },
    orderBy: [{ createdAt: "desc" }, { id: "desc" }],
    skip,
    take,
  });
}
