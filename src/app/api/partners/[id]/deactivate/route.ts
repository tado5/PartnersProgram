import { NextResponse } from "next/server";

import { partnerDeactivateSchema } from "@/lib/schemas";
import { record } from "@/server/audit";
import {
  hasSameOrigin,
  parseUserId,
  readJson,
} from "@/server/auth/http";
import { isAuthContext, requireCompanyRole, lockCompanyContext, withCompanyErrors } from "@/server/auth/session";
import { prisma } from "@/server/db";

type RouteContext = { params: Promise<{ id: string }> };

export const POST = withCompanyErrors(deactivatePartner);

async function deactivatePartner(request: Request, { params }: RouteContext) {
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
  const parsed = await readJson(request, partnerDeactivateSchema);
  if ("response" in parsed) return parsed.response;

  const current = await prisma.partner.findFirst({ where: { id: partnerId, companyId: authorization.companyId } });
  if (!current) return notFoundResponse();
  if (!current.isActive) {
    return NextResponse.json({ partner: { id: current.id.toString(), isActive: false } });
  }

  const partner = await prisma.$transaction(async (tx) => {
    await lockCompanyContext(tx, authorization);
    const updated = await tx.partner.update({
      where: { id: partnerId, companyId: authorization.companyId },
      data: { isActive: false, deactivatedAt: new Date() },
    });
    await record(
      {
        userId: authorization.user.id,
        companyId: authorization.companyId,
        action: "partner.deactivate",
        entityType: "partner",
        entityId: updated.id,
        partnerId: updated.id,
        oldValues: { isActive: current.isActive },
        newValues: { isActive: updated.isActive },
        reason: parsed.data.reason,
      },
      tx,
    );
    return updated;
  });

  return NextResponse.json({ partner: { id: partner.id.toString(), isActive: false } });
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
