import { PartnerType, Prisma } from "@prisma/client";

import { parseCalendarMonth, zonedCalendarDayRange, zonedCalendarMonthRange } from "@/lib/dates";
import { env } from "@/lib/env";
import type { CompanyContext } from "@/server/auth/session";
import { prisma } from "@/server/db";

export function parseReportMonth(value: string | undefined, now = new Date()) {
  if (value === undefined) {
    const parts = new Intl.DateTimeFormat("en-CA", {
      timeZone: env.APP_TIMEZONE, year: "numeric", month: "2-digit",
    }).formatToParts(now);
    return {
      year: Number(parts.find((part) => part.type === "year")?.value),
      month: Number(parts.find((part) => part.type === "month")?.value),
    };
  }
  return parseCalendarMonth(value);
}

export const MAX_REPORT_RANGE_DAYS = 366;

export type ReportPeriod =
  | { kind: "month"; month: string; from: string; to: string; start: Date; end: Date }
  | { kind: "range"; month: null; from: string; to: string; start: Date; end: Date };

/**
 * Resolves `?month=YYYY-MM` or `?from=YYYY-MM-DD&to=YYYY-MM-DD` (inclusive days in
 * APP_TIMEZONE). Defaults to the current month. Returns null for invalid input.
 */
export function parseReportPeriod(
  params: Record<string, string | string[] | undefined>,
  now = new Date(),
): ReportPeriod | null {
  const from = typeof params.from === "string" && params.from ? params.from : undefined;
  const to = typeof params.to === "string" && params.to ? params.to : undefined;
  if (from || to) {
    if (!from || !to || from > to) return null;
    const fromDay = parseCalendarDay(from);
    const toDay = parseCalendarDay(to);
    if (!fromDay || !toDay) return null;
    const days = (Date.parse(`${to}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`)) / 86_400_000 + 1;
    if (days > MAX_REPORT_RANGE_DAYS) return null;
    return { kind: "range", month: null, from, to, start: fromDay.start, end: toDay.end };
  }
  const selected = parseReportMonth(typeof params.month === "string" ? params.month : undefined, now);
  if (!selected) return null;
  const range = zonedCalendarMonthRange(selected.year, selected.month, env.APP_TIMEZONE);
  const lastDay = new Date(Date.UTC(selected.year, selected.month, 0)).toISOString().slice(0, 10);
  return {
    kind: "month", month: range.periodStart.slice(0, 7),
    from: range.periodStart, to: lastDay, start: range.start, end: range.end,
  };
}

function parseCalendarDay(value: string) {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  if (!match) return null;
  try {
    return zonedCalendarDayRange(Number(match[1]), Number(match[2]), Number(match[3]), env.APP_TIMEZONE);
  } catch (error) {
    if (error instanceof RangeError) return null;
    throw error;
  }
}

export async function getMonthlyReport(
  context: CompanyContext,
  year: number,
  month: number,
  type?: PartnerType,
) {
  const range = zonedCalendarMonthRange(year, month, env.APP_TIMEZONE);
  return {
    period: range.periodStart.slice(0, 7),
    ...(await getPeriodReport(context, range, type)),
  };
}

export async function getPeriodReport(
  context: CompanyContext,
  range: { start: Date; end: Date },
  type?: PartnerType,
) {
  const where: Prisma.PurchaseWhereInput = {
    companyId: context.companyId,
    isDeleted: false,
    purchasedAt: { gte: range.start, lt: range.end },
    ...(type ? { partner: { type } } : {}),
  };
  const [summary, grouped] = await Promise.all([
    prisma.purchase.aggregate({
      where,
      _sum: { amount: true, netAmount: true, points: true },
      _count: { _all: true },
    }),
    prisma.purchase.groupBy({
      by: ["partnerId"],
      where,
      _sum: { amount: true, netAmount: true, points: true },
      _count: { _all: true },
      orderBy: [{ _sum: { netAmount: "desc" } }, { partnerId: "asc" }],
    }),
  ]);
  const partners = await prisma.partner.findMany({
    where: {
      companyId: context.companyId,
      id: { in: grouped.map((row) => row.partnerId) },
    },
    select: { id: true, code: true, displayName: true, type: true },
  });
  const partnerById = new Map(partners.map((partner) => [partner.id, partner]));

  return {
    summary: {
      amount: summary._sum.amount?.toFixed(2) ?? "0.00",
      grossAmount: summary._sum.amount?.toFixed(2) ?? "0.00",
      netAmount: summary._sum.netAmount?.toFixed(2) ?? "0.00",
      points: summary._sum.points ?? 0,
      purchases: summary._count._all,
    },
    partners: grouped.flatMap((row) => {
      const partner = partnerById.get(row.partnerId);
      if (!partner) return [];
      return [{
        id: partner.id.toString(),
        code: partner.code,
        displayName: partner.displayName,
        type: partner.type,
        amount: row._sum.amount?.toFixed(2) ?? "0.00",
        grossAmount: row._sum.amount?.toFixed(2) ?? "0.00",
        netAmount: row._sum.netAmount?.toFixed(2) ?? "0.00",
        points: row._sum.points ?? 0,
        purchases: row._count._all,
      }];
    }),
  };
}
