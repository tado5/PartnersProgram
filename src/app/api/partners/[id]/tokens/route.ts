import { createHash, randomBytes } from "node:crypto";
import { NextResponse } from "next/server";

import { env } from "@/lib/env";
import { tokenCreateSchema } from "@/lib/schemas";
import { hasSameOrigin, MAX_QUERY_ID, parseUserId, readJson } from "@/server/auth/http";
import {
  CompanyInactiveError,
  contextError,
  isAuthContext,
  requireCompanyRole,
  withCompanyErrors,
} from "@/server/auth/session";
import { prisma } from "@/server/db";
import {
  listPartnerTokens,
  rotatePartnerToken,
  TokenSelectionChangedError,
} from "@/server/repositories/tokens";
import { encryptToken, TokenKeyMissingError } from "@/server/token-crypto";
import { tokenArtwork } from "@/server/token-artwork";

type RouteContext = { params: Promise<{ id: string }> };

export async function GET(_request: Request, { params }: RouteContext) {
  const authorization = await requireCompanyRole(["admin"]);
  if (!isAuthContext(authorization)) return authorization;

  const partnerId = parseUserId((await params).id);
  if (!partnerId) return invalidPartnerIdResponse();
  if (partnerId > MAX_QUERY_ID) return notFoundResponse();

  const partnerExists = await prisma.partner.findFirst({
    where: { id: partnerId, companyId: authorization.companyId },
    select: { id: true },
  });
  if (!partnerExists) return notFoundResponse();

  const tokens = await listPartnerTokens(authorization, partnerId);
  return NextResponse.json(
    {
      tokens: tokens.map((token) => ({
        ...token,
        id: token.id.toString(),
      })),
    },
    { headers: { "Cache-Control": "no-store" } },
  );
}

export const POST = withCompanyErrors(createToken);

async function createToken(request: Request, { params }: RouteContext) {
  if (!hasSameOrigin(request)) {
    return NextResponse.json(
      { error: { code: "INVALID_ORIGIN", message: "Neplatný pôvod požiadavky." } },
      { status: 403 },
    );
  }
  const authorization = await requireCompanyRole(["admin"]);
  if (!isAuthContext(authorization)) return authorization;

  const partnerId = parseUserId((await params).id);
  if (!partnerId) return invalidPartnerIdResponse();
  if (partnerId > MAX_QUERY_ID) return notFoundResponse();
  const parsed = await readJson(request, tokenCreateSchema);
  if ("response" in parsed) return parsed.response;
  if (parsed.data.deactivateTokenIds?.some((id) => id > MAX_QUERY_ID)) {
    return contextError("NOT_FOUND", "Token sa nenašiel.", 404);
  }

  const token = randomBytes(32).toString("base64url");
  const tokenHash = createHash("sha256").update(token).digest("hex");
  let tokenEncrypted;
  try {
    tokenEncrypted = encryptToken(token, {
      companyId: authorization.companyId,
      partnerId,
      type: parsed.data.type,
      tokenHash,
    }, env.TOKEN_ENCRYPTION_KEY);
  } catch (error) {
    if (!(error instanceof TokenKeyMissingError)) throw error;
    console.error("Token issuance unavailable: TOKEN_ENCRYPTION_KEY is not configured.");
    return contextError("TOKEN_KEY_MISSING", "Správca servera musí nastaviť šifrovací kľúč pre QR/NFC karty.", 503);
  }
  const artwork = await tokenArtwork(token);

  let result;
  try {
    result = await rotatePartnerToken(authorization, {
      partnerId,
      type: parsed.data.type,
      tokenHash,
      tokenEncrypted,
      tokenHint: token.slice(0, 6),
      label: parsed.data.label,
      deactivateTokenIds: parsed.data.deactivateTokenIds ?? [],
      deactivationReason: parsed.data.deactivationReason,
    });
  } catch (error) {
    if (error instanceof CompanyInactiveError) {
      return contextError("COMPANY_INACTIVE", "Firemný program je pozastavený.", 409);
    }
    if (error instanceof TokenSelectionChangedError) {
      return NextResponse.json(
        { error: { code: "TOKEN_SELECTION_CHANGED", message: "Vybrané tokeny už nie sú aktívne." } },
        { status: 409 },
      );
    }
    throw error;
  }

  if (result.error === "PARTNER_NOT_FOUND") return notFoundResponse();
  if (result.error === "ACTIVE_TOKEN_EXISTS") {
    return contextError("ACTIVE_TOKEN_EXISTS", "Partner už má aktívny prístup tohto typu. Otvorte ho alebo potvrďte jeho nahradenie.", 409);
  }
  if (result.error === "TOKEN_NOT_FOUND") {
    return contextError("NOT_FOUND", "Token sa nenašiel.", 404);
  }
  if (result.error === "TOKEN_SELECTION_CHANGED") {
    return NextResponse.json(
      { error: { code: "TOKEN_SELECTION_CHANGED", message: "Vybrané tokeny už nie sú aktívne." } },
      { status: 409 },
    );
  }

  return NextResponse.json(
    {
      token: { ...result.token, id: result.token.id.toString() },
      ...artwork,
    },
    { status: 201, headers: { "Cache-Control": "no-store" } },
  );
}

function invalidPartnerIdResponse() {
  return NextResponse.json(
    { error: { code: "VALIDATION_ERROR", message: "Neplatné ID partnera." } },
    { status: 400 },
  );
}

function notFoundResponse() {
  return NextResponse.json(
    { error: { code: "NOT_FOUND", message: "Partner sa nenašiel alebo je neaktívny." } },
    { status: 404 },
  );
}
