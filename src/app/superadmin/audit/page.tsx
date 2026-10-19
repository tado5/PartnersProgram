import Link from "next/link";
import { requireSuperadminPage } from "@/server/auth/superadmin";
import { prisma } from "@/server/db";
import { env } from "@/lib/env";
import { zonedCalendarDayRange } from "@/lib/dates";
import { auditActionLabels, AUDIT_PAGE_SIZE } from "@/lib/audit";
import { AuditDateBadges, AuditEntityBadge } from "@/components/audit/audit-badges";
import { parseUserId } from "@/server/auth/http";
import { ValidatedForm } from "@/components/validated-form";

export default async function SuperadminAuditPage({ searchParams }: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  await requireSuperadminPage();
  const query = new URLSearchParams();
  for (const [key, value] of Object.entries(await searchParams)) {
    if (typeof value === "string") query.set(key, value);
    else if (Array.isArray(value) && value[0]) query.set(key, value[0]);
  }

  const companyInput = query.get("companyId") ?? "platform";
  const companyId = companyInput === "platform" ? null : parseUserId(companyInput);
  const from = query.get("from") ?? "";
  const to = query.get("to") ?? "";
  const pageInput = query.get("page") ?? "1";
  const page = /^\d{1,5}$/.test(pageInput) ? Number(pageInput) : NaN;
  if (
    (companyInput !== "platform" && !companyId) ||
    (from && !isCalendarDate(from)) ||
    (to && !isCalendarDate(to)) ||
    (from && to && from > to) ||
    !Number.isInteger(page) || page < 1 || page > 10_000
  ) {
    return <section>
      <h1 className="text-3xl font-bold text-white sm:text-4xl">Platformový audit</h1>
      <p role="alert" className="mt-4 rounded-lg border border-red-200 bg-red-50 p-4 text-sm text-red-800">Filtre auditu nie sú platné.</p>
    </section>;
  }

  let createdAt: { gte?: Date; lt?: Date } | undefined;
  try {
    if (from || to) {
      const start = from ? zonedCalendarDayRange(...dateParts(from), env.APP_TIMEZONE).start : undefined;
      const end = to ? zonedCalendarDayRange(...dateParts(to), env.APP_TIMEZONE).end : undefined;
      createdAt = { ...(start ? { gte: start } : {}), ...(end ? { lt: end } : {}) };
    }
  } catch {
    return <p role="alert">Neplatný dátumový rozsah.</p>;
  }

  const where = {
    companyId,
    ...(createdAt ? { createdAt } : {}),
  };
  const [entries, total, companies] = await Promise.all([
    prisma.auditLog.findMany({
      where,
      include: {
        user: { select: { id: true, name: true, role: true } },
        company: { select: { id: true, name: true } },
      },
      orderBy: [{ createdAt: "desc" }, { id: "desc" }],
      skip: (page - 1) * AUDIT_PAGE_SIZE,
      take: AUDIT_PAGE_SIZE,
    }),
    prisma.auditLog.count({ where }),
    prisma.company.findMany({
      select: { id: true, name: true },
      orderBy: [{ name: "asc" }, { id: "asc" }],
    }),
  ]);
  const pageCount = Math.max(1, Math.ceil(total / AUDIT_PAGE_SIZE));

  return (
    <section>
      <h1 className="text-3xl font-bold tracking-tight text-white sm:text-4xl">Platformový audit</h1>
      <p className="mt-1 text-sm leading-6 text-white/70">Prezeranie platformových udalostí a auditovaných zásahov superadmina v konkrétnej firme.</p>
      <ValidatedForm className="glass-surface my-4 grid gap-x-3 gap-y-2 rounded-xl p-3 sm:grid-cols-2 lg:grid-cols-4 [&_label]:min-w-0 [&_label]:text-xs [&_input]:min-w-0 [&_input]:min-h-10 [&_input]:py-1.5 [&_input]:text-sm [&_select]:min-w-0 [&_select]:min-h-10 [&_select]:py-1.5 [&_select]:text-sm">
        <label className="text-sm font-medium text-stone-700">
          Rozsah
          <select className="mt-1 block w-full rounded-md border border-stone-300 px-3 py-2" name="companyId" defaultValue={companyInput}>
            <option value="platform">Platformové udalosti</option>
            {companies.map((company) => <option key={company.id.toString()} value={company.id.toString()}>{company.name}</option>)}
          </select>
        </label>
        <label className="text-sm font-medium text-stone-700">
          Od
          <input className="mt-1 block w-full rounded-md border border-stone-300 px-3 py-2" type="date" name="from" defaultValue={from} />
        </label>
        <label className="text-sm font-medium text-stone-700">
          Do
          <input className="mt-1 block w-full rounded-md border border-stone-300 px-3 py-2" type="date" name="to" defaultValue={to} />
        </label>
        <div className="flex items-end">
          <button className="rounded-md bg-stone-950 px-4 py-2 text-sm font-semibold text-white">Filtrovať</button>
        </div>
      </ValidatedForm>

      <p className="mb-2 text-xs text-stone-600">Záznamy {total ? `${(page - 1) * AUDIT_PAGE_SIZE + 1}–${Math.min(page * AUDIT_PAGE_SIZE, total)} z ${total}` : "0"} · strana {page} z {pageCount}</p>
      <ol aria-label="Platformové záznamy auditu" className="data-surface divide-y divide-stone-200 overflow-hidden rounded-xl">
        {entries.map((entry) => (
          <li key={entry.id.toString()} className="px-3 py-3 sm:px-4">
            <div className="flex flex-wrap justify-between gap-x-4 gap-y-1">
              <h2 className="text-sm font-semibold text-stone-950">{auditActionLabels[entry.action] ?? entry.action}</h2>
              <AuditDateBadges value={entry.createdAt.toISOString()} />
            </div>
            <p className="mt-0.5 break-words text-xs leading-5 text-stone-600">
              <AuditEntityBadge entityType={entry.entityType} />
              {entry.entityId ? ` · ID ${entry.entityId.toString()}` : ""}
              {" · "}{entry.user?.name ?? "Systém"}
              {" · "}
              {entry.company ? <Link className="underline" href={`/superadmin/firmy/${entry.company.id.toString()}`}>{entry.company.name}</Link> : "Platforma"}
            </p>
            {entry.reason ? <p className="mt-1 break-words text-xs leading-5 text-stone-700"><strong>Dôvod:</strong> {entry.reason}</p> : null}
          </li>
        ))}
        {!entries.length ? <li className="px-4 py-3 text-sm text-stone-600">Pre zvolené filtre sa nenašli žiadne udalosti.</li> : null}
      </ol>
      <div className="mt-3 flex justify-between gap-4 text-xs">
        {page > 1 ? <Link className="underline" href={pageHref(query, page - 1)}>Novšie</Link> : <span />}
        {page < pageCount ? <Link className="underline" href={pageHref(query, page + 1)}>Staršie</Link> : null}
      </div>
    </section>
  );
}

function isCalendarDate(value: string) {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  if (!match) return false;
  const [year, month, day] = match.slice(1).map(Number);
  const date = new Date(Date.UTC(year, month - 1, day));
  return date.getUTCFullYear() === year && date.getUTCMonth() + 1 === month && date.getUTCDate() === day;
}

function dateParts(value: string): [number, number, number] {
  const [year, month, day] = value.split("-").map(Number);
  return [year, month, day];
}

function pageHref(query: URLSearchParams, page: number) {
  const next = new URLSearchParams(query);
  next.set("page", String(page));
  return `/superadmin/audit?${next}`;
}
