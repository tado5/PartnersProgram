import Link from "next/link";
import { redirect } from "next/navigation";

import { AuditEntryList, type AuditEntryItem } from "@/components/audit/audit-entry-list";
import { CsvExportForm } from "@/components/exports/csv-export-form";
import { auditActionLabels, auditEntityLabels } from "@/lib/audit";
import { env } from "@/lib/env";
import { parseCompanyAuditFilters, listCompanyAuditLogs } from "@/server/repositories/audit-logs";
import { requireCompanyPage } from "@/server/auth/session";
import { prisma } from "@/server/db";

const filterActions = Object.keys(auditActionLabels).sort();
const filterEntities = Object.keys(auditEntityLabels).sort();

export default async function AuditPage({ searchParams }: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const context = await requireCompanyPage(["admin"]);
  if (context.user.role === "seller") redirect("/app");

  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(await searchParams)) {
    if (typeof value === "string") params.set(key, value);
    else if (Array.isArray(value) && value[0]) params.set(key, value[0]);
  }
  const filters = parseCompanyAuditFilters(params, context.companyId, env.APP_TIMEZONE);
  if (!filters) {
    return <section>
      <h1 className="text-3xl font-bold text-white sm:text-4xl">Audit log</h1>
      <p role="alert" className="mt-4 rounded-lg border border-red-200 bg-red-50 p-4 text-sm text-red-800">Filtre auditu nie sú platné. Skontrolujte dátumy, ID a číslo strany.</p>
    </section>;
  }

  const [result, actors] = await Promise.all([
    listCompanyAuditLogs(filters),
    listAuditActors(context.companyId),
  ]);
  const items: AuditEntryItem[] = result.items.map((entry) => ({
    id: entry.id.toString(),
    action: entry.action,
    entityType: entry.entityType,
    entityId: entry.entityId?.toString() ?? null,
    partnerId: entry.partnerId?.toString() ?? null,
    actorName: entry.user?.name ?? null,
    reason: entry.reason,
    createdAt: entry.createdAt.toISOString(),
    oldValues: entry.oldValues,
    newValues: entry.newValues,
    partner: entry.partner ? {
      id: entry.partner.id.toString(),
      code: entry.partner.code,
      displayName: entry.partner.displayName,
    } : null,
    targetHref: targetHref(entry.entityType, entry.entityId?.toString() ?? null),
  }));
  const pageCount = Math.max(1, Math.ceil(result.total / result.pageSize));

  return (
    <section>
      <div className="flex flex-wrap items-end justify-between gap-3">
        <h1 className="text-3xl font-bold tracking-tight text-white sm:text-4xl">Audit log</h1>
        <CsvExportForm kind="audit-logs" query={params.toString()} />
      </div>
      <p className="mt-1 max-w-3xl text-sm leading-6 text-white/70">
        Nemenná história zmien a prístupov v programe firmy. Citlivé údaje, ako heslá a kontaktné poznámky, sa nezobrazujú.
      </p>

      <form className="glass-surface my-4 grid gap-x-3 gap-y-2 rounded-xl p-3 sm:grid-cols-2 lg:grid-cols-4 [&_label]:min-w-0 [&_label]:text-xs [&_input]:min-w-0 [&_input]:min-h-10 [&_input]:py-1.5 [&_input]:text-sm [&_select]:min-w-0 [&_select]:min-h-10 [&_select]:py-1.5 [&_select]:text-sm">
        <label className="text-sm font-medium text-stone-700">
          Od
          <input className="mt-1 block w-full rounded-md border border-stone-300 px-3 py-2" type="date" name="from" defaultValue={filters.from} />
        </label>
        <label className="text-sm font-medium text-stone-700">
          Do
          <input className="mt-1 block w-full rounded-md border border-stone-300 px-3 py-2" type="date" name="to" defaultValue={filters.to} />
        </label>
        <label className="text-sm font-medium text-stone-700">
          Používateľ
          <select className="mt-1 block w-full rounded-md border border-stone-300 px-3 py-2" name="userId" defaultValue={filters.userId?.toString() ?? ""}>
            <option value="">Všetci používatelia</option>
            {actors.map((actor) => <option key={actor.id.toString()} value={actor.id.toString()}>{actor.name} · {roleLabel(actor.role)}</option>)}
          </select>
        </label>
        <label className="text-sm font-medium text-stone-700">
          Akcia
          <select className="mt-1 block w-full rounded-md border border-stone-300 px-3 py-2" name="action" defaultValue={filters.action}>
            <option value="">Všetky akcie</option>
            {filterActions.map((action) => <option key={action} value={action}>{auditActionLabels[action]}</option>)}
          </select>
        </label>
        <label className="text-sm font-medium text-stone-700">
          Typ záznamu
          <select className="mt-1 block w-full rounded-md border border-stone-300 px-3 py-2" name="entityType" defaultValue={filters.entityType}>
            <option value="">Všetky typy</option>
            {filterEntities.map((type) => <option key={type} value={type}>{auditEntityLabels[type]}</option>)}
          </select>
        </label>
        <label className="text-sm font-medium text-stone-700">
          ID záznamu
          <input className="mt-1 block w-full rounded-md border border-stone-300 px-3 py-2" inputMode="numeric" name="entityId" defaultValue={filters.entityId?.toString() ?? ""} />
        </label>
        <label className="text-sm font-medium text-stone-700">
          ID partnera
          <input className="mt-1 block w-full rounded-md border border-stone-300 px-3 py-2" inputMode="numeric" name="partnerId" defaultValue={filters.partnerId?.toString() ?? ""} />
        </label>
        <div className="flex flex-wrap items-end gap-2">
          <button className="rounded-md bg-stone-950 px-4 py-2 text-sm font-semibold text-white">Filtrovať</button>
          <Link className="rounded-md px-2 py-2 text-xs text-stone-600 underline hover:text-stone-950" href="/app/audit">Vymazať filtre</Link>
        </div>
      </form>

      <div className="mb-2 flex flex-wrap items-center justify-between gap-2 text-xs text-stone-600">
        <p>Záznamy {result.total ? `${(result.page - 1) * result.pageSize + 1}–${Math.min(result.page * result.pageSize, result.total)} z ${result.total}` : "0"} · strana {result.page} z {pageCount}</p>
        <div className="flex gap-4">
          {result.page > 1 ? <Link href={pageHref(params, result.page - 1)} className="underline">Novšie</Link> : null}
          {result.page < pageCount ? <Link href={pageHref(params, result.page + 1)} className="underline">Staršie</Link> : null}
        </div>
      </div>
      <AuditEntryList items={items} />
    </section>
  );
}

async function listAuditActors(companyId: bigint) {
  return prisma.user.findMany({
    where: {
      OR: [
        { companyId },
        { role: "superadmin", auditLogs: { some: { companyId } } },
      ],
    },
    select: { id: true, name: true, role: true },
    orderBy: [{ name: "asc" }, { id: "asc" }],
  });
}

function pageHref(params: URLSearchParams, page: number) {
  const next = new URLSearchParams(params);
  next.set("page", String(page));
  return `/app/audit?${next}`;
}

function targetHref(entityType: string, entityId: string | null) {
  if (!entityId) return null;
  if (entityType === "partner") return `/app/partneri/${entityId}`;
  if (entityType === "purchase") return `/app/nakupy/${entityId}`;
  if (entityType === "company") return "/app/nastavenia";
  return null;
}

function roleLabel(role: string) {
  if (role === "superadmin") return "superadmin";
  if (role === "admin") return "admin";
  return "predavač";
}
