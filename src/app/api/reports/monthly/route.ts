import { PartnerType } from "@prisma/client";
import { NextResponse } from "next/server";

import { isAuthContext, requireCompanyRole } from "@/server/auth/session";
import { getMonthlyReport, parseReportMonth } from "@/server/reports";

export async function GET(request: Request) {
  const authorization = await requireCompanyRole(["admin"]);
  if (!isAuthContext(authorization)) return authorization;
  const params = new URL(request.url).searchParams;
  const monthInput = params.get("month") ?? undefined;
  const yearInput = params.get("year");
  const selected = yearInput
    ? /^\d{4}$/.test(yearInput) && monthInput && /^\d{1,2}$/.test(monthInput)
      ? parseReportMonth(`${yearInput}-${monthInput.padStart(2, "0")}`)
      : null
    : parseReportMonth(monthInput);
  const typeInput = params.get("type") || null;
  if (
    !selected ||
    (typeInput !== null && !Object.values(PartnerType).includes(typeInput as PartnerType))
  ) {
    return NextResponse.json({
      error: { code: "VALIDATION_ERROR", message: "Neplatné obdobie alebo typ partnera." },
    }, { status: 400 });
  }
  const report = await getMonthlyReport(
    authorization,
    selected.year,
    selected.month,
    typeInput ? typeInput as PartnerType : undefined,
  );
  return NextResponse.json(report, { headers: { "Cache-Control": "no-store" } });
}
