import { NextResponse } from "next/server";

import { publicAuditValues } from "@/lib/audit";
import { env } from "@/lib/env";
import { isAuthContext, requireCompanyRole } from "@/server/auth/session";
import { listCompanyAuditLogs, parseCompanyAuditFilters } from "@/server/repositories/audit-logs";

export async function GET(request: Request) {
  const context = await requireCompanyRole(["admin"]);
  if (!isAuthContext(context)) return context;

  const filters = parseCompanyAuditFilters(
    new URL(request.url).searchParams,
    context.companyId,
    env.APP_TIMEZONE,
  );
  if (!filters) {
    return NextResponse.json(
      { error: { code: "VALIDATION_ERROR", message: "Neplatné filtre auditu." } },
      { status: 400, headers: { "Cache-Control": "no-store" } },
    );
  }
  const result = await listCompanyAuditLogs(filters);
  return NextResponse.json({
    ...result,
    items: result.items.map((entry) => ({
      id: entry.id.toString(),
      userId: entry.userId?.toString() ?? null,
      actor: entry.user ? {
        id: entry.user.id.toString(),
        name: entry.user.name,
        role: entry.user.role,
      } : null,
      action: entry.action,
      entityType: entry.entityType,
      entityId: entry.entityId?.toString() ?? null,
      partnerId: entry.partnerId?.toString() ?? null,
      partner: entry.partner ? {
        id: entry.partner.id.toString(),
        code: entry.partner.code,
        displayName: entry.partner.displayName,
      } : null,
      oldValues: publicAuditValues(entry.oldValues),
      newValues: publicAuditValues(entry.newValues),
      reason: entry.reason,
      createdAt: entry.createdAt.toISOString(),
    })),
  }, { headers: { "Cache-Control": "no-store" } });
}
