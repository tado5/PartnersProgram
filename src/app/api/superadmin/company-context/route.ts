import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { companyContextSchema } from "@/lib/schemas";
import { env } from "@/lib/env";
import { record } from "@/server/audit";
import { companyCookieName, signCompanySelection } from "@/server/auth/company-cookie";
import { hasSameOrigin, readJson } from "@/server/auth/http";
import { contextError, isAuthContext, requireRole } from "@/server/auth/session";
import { prisma } from "@/server/db";

export async function POST(request: Request) {
  const context = await requireRole(["superadmin"]);
  if (!isAuthContext(context)) return context;
  if (!hasSameOrigin(request)) return contextError("INVALID_ORIGIN", "Neplatný pôvod požiadavky.", 403);
  const parsed = await readJson(request, companyContextSchema);
  if ("response" in parsed) return parsed.response;
  const companyId = BigInt(parsed.data.companyId);
  const company = await prisma.company.findUnique({ where: { id: companyId } });
  if (!company) return contextError("NOT_FOUND", "Firma sa nenašla.", 404);
  const signed = signCompanySelection({
    companyId: companyId.toString(), userId: context.user.id.toString(),
    loginAt: context.session.user.loginAt,
  });
  await record({ companyId, userId: context.user.id, action: "company.context_select",
    entityType: "company", entityId: companyId });
  (await cookies()).set(companyCookieName, signed.value, {
    httpOnly: true, sameSite: "lax", secure: env.NODE_ENV === "production", path: "/",
  });
  return NextResponse.json({ company: { id: company.id.toString(), name: company.name } }, {
    headers: { "Cache-Control": "no-store", "Clear-Site-Data": '"cache"' },
  });
}

export async function DELETE(request: Request) {
  const context = await requireRole(["superadmin"]);
  if (!isAuthContext(context)) return context;
  if (!hasSameOrigin(request)) return contextError("INVALID_ORIGIN", "Neplatný pôvod požiadavky.", 403);
  (await cookies()).delete(companyCookieName);
  return NextResponse.json({ cleared: true }, { headers: { "Cache-Control": "no-store" } });
}
