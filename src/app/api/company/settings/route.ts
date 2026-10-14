import { NextResponse } from "next/server";

import { companySettingsUpdateSchema } from "@/lib/schemas";
import { hasSameOrigin, readJson } from "@/server/auth/http";
import { isAuthContext, requireCompanyRole, withCompanyErrors } from "@/server/auth/session";
import { updateCompanySettings } from "@/server/companies";

export async function GET() {
  const authorization = await requireCompanyRole(["admin"]);
  if (!isAuthContext(authorization)) return authorization;
  return NextResponse.json({
    company: {
      id: authorization.companyId.toString(),
      name: authorization.company.name,
      vatRatePercent: authorization.company.vatRatePercent.toFixed(2),
      purchaseConfirmAboveEur: authorization.company.purchaseConfirmAboveEur?.toFixed(2) ?? null,
      bronzeMonthlyTurnoverEur: authorization.company.bronzeMonthlyTurnoverEur?.toFixed(2) ?? null,
      silverMonthlyTurnoverEur: authorization.company.silverMonthlyTurnoverEur?.toFixed(2) ?? null,
      goldMonthlyTurnoverEur: authorization.company.goldMonthlyTurnoverEur?.toFixed(2) ?? null,
    },
  }, { headers: { "Cache-Control": "no-store" } });
}

export const PATCH = withCompanyErrors(async (request: Request) => {
  if (!hasSameOrigin(request)) {
    return NextResponse.json(
      { error: { code: "INVALID_ORIGIN", message: "Neplatný pôvod požiadavky." } },
      { status: 403 },
    );
  }
  const authorization = await requireCompanyRole(["admin"]);
  if (!isAuthContext(authorization)) return authorization;
  if (authorization.user.role !== "admin") {
    return NextResponse.json(
      { error: { code: "FORBIDDEN", message: "Nastavenia firmy môže meniť iba admin danej firmy." } },
      { status: 403 },
    );
  }
  const parsed = await readJson(request, companySettingsUpdateSchema);
  if ("response" in parsed) return parsed.response;
  const company = await updateCompanySettings(authorization, parsed.data);
  return NextResponse.json({ company });
});
