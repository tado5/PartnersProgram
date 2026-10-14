import { Prisma } from "@prisma/client";
import { NextResponse } from "next/server";

import { purchaseCreateSchema } from "@/lib/schemas";
import { hasSameOrigin, parseUserId, readJson } from "@/server/auth/http";
import { env } from "@/lib/env";
import { zonedDayRange } from "@/lib/dates";
import { isAuthContext, requireCompanyRole, withCompanyErrors } from "@/server/auth/session";
import { createPurchase, listPurchases, PurchaseError, purchaseResponse } from "@/server/purchases";

const PAGE_SIZE = 50;

export async function GET(request: Request) {
  const authorization = await requireCompanyRole(["admin", "seller"]);
  if (!isAuthContext(authorization)) return authorization;
  const params = new URL(request.url).searchParams;
  const page = Number(params.get("page") ?? "1");
  const partnerInput = params.get("partnerId");
  const partnerId = partnerInput ? parseUserId(partnerInput) : undefined;
  const includeDeletedInput = params.get("includeDeleted");
  const includeDeleted = includeDeletedInput === "true";
  const fromInput = params.get("from");
  const toInput = params.get("to");
  const from = fromInput ? new Date(fromInput) : undefined;
  const to = toInput ? new Date(toInput) : undefined;
  if (
    !Number.isInteger(page) || page < 1 || page > 10000 ||
    (partnerInput !== null && !partnerId) ||
    (includeDeletedInput !== null && !["true", "false"].includes(includeDeletedInput)) ||
    (fromInput !== null && (!from || !Number.isFinite(from.getTime()))) ||
    (toInput !== null && (!to || !Number.isFinite(to.getTime()))) ||
    (from && to && from > to) ||
    (includeDeleted && authorization.user.role === "seller")
  ) {
    return validationError();
  }

  let where: Prisma.PurchaseWhereInput = {};
  if (authorization.user.role === "seller") {
    const range = zonedDayRange(new Date(), env.APP_TIMEZONE);
    where = {
      createdByUserId: authorization.user.id,
      createdAt: { gte: range.start, lt: range.end },
      isDeleted: false,
    };
  } else {
    where = {
      ...(includeDeleted ? {} : { isDeleted: false }),
      ...(partnerId ? { partnerId } : {}),
      ...(from || to ? { purchasedAt: { ...(from ? { gte: from } : {}), ...(to ? { lte: to } : {}) } } : {}),
    };
  }

  const result = await listPurchases(authorization, where, (page - 1) * PAGE_SIZE, PAGE_SIZE);
  return NextResponse.json(
    { ...result, page, pageSize: PAGE_SIZE },
    { headers: { "Cache-Control": "no-store" } },
  );
}

export const POST = withCompanyErrors(async (request: Request) => {
  if (!hasSameOrigin(request)) {
    return NextResponse.json(
      { error: { code: "INVALID_ORIGIN", message: "Neplatný pôvod požiadavky." } },
      { status: 403 },
    );
  }
  const authorization = await requireCompanyRole(["admin", "seller"]);
  if (!isAuthContext(authorization)) return authorization;
  const parsed = await readJson(request, purchaseCreateSchema);
  if ("response" in parsed) return parsed.response;

  try {
    const result = await createPurchase(authorization, parsed.data);
    return NextResponse.json(
      { purchase: purchaseResponse(result.purchase), replayed: result.replayed },
      { status: result.replayed ? 200 : 201, headers: { "Cache-Control": "no-store" } },
    );
  } catch (error) {
    if (error instanceof PurchaseError) {
      return NextResponse.json({
        error: { code: error.code, message: error.message, ...(error.details ? { details: error.details } : {}) },
      }, { status: error.status });
    }
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
      return NextResponse.json(
        { error: { code: "IDEMPOTENCY_CONFLICT", message: "Kľúč požiadavky už bol použitý." } },
        { status: 409 },
      );
    }
    throw error;
  }
});

function validationError() {
  return NextResponse.json(
    { error: { code: "VALIDATION_ERROR", message: "Neplatné filtre nákupov." } },
    { status: 400 },
  );
}
