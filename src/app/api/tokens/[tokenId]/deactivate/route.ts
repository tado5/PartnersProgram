import { NextResponse } from "next/server";

import { tokenDeactivateSchema } from "@/lib/schemas";
import { record } from "@/server/audit";
import { hasSameOrigin, MAX_QUERY_ID, parseUserId, readJson } from "@/server/auth/http";
import { isAuthContext, requireCompanyRole, lockCompanyContext, withCompanyErrors } from "@/server/auth/session";
import { prisma } from "@/server/db";

type RouteContext = { params: Promise<{ tokenId: string }> };

export const POST = withCompanyErrors(deactivateToken);

async function deactivateToken(request: Request, { params }: RouteContext) {
  if (!hasSameOrigin(request)) {
    return NextResponse.json(
      { error: { code: "INVALID_ORIGIN", message: "Neplatný pôvod požiadavky." } },
      { status: 403 },
    );
  }
  const authorization = await requireCompanyRole(["admin"]);
  if (!isAuthContext(authorization)) return authorization;

  const tokenId = parseUserId((await params).tokenId);
  if (!tokenId) {
    return NextResponse.json(
      { error: { code: "VALIDATION_ERROR", message: "Neplatné ID tokenu." } },
      { status: 400 },
    );
  }
  if (tokenId > MAX_QUERY_ID) {
    return NextResponse.json({ error: { code: "NOT_FOUND", message: "Token sa nenašiel." } }, { status: 404 });
  }
  const parsed = await readJson(request, tokenDeactivateSchema);
  if ("response" in parsed) return parsed.response;

  const result = await prisma.$transaction(async (tx) => {
    await lockCompanyContext(tx, authorization);
    const token = await tx.partnerToken.findFirst({
      where: { id: tokenId, companyId: authorization.companyId },
      select: {
        id: true,
        partnerId: true,
        type: true,
        tokenHint: true,
        label: true,
        isActive: true,
      },
    });
    if (!token) return { error: "NOT_FOUND" as const };
    if (!token.isActive) return { token, changed: false };

    const update = await tx.partnerToken.updateMany({
      where: { id: tokenId, companyId: authorization.companyId, isActive: true },
      data: {
        isActive: false,
        deactivatedAt: new Date(),
        deactivatedByUserId: authorization.user.id,
        deactivationReason: parsed.data.reason,
      },
    });
    if (update.count === 0) return { token, changed: false };
    await record(
      {
        userId: authorization.user.id,
        companyId: authorization.companyId,
        action: "token.deactivate",
        entityType: "token",
        entityId: token.id,
        partnerId: token.partnerId,
        oldValues: { type: token.type, tokenHint: token.tokenHint, label: token.label, isActive: true },
        newValues: { type: token.type, tokenHint: token.tokenHint, label: token.label, isActive: false },
        reason: parsed.data.reason,
      },
      tx,
    );
    return { token, changed: true };
  });

  if (result.error === "NOT_FOUND") {
    return NextResponse.json(
      { error: { code: "NOT_FOUND", message: "Token sa nenašiel." } },
      { status: 404 },
    );
  }
  return NextResponse.json(
    { token: { id: result.token.id.toString(), isActive: false } },
    { headers: { "Cache-Control": "no-store" } },
  );
}
