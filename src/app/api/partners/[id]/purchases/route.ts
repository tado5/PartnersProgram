import { NextResponse } from "next/server";

import { parseUserId } from "@/server/auth/http";
import { isAuthContext, requireCompanyRole } from "@/server/auth/session";
import { prisma } from "@/server/db";
import { listPurchases } from "@/server/purchases";

type RouteContext = { params: Promise<{ id: string }> };

export async function GET(request: Request, { params }: RouteContext) {
  const authorization = await requireCompanyRole(["admin"]);
  if (!isAuthContext(authorization)) return authorization;
  const partnerId = parseUserId((await params).id);
  if (!partnerId) {
    return NextResponse.json(
      { error: { code: "VALIDATION_ERROR", message: "Neplatné ID partnera." } },
      { status: 400 },
    );
  }
  const partner = await prisma.partner.findFirst({
    where: { id: partnerId, companyId: authorization.companyId },
    select: { id: true },
  });
  if (!partner) {
    return NextResponse.json(
      { error: { code: "NOT_FOUND", message: "Partner sa nenašiel." } },
      { status: 404 },
    );
  }
  const page = Number(new URL(request.url).searchParams.get("page") ?? "1");
  if (!Number.isInteger(page) || page < 1 || page > 10000) {
    return NextResponse.json(
      { error: { code: "VALIDATION_ERROR", message: "Neplatná strana." } },
      { status: 400 },
    );
  }
  const result = await listPurchases(authorization, { partnerId }, (page - 1) * 20, 20);
  return NextResponse.json(
    { ...result, page, pageSize: 20 },
    { headers: { "Cache-Control": "no-store" } },
  );
}
