import { NextResponse } from "next/server";

import { zonedCalendarMonthRange, zonedDayRange } from "@/lib/dates";
import { env } from "@/lib/env";
import { isAuthContext, requireCompanyRole } from "@/server/auth/session";
import { prisma } from "@/server/db";
import { listPurchases } from "@/server/purchases";
import { parseReportMonth } from "@/server/reports";

export async function GET(request: Request) {
  const authorization = await requireCompanyRole(["admin", "seller"]);
  if (!isAuthContext(authorization)) return authorization;
  if (authorization.user.role === "seller") {
    const range = zonedDayRange(new Date(), env.APP_TIMEZONE);
    const result = await listPurchases(authorization, {
      createdByUserId: authorization.user.id,
      createdAt: { gte: range.start, lt: range.end },
      isDeleted: false,
    }, 0, 10);
    return NextResponse.json({
      role: "seller",
      purchases: result.items,
      total: result.total,
    }, { headers: { "Cache-Control": "no-store" } });
  }

  const monthInput = new URL(request.url).searchParams.get("month") ?? undefined;
  const selectedMonth = parseReportMonth(monthInput);
  if (!selectedMonth) {
    return NextResponse.json({
      error: { code: "VALIDATION_ERROR", message: "Neplatné obdobie reportu." },
    }, { status: 400 });
  }
  const range = zonedCalendarMonthRange(selectedMonth.year, selectedMonth.month, env.APP_TIMEZONE);
  const where = {
    companyId: authorization.companyId,
    isDeleted: false,
    purchasedAt: { gte: range.start, lt: range.end },
  };
  const [summary, activePartners, recentPurchases] = await Promise.all([
    prisma.purchase.aggregate({
      where,
      _sum: { amount: true, netAmount: true, points: true },
      _count: { _all: true },
    }),
    prisma.partner.count({ where: { companyId: authorization.companyId, isActive: true } }),
    listPurchases(authorization, where, 0, 10),
  ]);
  return NextResponse.json({
    role: "admin",
    period: range.periodStart.slice(0, 7),
    summary: {
      amount: summary._sum.amount?.toFixed(2) ?? "0.00",
      grossAmount: summary._sum.amount?.toFixed(2) ?? "0.00",
      netAmount: summary._sum.netAmount?.toFixed(2) ?? "0.00",
      points: summary._sum.points ?? 0,
      purchases: summary._count._all,
      activePartners,
    },
    recentPurchases: recentPurchases.items,
  }, { headers: { "Cache-Control": "no-store" } });
}
