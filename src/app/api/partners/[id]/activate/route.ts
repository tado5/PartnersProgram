import { NextResponse } from "next/server";

import { record } from "@/server/audit";
import { hasSameOrigin, parseUserId } from "@/server/auth/http";
import { isAuthContext, requireCompanyRole, lockCompanyContext, withCompanyErrors } from "@/server/auth/session";
import { prisma } from "@/server/db";

type RouteContext = { params: Promise<{ id: string }> };

export const POST = withCompanyErrors(activatePartner);

async function activatePartner(request: Request, { params }: RouteContext) {
  if (!hasSameOrigin(request)) {
    return NextResponse.json(
      { error: { code: "INVALID_ORIGIN", message: "Neplatný pôvod požiadavky." } },
      { status: 403 },
    );
  }
  const authorization = await requireCompanyRole(["admin"]);
  if (!isAuthContext(authorization)) return authorization;

  const { id } = await params;
  const partnerId = parseUserId(id);
  if (!partnerId) return invalidPartnerIdResponse();
  const current = await prisma.partner.findFirst({ where: { id: partnerId, companyId: authorization.companyId } });
  if (!current) return notFoundResponse();
  if (current.isActive) {
    return NextResponse.json({ partner: { id: current.id.toString(), isActive: true } });
  }

  const partner = await prisma.$transaction(async (tx) => {
    await lockCompanyContext(tx, authorization);
    const updated = await tx.partner.update({
      where: { id: partnerId, companyId: authorization.companyId },
      data: { isActive: true, deactivatedAt: null },
    });
    await record(
      {
        userId: authorization.user.id,
        companyId: authorization.companyId,
        action: "partner.activate",
        entityType: "partner",
        entityId: updated.id,
        partnerId: updated.id,
        oldValues: { isActive: current.isActive },
        newValues: { isActive: updated.isActive },
      },
      tx,
    );
    return updated;
  });

  return NextResponse.json({ partner: { id: partner.id.toString(), isActive: true } });
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
