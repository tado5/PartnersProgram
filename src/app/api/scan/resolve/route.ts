import { createHash } from "node:crypto";
import { NextResponse } from "next/server";

import { tokenValueSchema } from "@/lib/schemas";
import { hasSameOrigin, readJson } from "@/server/auth/http";
import { getClientIp, allowPublicRequest } from "@/server/auth/rate-limit";
import { isAuthContext, requireCompanyRole } from "@/server/auth/session";
import { prisma } from "@/server/db";

export async function POST(request: Request) {
  if (!hasSameOrigin(request)) {
    return NextResponse.json(
      { error: { code: "INVALID_ORIGIN", message: "Neplatný pôvod požiadavky." } },
      { status: 403 },
    );
  }
  const authorization = await requireCompanyRole(["admin", "seller"]);
  if (!isAuthContext(authorization)) return authorization;

  if (!allowPublicRequest(getClientIp(request.headers))) {
    return NextResponse.json(
      { error: { code: "RATE_LIMITED", message: "Príliš veľa požiadaviek. Skúste neskôr." } },
      { status: 429, headers: { "Cache-Control": "no-store" } },
    );
  }

  const parsed = await readJson(request, tokenValueSchema);
  if ("response" in parsed) return parsed.response;

  const tokenHash = createHash("sha256").update(parsed.data.token).digest("hex");
  const token = await prisma.partnerToken.findFirst({
    where: {
      companyId: authorization.companyId,
      company: { isActive: true },
      tokenHash,
      isActive: true,
      partner: { isActive: true },
    },
    select: {
      id: true,
      type: true,
      partner: {
        select: {
          id: true,
          code: true,
          displayName: true,
          type: true,
        },
      },
    },
  });

  if (!token) {
    return NextResponse.json(
      { error: { code: "NOT_FOUND", message: "Karta nie je platná." } },
      { status: 404, headers: { "Cache-Control": "no-store" } },
    );
  }

  return NextResponse.json(
    {
      partnerId: token.partner.id.toString(),
      code: token.partner.code,
      displayName: token.partner.displayName,
      type: token.partner.type,
      tokenId: token.id.toString(),
      source: token.type,
    },
    { headers: { "Cache-Control": "no-store" } },
  );
}
