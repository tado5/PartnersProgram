import "server-only";

import { createHash } from "node:crypto";

import { env } from "@/lib/env";
import { badgeLabel, getMonthlyBadge, type BadgeTier } from "@/lib/monthly-badges";
import { zonedMonthRange } from "@/lib/dates";
import { prisma } from "./db";

const pageSize = 20;

export async function getPublicCard(token: string, page: number, now = new Date()) {
  const tokenHash = createHash("sha256").update(token).digest("hex");
  const tokenRecord = await prisma.partnerToken.findFirst({
    where: {
      tokenHash,
      isActive: true,
      company: { isActive: true },
      partner: { isActive: true },
    },
    select: {
      id: true,
      companyId: true,
      company: {
        select: {
          name: true,
          vatRatePercent: true,
          bronzeMonthlyTurnoverEur: true,
          silverMonthlyTurnoverEur: true,
          goldMonthlyTurnoverEur: true,
        },
      },
      partner: { select: { id: true, displayName: true, code: true } },
    },
  });
  if (!tokenRecord) return null;

  const month = zonedMonthRange(now, env.APP_TIMEZONE);
  const purchasesWhere = {
    companyId: tokenRecord.companyId,
    partnerId: tokenRecord.partner.id,
    isDeleted: false,
  };

  await prisma.partnerToken.updateMany({
    where: { id: tokenRecord.id, companyId: tokenRecord.companyId, isActive: true },
    data: { lastUsedAt: now },
  });

  const [lifetime, currentMonth, purchases, purchaseCount, historyCounts, awards] = await Promise.all([
    prisma.purchase.aggregate({
      where: purchasesWhere,
      _sum: { points: true, amount: true, netAmount: true },
    }),
    prisma.purchase.aggregate({
      where: { ...purchasesWhere, purchasedAt: { gte: month.start, lt: month.end } },
      _sum: { points: true, amount: true, netAmount: true },
    }),
    prisma.purchase.findMany({
      where: purchasesWhere,
      select: { purchasedAt: true, amount: true, netAmount: true, vatRatePercent: true, points: true, partnerPresent: true },
      orderBy: [{ purchasedAt: "desc" }, { id: "desc" }],
      skip: (page - 1) * pageSize,
      take: pageSize,
    }),
    prisma.purchase.count({ where: purchasesWhere }),
    prisma.partnerBadgeAward.groupBy({
      by: ["tier"],
      where: { companyId: tokenRecord.companyId, partnerId: tokenRecord.partner.id },
      _count: { _all: true },
    }),
    prisma.partnerBadgeAward.findMany({
      where: { companyId: tokenRecord.companyId, partnerId: tokenRecord.partner.id },
      select: { periodStart: true, tier: true, monthlyTurnover: true, thresholdEur: true, calculationBasis: true },
      orderBy: [{ periodStart: "desc" }, { id: "desc" }],
    }),
  ]);

  const thresholds = {
    bronzeMonthlyTurnoverEur: tokenRecord.company.bronzeMonthlyTurnoverEur?.toFixed(2) ?? null,
    silverMonthlyTurnoverEur: tokenRecord.company.silverMonthlyTurnoverEur?.toFixed(2) ?? null,
    goldMonthlyTurnoverEur: tokenRecord.company.goldMonthlyTurnoverEur?.toFixed(2) ?? null,
  };
  const monthlyAmount = currentMonth._sum.netAmount?.toFixed(2) ?? "0.00";
  const counts: Record<BadgeTier, number> = { bronze: 0, silver: 0, gold: 0 };
  for (const row of historyCounts) {
    counts[row.tier] = row._count._all;
  }

  return {
    companyName: tokenRecord.company.name,
    displayName: tokenRecord.partner.displayName,
    code: tokenRecord.partner.code,
    totalPoints: lifetime._sum.points ?? 0,
    totalGrossAmount: lifetime._sum.amount?.toFixed(2) ?? "0.00",
    totalNetAmount: lifetime._sum.netAmount?.toFixed(2) ?? "0.00",
    vatRatePercent: tokenRecord.company.vatRatePercent.toFixed(2),
    monthPoints: currentMonth._sum.points ?? 0,
    monthGrossAmount: currentMonth._sum.amount?.toFixed(2) ?? "0.00",
    monthNetAmount: monthlyAmount,
    badge: getMonthlyBadge(monthlyAmount, thresholds),
    badgeHistory: {
      counts,
      awards: awards.map((award) => ({
        period: award.periodStart.toISOString().slice(0, 7),
        tier: award.tier,
        label: badgeLabel(award.tier),
        monthlyTurnover: award.monthlyTurnover.toFixed(2),
        threshold: award.thresholdEur.toFixed(2),
        calculationBasis: award.calculationBasis,
      })),
    },
    purchases: {
      items: purchases.map((purchase) => ({
        date: purchase.purchasedAt.toISOString(),
        grossAmount: purchase.amount.toFixed(2),
        netAmount: purchase.netAmount.toFixed(2),
        vatRatePercent: purchase.vatRatePercent.toFixed(2),
        points: purchase.points,
        partnerPresent: purchase.partnerPresent,
      })),
      page,
      pageSize,
      total: purchaseCount,
    },
  };
}
