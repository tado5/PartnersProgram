import { MonetaryBasis, type Prisma } from "@prisma/client";
import { env } from "@/lib/env";
import { getMonthlyBadge } from "@/lib/monthly-badges";
import { zonedCalendarMonthRange, zonedMonthRange } from "@/lib/dates";
import { prisma } from "./db";

const tierThresholdField = {
  bronze: "bronzeMonthlyTurnoverEur",
  silver: "silverMonthlyTurnoverEur",
  gold: "goldMonthlyTurnoverEur",
} as const;

export function previousCalendarMonth(now: Date, timeZone: string) {
  const current = zonedMonthRange(now, timeZone);
  const [year, month] = current.periodStart.split("-").map(Number);
  const previousMonth = new Date(Date.UTC(year, month - 2, 1));
  return zonedCalendarMonthRange(
    previousMonth.getUTCFullYear(),
    previousMonth.getUTCMonth() + 1,
    timeZone,
  );
}

export async function closeMonthlyBadges(now = new Date(), requestedPeriod?: string) {
  const period = requestedPeriod
    ? periodRange(requestedPeriod)
    : previousCalendarMonth(now, env.APP_TIMEZONE);
  if (period.end > now) throw new Error("Cannot close a calendar month that has not ended.");
  const periodStartDate = new Date(`${period.periodStart}T00:00:00.000Z`);

  const companies = await prisma.company.findMany({ select: { id: true } });
  let inserted = 0;

  for (const { id: companyId } of companies) {
    inserted += await prisma.$transaction(async (tx) => {
      await tx.$queryRaw`SELECT id FROM companies WHERE id = ${companyId} FOR UPDATE`;
      const company = await tx.company.findUnique({
        where: { id: companyId },
        select: { id: true },
      });
      if (!company) return 0;

      const groups = await tx.purchase.groupBy({
        by: ["partnerId"],
        where: {
          companyId,
          isDeleted: false,
          purchasedAt: { gte: period.start, lt: period.end },
        },
        _sum: { netAmount: true },
      });
      const thresholds = await thresholdsAtMonthEnd(tx, companyId, period.end);
      const awards = groups.flatMap((group) => {
        const monthlyAmount = group._sum.netAmount?.toFixed(2) ?? "0.00";
        const badge = getMonthlyBadge(monthlyAmount, thresholds);
        if (!badge.tier) return [];
        const threshold = thresholds[tierThresholdField[badge.tier]];
        if (!threshold) return [];
        return [{
          companyId,
          partnerId: group.partnerId,
          periodStart: periodStartDate,
          tier: badge.tier,
          monthlyTurnover: monthlyAmount,
          thresholdEur: threshold,
          calculationBasis: MonetaryBasis.net,
        }];
      });
      if (!awards.length) return 0;

      const result = await tx.partnerBadgeAward.createMany({
        data: awards,
        skipDuplicates: true,
      });
      return result.count;
    });
  }

  return { period: period.periodStart.slice(0, 7), companies: companies.length, inserted };
}

async function thresholdsAtMonthEnd(
  tx: Prisma.TransactionClient,
  companyId: bigint,
  periodEnd: Date,
) {
  const change = await tx.auditLog.findFirst({
    where: {
      companyId,
      entityType: "company",
      entityId: companyId,
      action: "company.update",
      createdAt: { lt: periodEnd },
    },
    select: { newValues: true },
    orderBy: [{ createdAt: "desc" }, { id: "desc" }],
  });
  const values = change?.newValues;
  if (!values || typeof values !== "object" || Array.isArray(values)) {
    return {
      bronzeMonthlyTurnoverEur: null,
      silverMonthlyTurnoverEur: null,
      goldMonthlyTurnoverEur: null,
    };
  }
  const getThreshold = (key: string) => {
    const value = (values as Prisma.JsonObject)[key];
    return typeof value === "string" ? value : null;
  };
  return {
    bronzeMonthlyTurnoverEur: getThreshold("bronzeMonthlyTurnoverEur"),
    silverMonthlyTurnoverEur: getThreshold("silverMonthlyTurnoverEur"),
    goldMonthlyTurnoverEur: getThreshold("goldMonthlyTurnoverEur"),
  };
}

function periodRange(value: string) {
  const match = /^(\d{4})-(0[1-9]|1[0-2])$/.exec(value);
  if (!match) throw new Error("Month must be specified as YYYY-MM.");
  const year = Number(match[1]);
  const month = Number(match[2]);
  return zonedCalendarMonthRange(year, month, env.APP_TIMEZONE);
}
