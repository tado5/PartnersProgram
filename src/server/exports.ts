import { PartnerType, Prisma, type AuditLog, type Partner, type Purchase, type User } from "@prisma/client";
import { NextResponse } from "next/server";

import { decimalCell, formatCsvDate, serializeCsv } from "@/lib/csv";
import { zonedCalendarDayRange } from "@/lib/dates";
import { env } from "@/lib/env";
import { publicAuditValues } from "@/lib/audit";
import { isAuthContext, lockCompanyContext, requireCompanyRole, withCompanyErrors, type CompanyContext } from "@/server/auth/session";
import { parseUserId } from "@/server/auth/http";
import { record } from "@/server/audit";
import { prisma, type DbClient } from "@/server/db";
import { normalizePartnerSearch } from "@/server/partners";
import { getPeriodReport, parseReportPeriod } from "@/server/reports";
import { parseCompanyAuditFilters } from "@/server/repositories/audit-logs";

const CSV_EXPORT_BATCH_SIZE = 1_000;

type ExportKind = "partners" | "purchases" | "monthly" | "audit-logs";

export class CsvExportError extends Error {
  constructor(
    public readonly code: string,
    message: string,
    public readonly status: number,
  ) {
    super(message);
  }
}

export function createCsvExportHandler(kind: ExportKind) {
  return withCompanyErrors(async (request: Request) => {
    const context = await requireCompanyRole(["admin"]);
    if (!isAuthContext(context)) return context;

    try {
      const output = await generateCsvExport(context, kind, nonEmptyParams(new URL(request.url).searchParams));
      return new Response(output, {
        headers: {
          "Content-Type": "text/csv; charset=utf-8",
          "Content-Disposition": `attachment; filename="${fileNames[kind]}"`,
          "Cache-Control": "no-store",
          "X-Content-Type-Options": "nosniff",
        },
      });
    } catch (error) {
      if (!(error instanceof CsvExportError)) throw error;
      return NextResponse.json(
        { error: { code: error.code, message: error.message } },
        { status: error.status, headers: { "Cache-Control": "no-store", "X-Content-Type-Options": "nosniff" } },
      );
    }
  });
}

function nonEmptyParams(params: URLSearchParams) {
  return new URLSearchParams([...params].filter(([, value]) => value !== ""));
}

const fileNames: Record<ExportKind, string> = {
  partners: "partners.csv",
  purchases: "purchases.csv",
  monthly: "monthly.csv",
  "audit-logs": "audit-logs.csv",
};

async function generateCsvExport(
  context: CompanyContext,
  kind: ExportKind,
  params: URLSearchParams,
) {
  switch (kind) {
    case "partners":
      return exportPartners(context, params);
    case "purchases":
      return exportPurchases(context, params);
    case "monthly":
      return exportMonthly(context, params);
    case "audit-logs":
      return exportAuditLogs(context, params);
  }
}

async function exportPartners(context: CompanyContext, params: URLSearchParams) {
  const query = params.get("q")?.trim() ?? "";
  const type = parseType(params.get("type"));
  const active = params.get("active") ?? "all";
  if (type === INVALID || !["all", "true", "false"].includes(active)) {
    throw validationError("Neplatné filtre exportu partnerov.");
  }
  const filters = { q: query ? "Skryté" : null, type: type ?? null, active };
  return prisma.$transaction(async (tx) => {
    await lockCompanyContext(tx, context);
    const where: Prisma.PartnerWhereInput = {
      companyId: context.companyId,
      ...(type ? { type } : {}),
      ...(active === "all" ? {} : { isActive: active === "true" }),
    };
    if (query) {
      const normalized = normalizePartnerSearch(query);
      where.OR = [
        { displayName: { contains: normalized.query } },
        { code: { contains: normalized.codeSearch } },
        ...(normalized.codeFragment ? [{ code: { contains: normalized.codeFragment } }] : []),
        ...(normalized.phoneSearch ? [{ phone: { contains: normalized.phoneSearch } }] : []),
        ...(normalized.icoSearch ? [{ ico: { contains: normalized.icoSearch } }] : []),
      ];
    }
    const partners = await loadAllPages((skip, take) => tx.partner.findMany({
      where,
      orderBy: [{ displayName: "asc" }, { id: "asc" }],
      skip,
      take,
    }));
    const csv = serializeCsv([
      ["Kód", "Typ", "Názov", "Telefón", "E-mail", "Kontaktná osoba", "IČO", "Interná poznámka", "Aktívny", "Vytvorený", "Upravený"],
      ...partners.map((partner) => [
        partner.code,
        partner.type,
        partner.displayName,
        partner.phone,
        partner.email,
        partner.contactPerson,
        partner.ico,
        partner.internalNote,
        partner.isActive ? "Áno" : "Nie",
        formatCsvDate(partner.createdAt, env.APP_TIMEZONE),
        formatCsvDate(partner.updatedAt, env.APP_TIMEZONE),
      ]),
    ]);
    await recordExport(tx, context, "partners", filters, partners.length);
    return csv;
  }, { isolationLevel: Prisma.TransactionIsolationLevel.RepeatableRead });
}

async function exportPurchases(context: CompanyContext, params: URLSearchParams) {
  const fromInput = params.get("from") ?? "";
  const toInput = params.get("to") ?? "";
  const partnerInput = params.get("partnerId") ?? "";
  const includeDeletedInput = params.get("includeDeleted");
  const includeDeleted = includeDeletedInput === "true";
  if (includeDeletedInput !== null && !["true", "false"].includes(includeDeletedInput)) {
    throw validationError("Neplatné filtre exportu nákupov.");
  }
  if (fromInput && toInput && fromInput > toInput) {
    throw validationError("Neplatné filtre exportu nákupov.");
  }
  const fromRange = fromInput ? parseCalendarDay(fromInput) : null;
  const toRange = toInput ? parseCalendarDay(toInput) : null;
  const partnerId = partnerInput ? parseUserId(partnerInput) : null;
  if ((fromInput && !fromRange) || (toInput && !toRange) || (partnerInput && !partnerId)) {
    throw validationError("Neplatné filtre exportu nákupov.");
  }
  const filters = {
    from: fromInput || null,
    to: toInput || null,
    partnerId: partnerId?.toString() ?? null,
    includeDeleted,
  };
  return prisma.$transaction(async (tx) => {
    await lockCompanyContext(tx, context);
    if (partnerId) {
      const partner = await tx.partner.findFirst({
        where: { id: partnerId, companyId: context.companyId },
        select: { id: true },
      });
      if (!partner) throw notFoundError();
    }
    const where: Prisma.PurchaseWhereInput = {
      companyId: context.companyId,
      ...(includeDeleted ? {} : { isDeleted: false }),
      ...(partnerId ? { partnerId } : {}),
      ...(fromRange || toRange ? {
        purchasedAt: {
          ...(fromRange ? { gte: fromRange.start } : {}),
          ...(toRange ? { lt: toRange.end } : {}),
        },
      } : {}),
    };
    const purchases = await loadAllPages((skip, take) => tx.purchase.findMany({
      where,
      orderBy: [{ purchasedAt: "desc" }, { id: "desc" }],
      skip,
      take,
    }));
    const partnerById = await findScopedPartners(tx, context.companyId, purchases);
    if (partnerById.size !== new Set(purchases.map((purchase) => purchase.partnerId)).size) {
      throw new Error("A purchase is missing its company-scoped partner relation.");
    }
    const actorById = await findScopedActors(tx, context.companyId, purchases);
    const csv = serializeCsv([
      [
        "ID nákupu", "Kód partnera", "Partner", "Typ partnera", "Suma s DPH", "Suma bez DPH",
        "Sadzba DPH", "Body", "Partner prítomný", "Poznámka", "Dátum nákupu", "Zdroj",
        "Vytvoril", "Vytvorený", "Upravil", "Upravený", "Zmazaný", "Dátum zmazania", "Zmazal",
      ],
      ...purchases.map((purchase) => {
        const partner = partnerById.get(purchase.partnerId)!;
        return [
          purchase.id.toString(),
          partner.code,
          partner.displayName,
          partner.type,
          decimalCell(purchase.amount.toFixed(2)),
          decimalCell(purchase.netAmount.toFixed(2)),
          decimalCell(purchase.vatRatePercent.toFixed(2)),
          purchase.points,
          purchase.partnerPresent ? "Áno" : "Nie",
          purchase.note,
          formatCsvDate(purchase.purchasedAt, env.APP_TIMEZONE),
          purchase.source,
          actorName(actorById, purchase.createdByUserId),
          formatCsvDate(purchase.createdAt, env.APP_TIMEZONE),
          purchase.updatedByUserId ? actorName(actorById, purchase.updatedByUserId) : null,
          formatCsvDate(purchase.updatedAt, env.APP_TIMEZONE),
          purchase.isDeleted ? "Áno" : "Nie",
          purchase.deletedAt ? formatCsvDate(purchase.deletedAt, env.APP_TIMEZONE) : null,
          purchase.deletedByUserId ? actorName(actorById, purchase.deletedByUserId) : null,
        ];
      }),
    ]);
    await recordExport(tx, context, "purchases", filters, purchases.length);
    return csv;
  }, { isolationLevel: Prisma.TransactionIsolationLevel.RepeatableRead });
}

async function exportMonthly(context: CompanyContext, params: URLSearchParams) {
  const type = parseType(params.get("type"));
  const periodParams = parseMonthlyPeriod(params);
  if (type === INVALID || !periodParams) {
    throw validationError("Neplatné obdobie alebo typ partnera.");
  }
  const period = parseReportPeriod(periodParams);
  if (!period) throw validationError("Neplatné obdobie alebo typ partnera.");
  const filters = {
    month: period.month,
    from: period.from,
    to: period.to,
    type: type ?? null,
  };
  return prisma.$transaction(async (tx) => {
    await lockCompanyContext(tx, context);
    const report = await getPeriodReport(context, period, type ?? undefined, tx);
    const csv = serializeCsv([
      ["Kód", "Partner", "Typ", "Suma s DPH", "Suma bez DPH", "Body", "Počet nákupov"],
      ...report.partners.map((partner) => [
        partner.code,
        partner.displayName,
        partner.type,
        decimalCell(partner.grossAmount),
        decimalCell(partner.netAmount),
        partner.points,
        partner.purchases,
      ]),
    ]);
    await recordExport(tx, context, "monthly", filters, report.partners.length);
    return csv;
  }, { isolationLevel: Prisma.TransactionIsolationLevel.RepeatableRead });
}

async function exportAuditLogs(context: CompanyContext, params: URLSearchParams) {
  const auditParams = new URLSearchParams(params);
  auditParams.set("page", "1");
  const filters = parseCompanyAuditFilters(auditParams, context.companyId, env.APP_TIMEZONE);
  if (!filters) throw validationError("Neplatné filtre auditu.");
  return prisma.$transaction(async (tx) => {
    await lockCompanyContext(tx, context);
    await assertScopedAuditFilters(tx, context, filters);
    const logs = await loadAllPages((skip, take) => tx.auditLog.findMany({
      where: filters.where,
      orderBy: [{ createdAt: "desc" }, { id: "desc" }],
      skip,
      take,
    }));
    const actorById = await findAuditActors(tx, context.companyId, logs);
    const partnerById = await findAuditPartners(tx, context.companyId, logs);
    const csv = serializeCsv([
      [
        "ID", "Dátum a čas", "Používateľ", "Akcia", "Typ entity", "ID entity",
        "Kód partnera", "Partner", "Staré hodnoty", "Nové hodnoty", "Dôvod",
      ],
      ...logs.map((log) => {
        const partner = log.partnerId ? partnerById.get(log.partnerId) : undefined;
        return [
          log.id.toString(),
          formatCsvDate(log.createdAt, env.APP_TIMEZONE),
          log.userId ? actorName(actorById, log.userId) : null,
          log.action,
          log.entityType,
          log.entityId?.toString() ?? null,
          partner?.code ?? null,
          partner?.displayName ?? null,
          safeAuditJson(log.oldValues),
          safeAuditJson(log.newValues),
          log.reason,
        ];
      }),
    ]);
    await recordExport(tx, context, "audit-logs", auditFilterValues(filters), logs.length);
    return csv;
  }, { isolationLevel: Prisma.TransactionIsolationLevel.RepeatableRead });
}

function parseMonthlyPeriod(params: URLSearchParams): Record<string, string> | null {
  const from = params.get("from");
  const to = params.get("to");
  const year = params.get("year");
  const month = params.get("month");
  if (from !== null || to !== null) {
    if (year !== null || month !== null || !from || !to) return null;
    return { from, to };
  }
  if (year !== null) {
    if (!/^\d{4}$/.test(year) || !month || !/^\d{1,2}$/.test(month)) return null;
    return { month: `${year}-${month.padStart(2, "0")}` };
  }
  return month === null ? {} : { month };
}

function parseCalendarDay(value: string) {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  if (!match) return null;
  try {
    return zonedCalendarDayRange(Number(match[1]), Number(match[2]), Number(match[3]), env.APP_TIMEZONE);
  } catch (error) {
    if (error instanceof RangeError) return null;
    throw error;
  }
}

const INVALID = Symbol("invalid-partner-type");

function parseType(value: string | null): PartnerType | undefined | typeof INVALID {
  if (value === null || value === "") return undefined;
  return Object.values(PartnerType).includes(value as PartnerType)
    ? value as PartnerType
    : INVALID;
}

async function findScopedPartners(
  db: DbClient,
  companyId: bigint,
  purchases: Purchase[],
) {
  const ids = [...new Set(purchases.map((purchase) => purchase.partnerId))];
  const partners = await db.partner.findMany({
    where: { companyId, id: { in: ids } },
    select: { id: true, code: true, displayName: true, type: true },
  });
  return new Map(partners.map((partner) => [partner.id, partner]));
}

async function findScopedActors(
  db: DbClient,
  companyId: bigint,
  purchases: Purchase[],
) {
  const ids = [
    ...new Set(purchases.flatMap((purchase) => [
      purchase.createdByUserId,
      ...(purchase.updatedByUserId ? [purchase.updatedByUserId] : []),
      ...(purchase.deletedByUserId ? [purchase.deletedByUserId] : []),
    ])),
  ];
  if (!ids.length) return new Map<bigint, Pick<User, "id" | "name">>();
  const users = await db.user.findMany({
    where: {
      id: { in: ids },
      OR: [{ companyId }, { role: "superadmin", companyId: null }],
    },
    select: { id: true, name: true },
  });
  return new Map(users.map((user) => [user.id, user]));
}

async function findAuditActors(
  db: DbClient,
  companyId: bigint,
  logs: AuditLog[],
) {
  const ids = [...new Set(logs.flatMap((log) => log.userId ? [log.userId] : []))];
  if (!ids.length) return new Map<bigint, Pick<User, "id" | "name">>();
  const users = await db.user.findMany({
    where: {
      id: { in: ids },
      OR: [{ companyId }, { role: "superadmin", companyId: null }],
    },
    select: { id: true, name: true },
  });
  return new Map(users.map((user) => [user.id, user]));
}

async function findAuditPartners(
  db: DbClient,
  companyId: bigint,
  logs: AuditLog[],
) {
  const ids = [...new Set(logs.flatMap((log) => log.partnerId ? [log.partnerId] : []))];
  if (!ids.length) return new Map<bigint, Pick<Partner, "id" | "code" | "displayName">>();
  const partners = await db.partner.findMany({
    where: { companyId, id: { in: ids } },
    select: { id: true, code: true, displayName: true },
  });
  return new Map(partners.map((partner) => [partner.id, partner]));
}

async function assertScopedAuditFilters(
  db: DbClient,
  context: CompanyContext,
  filters: NonNullable<ReturnType<typeof parseCompanyAuditFilters>>,
) {
  if (filters.userId) {
    const actor = await db.user.findFirst({
      where: {
        id: filters.userId,
        OR: [{ companyId: context.companyId }, { role: "superadmin", companyId: null }],
      },
      select: { id: true },
    });
    if (!actor) throw notFoundError();
  }
  if (filters.partnerId) {
    const partner = await db.partner.findFirst({
      where: { id: filters.partnerId, companyId: context.companyId },
      select: { id: true },
    });
    if (!partner) throw notFoundError();
  }
  if (!filters.entityId) return;
  const exists = await entityExistsInCompany(db, context.companyId, filters.entityType, filters.entityId);
  if (!exists) throw notFoundError();
}

async function entityExistsInCompany(
  db: DbClient,
  companyId: bigint,
  entityType: string,
  entityId: bigint,
) {
  switch (entityType) {
    case "partner":
      return Boolean(await db.partner.findFirst({ where: { id: entityId, companyId }, select: { id: true } }));
    case "purchase":
      return Boolean(await db.purchase.findFirst({ where: { id: entityId, companyId }, select: { id: true } }));
    case "token":
      return Boolean(await db.partnerToken.findFirst({ where: { id: entityId, companyId }, select: { id: true } }));
    case "user":
      return Boolean(await db.user.findFirst({
        where: {
          id: entityId,
          OR: [{ companyId }, { role: "superadmin", companyId: null }],
        },
        select: { id: true },
      }));
    case "company":
      return entityId === companyId;
    case "auth":
      return Boolean(await db.user.findFirst({
        where: {
          id: entityId,
          OR: [{ companyId }, { role: "superadmin", companyId: null }],
        },
        select: { id: true },
      }));
    default:
      return false;
  }
}

function actorName(actors: Map<bigint, Pick<User, "id" | "name">>, userId: bigint) {
  return actors.get(userId)?.name ?? null;
}

function safeAuditJson(value: unknown) {
  const safeValues = publicAuditValues(value);
  return Object.keys(safeValues).length ? JSON.stringify(safeValues) : null;
}

function auditFilterValues(filters: NonNullable<ReturnType<typeof parseCompanyAuditFilters>>) {
  return {
    from: filters.from || null,
    to: filters.to || null,
    userId: filters.userId?.toString() ?? null,
    action: filters.action || null,
    entityType: filters.entityType || null,
    entityId: filters.entityId?.toString() ?? null,
    partnerId: filters.partnerId?.toString() ?? null,
  };
}

async function recordExport(
  tx: Prisma.TransactionClient,
  context: CompanyContext,
  kind: ExportKind,
  filters: Prisma.InputJsonObject,
  rowCount: number,
) {
  await record({
    companyId: context.companyId,
    userId: context.user.id,
    action: "export.csv",
    entityType: "export",
    newValues: { type: kind, filters, rowCount },
  }, tx);
}

async function loadAllPages<T>(fetchPage: (skip: number, take: number) => Promise<T[]>) {
  const rows: T[] = [];
  for (let skip = 0; ; skip += CSV_EXPORT_BATCH_SIZE) {
    const page = await fetchPage(skip, CSV_EXPORT_BATCH_SIZE);
    rows.push(...page);
    if (page.length < CSV_EXPORT_BATCH_SIZE) return rows;
  }
}

function validationError(message: string) {
  return new CsvExportError("VALIDATION_ERROR", message, 400);
}

function notFoundError() {
  return new CsvExportError("NOT_FOUND", "Požadovaný záznam sa nenašiel.", 404);
}
