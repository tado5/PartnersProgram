import { NextResponse } from "next/server";

import { record } from "@/server/audit";
import { hasSameOrigin } from "@/server/auth/http";
import { isAuthContext, lockCompanyContext, requireCompanyRole, withCompanyErrors } from "@/server/auth/session";
import { CompanyLogoError, parseCompanyLogoUpload } from "@/server/company-logo";
import { prisma } from "@/server/db";

export async function GET() {
  const authorization = await requireCompanyRole(["admin", "seller"]);
  if (!isAuthContext(authorization)) return authorization;
  const headers = { "Cache-Control": "no-store", "X-Content-Type-Options": "nosniff" };
  if (!authorization.company.logoData) {
    return NextResponse.json({ error: { code: "NOT_FOUND", message: "Logo sa nenašlo." } }, { status: 404, headers });
  }
  return new Response(new Uint8Array(authorization.company.logoData), {
    headers: { ...headers, "Content-Type": "image/png" },
  });
}

async function changeLogo(request: Request, remove: boolean) {
  if (!hasSameOrigin(request)) {
    return NextResponse.json({ error: { code: "INVALID_ORIGIN", message: "Neplatný pôvod požiadavky." } }, { status: 403 });
  }
  const authorization = await requireCompanyRole(["admin"]);
  if (!isAuthContext(authorization)) return authorization;
  if (authorization.user.role !== "admin") {
    return NextResponse.json({
      error: { code: "FORBIDDEN", message: "Logo firmy môže meniť iba admin danej firmy." },
    }, { status: 403 });
  }
  let logo: { logoData: Buffer | null; logoVersion: string | null };
  try {
    logo = remove ? { logoData: null, logoVersion: null } : await parseCompanyLogoUpload(request);
  } catch (error) {
    if (!(error instanceof CompanyLogoError)) throw error;
    return NextResponse.json({ error: { code: error.code, message: error.message } }, { status: error.status });
  }
  await prisma.$transaction(async (tx) => {
    const current = await lockCompanyContext(tx, authorization);
    await tx.company.update({
      where: { id: authorization.companyId },
      data: { logoData: logo.logoData === null ? null : new Uint8Array(logo.logoData), logoVersion: logo.logoVersion },
    });
    await record({
      companyId: authorization.companyId, userId: authorization.user.id,
      action: remove ? "company.logo_delete" : "company.logo_update",
      entityType: "company", entityId: authorization.companyId,
      oldValues: { logoVersion: current.logoVersion },
      newValues: { logoVersion: logo.logoVersion },
    }, tx);
  });
  return NextResponse.json({ logoVersion: logo.logoVersion }, { headers: { "Cache-Control": "no-store" } });
}

export const PUT = withCompanyErrors((request: Request) => changeLogo(request, false));
export const DELETE = withCompanyErrors((request: Request) => changeLogo(request, true));
