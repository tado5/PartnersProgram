import { Prisma } from "@prisma/client";
import { NextResponse } from "next/server";

import { partnerUpdateSchema } from "@/lib/schemas";
import { record } from "@/server/audit";
import {
  hasSameOrigin,
  parseUserId,
  readJson,
} from "@/server/auth/http";
import { isAuthContext, requireCompanyRole, lockCompanyContext, withCompanyErrors } from "@/server/auth/session";
import { prisma } from "@/server/db";
import { findDuplicatePartners, partnerResponse } from "@/server/partners";

type RouteContext = { params: Promise<{ id: string }> };

export async function GET(_request: Request, { params }: RouteContext) {
  const authorization = await requireCompanyRole(["admin"]);
  if (!isAuthContext(authorization)) return authorization;

  const { id } = await params;
  const partnerId = parseUserId(id);
  if (!partnerId) return invalidPartnerIdResponse();

  const partner = await prisma.partner.findFirst({ where: { id: partnerId, companyId: authorization.companyId } });
  if (!partner) return notFoundResponse();

  return NextResponse.json(
    { partner: partnerResponse(partner, true) },
    { headers: { "Cache-Control": "no-store" } },
  );
}

export const PATCH = withCompanyErrors(updatePartner);

async function updatePartner(request: Request, { params }: RouteContext) {
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
  const parsed = await readJson(request, partnerUpdateSchema);
  if ("response" in parsed) return parsed.response;

  const current = await prisma.partner.findFirst({ where: { id: partnerId, companyId: authorization.companyId } });
  if (!current) return notFoundResponse();

  const duplicates = await findDuplicatePartners(
    authorization.companyId,
    { phone: parsed.data.phone, ico: parsed.data.ico },
    partnerId,
  );
  if (duplicates.length && !parsed.data.confirmDuplicates) {
    return NextResponse.json(
      {
        error: {
          code: "DUPLICATE_WARNING",
          message: "Iný partner má rovnaký telefón alebo IČO.",
          matches: duplicates,
        },
      },
      { status: 409 },
    );
  }
  const data = { ...parsed.data };
  delete data.confirmDuplicates;
  try {
    const partner = await prisma.$transaction(async (tx) => {
      await lockCompanyContext(tx, authorization);
      const original = await tx.partner.findUniqueOrThrow({
        where: { id: partnerId, companyId: authorization.companyId },
      });
      const updated = await tx.partner.update({
        where: { id: partnerId, companyId: authorization.companyId },
        data,
      });
      await record(
        {
          userId: authorization.user.id,
          companyId: authorization.companyId,
          action: "partner.update",
          entityType: "partner",
          entityId: updated.id,
          partnerId: updated.id,
          oldValues: {
            type: original.type, displayName: original.displayName,
            phone: original.phone, email: original.email,
            contactPerson: original.contactPerson, ico: original.ico,
            internalNote: original.internalNote,
          },
          newValues: {
            type: updated.type,
            displayName: updated.displayName,
            phone: updated.phone,
            email: updated.email,
            contactPerson: updated.contactPerson,
            ico: updated.ico,
            internalNote: updated.internalNote,
          },
        },
        tx,
      );
      return updated;
    });
    return NextResponse.json({ partner: partnerResponse(partner, true) });
  } catch (error) {
    if (
      error instanceof Prisma.PrismaClientKnownRequestError &&
      error.code === "P2025"
    ) {
      return notFoundResponse();
    }
    throw error;
  }
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
