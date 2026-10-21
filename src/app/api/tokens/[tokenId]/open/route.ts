import { NextResponse } from "next/server";

import { env } from "@/lib/env";
import { record } from "@/server/audit";
import { hasSameOrigin, MAX_QUERY_ID, parseUserId } from "@/server/auth/http";
import { contextError, isAuthContext, lockCompanyContext, requireCompanyRole, withCompanyErrors } from "@/server/auth/session";
import { prisma } from "@/server/db";
import { tokenArtwork } from "@/server/token-artwork";
import { decryptToken, TokenKeyMissingError } from "@/server/token-crypto";

export const POST = withCompanyErrors(async (request: Request, { params }: {
  params: Promise<{ tokenId: string }>;
}) => {
  if (!hasSameOrigin(request)) return contextError("INVALID_ORIGIN", "Neplatný pôvod požiadavky.", 403);
  const authorization = await requireCompanyRole(["admin"]);
  if (!isAuthContext(authorization)) return authorization;
  const tokenId = parseUserId((await params).tokenId);
  if (!tokenId) return contextError("VALIDATION_ERROR", "Neplatné ID prístupu.", 400);
  if (tokenId > MAX_QUERY_ID) return contextError("NOT_FOUND", "Aktívny prístup sa nenašiel.", 404);

  const result = await prisma.$transaction(async (tx) => {
    await lockCompanyContext(tx, authorization, true);
    const token = await tx.partnerToken.findFirst({
      where: {
        id: tokenId, companyId: authorization.companyId,
        isActive: true, partner: { isActive: true },
      },
      select: {
        id: true, companyId: true, partnerId: true, type: true,
        tokenEncrypted: true, tokenHash: true, tokenHint: true,
        label: true, isActive: true, createdAt: true,
        deactivatedAt: true, deactivationReason: true, lastUsedAt: true,
      },
    });
    if (!token) return contextError("NOT_FOUND", "Aktívny prístup sa nenašiel.", 404);
    if (!token.tokenEncrypted) {
      return contextError("TOKEN_NOT_RECOVERABLE", "Tento starý testovací prístup sa nedá znovu otvoriť. Nahraďte ho novým.", 409);
    }
    let value;
    try {
      value = decryptToken(token.tokenEncrypted, token, env.TOKEN_ENCRYPTION_KEY);
    } catch (error) {
      if (error instanceof TokenKeyMissingError) {
        console.error("Token reopening unavailable: TOKEN_ENCRYPTION_KEY is not configured.");
        return contextError("TOKEN_KEY_MISSING", "Správca servera musí nastaviť šifrovací kľúč pre QR/NFC karty.", 503);
      }
      console.error("Token decryption failed.", { tokenId: token.id.toString() });
      return contextError("TOKEN_DECRYPTION_FAILED", "Prístup sa nepodarilo dešifrovať. Kontaktujte správcu servera.", 500);
    }
    const artwork = await tokenArtwork(value);
    await record({
      companyId: authorization.companyId, userId: authorization.user.id,
      action: "token.open", entityType: "token", entityId: token.id, partnerId: token.partnerId,
      newValues: { type: token.type, tokenHint: token.tokenHint },
    }, tx);
    return NextResponse.json({
      token: {
        id: token.id.toString(), type: token.type, tokenHint: token.tokenHint,
        label: token.label, isActive: token.isActive, createdAt: token.createdAt,
        deactivatedAt: token.deactivatedAt, deactivationReason: token.deactivationReason, lastUsedAt: token.lastUsedAt,
      },
      ...artwork,
    }, { headers: { "Cache-Control": "no-store", "X-Content-Type-Options": "nosniff" } });
  });
  return result;
});
