import { PartnerType } from "@prisma/client";
import { NextResponse } from "next/server";

import { env } from "@/lib/env";
import { record } from "@/server/audit";
import { isAuthContext, requireCompanyRole } from "@/server/auth/session";
import { getPeriodReport, parseReportPeriod } from "@/server/reports";
import { renderReportPdf, reportFileName } from "@/server/reports-pdf";

export async function GET(request: Request) {
  const authorization = await requireCompanyRole(["admin"]);
  if (!isAuthContext(authorization)) return authorization;
  const params = Object.fromEntries(new URL(request.url).searchParams);
  const period = parseReportPeriod(params);
  const typeInput = params.type || undefined;
  if (!period || (typeInput && !Object.values(PartnerType).includes(typeInput as PartnerType))) {
    return NextResponse.json({
      error: { code: "VALIDATION_ERROR", message: "Neplatné obdobie alebo typ partnera." },
    }, { status: 400 });
  }
  const type = typeInput as PartnerType | undefined;
  const report = await getPeriodReport(authorization, period, type);
  const pdf = await renderReportPdf({
    companyName: authorization.company.name,
    period,
    type,
    report,
    generatedBy: authorization.user.name,
    timeZone: env.APP_TIMEZONE,
  });
  await record({
    companyId: authorization.companyId,
    userId: authorization.user.id,
    action: "export.report_pdf",
    entityType: "export",
    newValues: { month: period.month, from: period.from, to: period.to, type: type ?? null },
  });
  return new Response(new Uint8Array(pdf), {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `attachment; filename="${reportFileName(authorization.company.slug, period)}"`,
      "Content-Length": String(pdf.length),
      "Cache-Control": "no-store",
      "X-Content-Type-Options": "nosniff",
    },
  });
}
