import { NextResponse } from "next/server";

import { purchaseDeleteSchema, purchaseUpdateSchema } from "@/lib/schemas";
import { hasSameOrigin, parseUserId, readJson } from "@/server/auth/http";
import { isAuthContext, requireCompanyRole, withCompanyErrors } from "@/server/auth/session";
import { prisma } from "@/server/db";
import { deletePurchase, PurchaseError, purchaseResponse, updatePurchase } from "@/server/purchases";

type RouteContext = { params: Promise<{ id: string }> };

export async function GET(_request: Request, { params }: RouteContext) {
  const authorization = await requireCompanyRole(["admin"]);
  if (!isAuthContext(authorization)) return authorization;
  const id = parseUserId((await params).id);
  if (!id) return invalidId();
  const purchase = await prisma.purchase.findFirst({
    where: { id, companyId: authorization.companyId },
    include: {
      partner: { select: { id: true, code: true, displayName: true } },
      createdBy: { select: { id: true, name: true } },
    },
  });
  if (!purchase) return notFound();
  return NextResponse.json({
    purchase: {
      ...purchaseResponse(purchase),
      partner: {
        id: purchase.partner.id.toString(),
        code: purchase.partner.code,
        displayName: purchase.partner.displayName,
      },
      createdBy: { id: purchase.createdBy.id.toString(), name: purchase.createdBy.name },
    },
  }, { headers: { "Cache-Control": "no-store" } });
}

export const PATCH = withCompanyErrors(async (request: Request, { params }: RouteContext) => {
  if (!hasSameOrigin(request)) return invalidOrigin();
  const authorization = await requireCompanyRole(["admin"]);
  if (!isAuthContext(authorization)) return authorization;
  const id = parseUserId((await params).id);
  if (!id) return invalidId();
  const parsed = await readJson(request, purchaseUpdateSchema);
  if ("response" in parsed) return parsed.response;
  try {
    const purchase = await updatePurchase(authorization, id, parsed.data);
    return NextResponse.json({ purchase: purchaseResponse(purchase) }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    if (error instanceof PurchaseError) return purchaseError(error);
    throw error;
  }
});

export const DELETE = withCompanyErrors(async (request: Request, { params }: RouteContext) => {
  if (!hasSameOrigin(request)) return invalidOrigin();
  const authorization = await requireCompanyRole(["admin"]);
  if (!isAuthContext(authorization)) return authorization;
  const id = parseUserId((await params).id);
  if (!id) return invalidId();
  const parsed = await readJson(request, purchaseDeleteSchema);
  if ("response" in parsed) return parsed.response;
  try {
    const purchase = await deletePurchase(authorization, id, parsed.data.reason);
    return NextResponse.json({ purchase: purchaseResponse(purchase) }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    if (error instanceof PurchaseError) return purchaseError(error);
    throw error;
  }
});

function purchaseError(error: PurchaseError) {
  return NextResponse.json({
    error: { code: error.code, message: error.message, ...(error.details ? { details: error.details } : {}) },
  }, { status: error.status, headers: { "Cache-Control": "no-store" } });
}

function invalidOrigin() {
  return NextResponse.json(
    { error: { code: "INVALID_ORIGIN", message: "Neplatný pôvod požiadavky." } },
    { status: 403 },
  );
}
function invalidId() {
  return NextResponse.json(
    { error: { code: "VALIDATION_ERROR", message: "Neplatné ID nákupu." } },
    { status: 400 },
  );
}
function notFound() {
  return NextResponse.json(
    { error: { code: "NOT_FOUND", message: "Nákup sa nenašiel." } },
    { status: 404 },
  );
}
