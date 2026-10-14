import { NextResponse } from "next/server";

import { parseUserId } from "@/server/auth/http";
import { isAuthContext, requireCompanyRole } from "@/server/auth/session";
import { prisma } from "@/server/db";

type RouteContext = { params: Promise<{ id: string }> };

export async function GET(_request: Request, { params }: RouteContext) {
  const authorization = await requireCompanyRole(["admin", "seller"]);
  if (!isAuthContext(authorization)) return authorization;

  const { id } = await params;
  const partnerId = parseUserId(id);
  if (!partnerId) return invalidPartnerIdResponse();

  const partner = await prisma.partner.findFirst({
    where: {
      companyId: authorization.companyId,
      id: partnerId,
      ...(authorization.user.role === "seller" ? { isActive: true } : {}),
    },
    select: { id: true, code: true, displayName: true },
  });
  if (!partner) return notFoundResponse();

  const totals = await prisma.purchase.aggregate({
    where: { companyId: authorization.companyId, partnerId, isDeleted: false },
    _sum: { points: true, amount: true, netAmount: true },
  });

  return NextResponse.json({
    partner: {
      id: partner.id.toString(),
      code: partner.code,
      displayName: partner.displayName,
      totalPoints: totals._sum.points ?? 0,
      totalAmount: totals._sum.amount?.toFixed(2) ?? "0.00",
      totalGrossAmount: totals._sum.amount?.toFixed(2) ?? "0.00",
      totalNetAmount: totals._sum.netAmount?.toFixed(2) ?? "0.00",
    },
  }, { headers: { "Cache-Control": "no-store" } });
}

function invalidPartnerIdResponse() {
  return NextResponse.json(
    { error: { code: "VALIDATION_ERROR", message: "Neplatné ID partnera." } },
    { status: 400 },
  );
}

function notFoundResponse() {
  return NextResponse.json(
    { error: { code: "NOT_FOUND", message: "Partner sa nenašiel." } },
    { status: 404 },
  );
}
