import { parseUserId } from "@/server/auth/http";
import { superadminApi } from "@/server/auth/superadmin";
import { CompanyError } from "@/server/companies";
import { prisma } from "@/server/db";
import { env } from "@/lib/env";
import { zonedCalendarDayRange } from "@/lib/dates";

export async function GET(request: Request) {
  return superadminApi(async () => {
    const query = new URL(request.url).searchParams;
    const input = query.get("companyId");
    const companyId = input ? parseUserId(input) : null;
    const page = Number(query.get("page") ?? 1);
    const fromInput = query.get("from") ?? "";
    const toInput = query.get("to") ?? "";
    if ((input && !companyId) || !Number.isInteger(page) || page < 1 || page > 10000 ||
        (fromInput && !isCalendarDate(fromInput)) || (toInput && !isCalendarDate(toInput)) ||
        (fromInput && toInput && fromInput > toInput)) {
      throw new CompanyError("VALIDATION_ERROR", "Neplatné filtre.", 400);
    }
    let createdAt: { gte?: Date; lt?: Date } | undefined;
    try {
      if (fromInput || toInput) {
        const start = fromInput ? zonedCalendarDayRange(...dateParts(fromInput), env.APP_TIMEZONE).start : undefined;
        const end = toInput ? zonedCalendarDayRange(...dateParts(toInput), env.APP_TIMEZONE).end : undefined;
        createdAt = { ...(start ? { gte: start } : {}), ...(end ? { lt: end } : {}) };
      }
    } catch {
      throw new CompanyError("VALIDATION_ERROR", "Neplatné filtre.", 400);
    }
    const where = { companyId, ...(createdAt ? { createdAt } : {}) };
    const [items, total] = await Promise.all([
      prisma.auditLog.findMany({ where, skip: (page - 1) * 20, take: 20,
        include: {
          user: { select: { id: true, name: true, role: true } },
          company: { select: { id: true, name: true } },
        },
        orderBy: [{ createdAt: "desc" }, { id: "desc" }] }),
      prisma.auditLog.count({ where }),
    ]);
    return {
      items: items.map((item) => ({
        id: item.id.toString(), companyId: item.companyId?.toString() ?? null,
        userId: item.userId?.toString() ?? null, action: item.action, entityType: item.entityType,
        entityId: item.entityId?.toString() ?? null, partnerId: item.partnerId?.toString() ?? null,
        actor: item.user ? { id: item.user.id.toString(), name: item.user.name, role: item.user.role } : null,
        company: item.company ? { id: item.company.id.toString(), name: item.company.name } : null,
        reason: item.reason, createdAt: item.createdAt,
      })), page, pageSize: 20, total,
    };
  });
}

function isCalendarDate(value: string) {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  if (!match) return false;
  const [year, month, day] = match.slice(1).map(Number);
  const date = new Date(Date.UTC(year, month - 1, day));
  return date.getUTCFullYear() === year && date.getUTCMonth() + 1 === month && date.getUTCDate() === day;
}

function dateParts(value: string): [number, number, number] {
  const [year, month, day] = value.split("-").map(Number);
  return [year, month, day];
}
