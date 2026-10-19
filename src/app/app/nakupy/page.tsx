import Link from "next/link";
import { redirect } from "next/navigation";
import type { Prisma } from "@prisma/client";

import { PurchaseHistory } from "@/components/purchases/purchase-history";
import { CsvExportForm } from "@/components/exports/csv-export-form";
import { zonedCalendarDayRange, zonedDayRange } from "@/lib/dates";
import { env } from "@/lib/env";
import { parseUserId } from "@/server/auth/http";
import { requireCompanyPage } from "@/server/auth/session";
import { listPurchases } from "@/server/purchases";
import { notFound } from "next/navigation";
import { ValidatedForm } from "@/components/validated-form";

export default async function PurchasesPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const context = await requireCompanyPage(["admin", "seller"]);
  const params = await searchParams;
  const includeDeleted = params.includeDeleted === "true" && context.user.role !== "seller";
  const partnerInput = typeof params.partnerId === "string" ? params.partnerId : undefined;
  const partnerId = partnerInput ? parseUserId(partnerInput) : null;
  const page = typeof params.page === "string" ? Number(params.page) : 1;
  const from = context.user.role === "seller" ? undefined : typeof params.from === "string" ? params.from : undefined;
  const to = context.user.role === "seller" ? undefined : typeof params.to === "string" ? params.to : undefined;
  const fromDate = from ? parseCalendarDate(from) : null;
  const toDate = to ? parseCalendarDate(to) : null;
  if (
    (partnerInput && !partnerId) ||
    !Number.isInteger(page) || page < 1 || page > 10000 ||
    (from && !fromDate) || (to && !toDate) ||
    (from && to && from > to)
  ) notFound();
  const where: Prisma.PurchaseWhereInput = context.user.role === "seller"
    ? {
        createdByUserId: context.user.id,
        createdAt: (() => {
          const range = zonedDayRange(new Date(), env.APP_TIMEZONE);
          return { gte: range.start, lt: range.end };
        })(),
        isDeleted: false,
      }
    : {
        ...(includeDeleted ? {} : { isDeleted: false }),
        ...(partnerId ? { partnerId } : {}),
        ...(fromDate || toDate ? {
          purchasedAt: {
            ...(fromDate ? { gte: fromDate.start } : {}),
            ...(toDate ? { lt: toDate.end } : {}),
          },
        } : {}),
      };
  const result = await listPurchases(context, where, (page - 1) * 50, 50);
  const lastPage = Math.max(1, Math.ceil(result.total / 50));
  if (page > lastPage) {
    const query = new URLSearchParams(
      Object.entries(params).filter((entry): entry is [string, string] => typeof entry[1] === "string" && entry[0] !== "page"),
    );
    if (lastPage > 1) query.set("page", String(lastPage));
    redirect(`/app/nakupy${query.size ? `?${query}` : ""}`);
  }
  const role = context.user.role === "seller" ? "seller" : context.user.role === "admin" ? "admin" : "superadmin";
  if (context.user.role !== "admin" && context.user.role !== "seller" && context.user.role !== "superadmin") redirect("/app");

  return (
    <section>
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="text-xs font-semibold tracking-[0.14em] text-white/85">EVIDENCIA</p>
          <h1 className="mt-3 text-3xl font-bold tracking-tight text-white sm:text-4xl">
            {context.user.role === "seller" ? "Moje dnešné nákupy" : "Nákupy"}
          </h1>
        </div>
        <div className="flex flex-wrap items-center gap-3">
          {context.user.role !== "seller" ? <CsvExportForm kind="purchases" query={new URLSearchParams({
            ...(partnerId ? { partnerId: partnerId.toString() } : {}),
            ...(from ? { from } : {}),
            ...(to ? { to } : {}),
            includeDeleted: String(includeDeleted),
          }).toString()} /> : null}
          <Link className="min-h-11 rounded-lg bg-primary px-4 py-2.5 text-sm font-semibold text-primary-foreground hover:bg-primary/90" href="/app/sken">
            Nový nákup
          </Link>
        </div>
      </div>
      {context.user.role !== "seller" ? (
        <ValidatedForm method="get" className="glass-surface mt-6 flex flex-wrap items-end gap-3 rounded-xl p-4">
          {partnerId ? <input type="hidden" name="partnerId" value={partnerId.toString()} /> : null}
          {includeDeleted ? <input type="hidden" name="includeDeleted" value="true" /> : null}
          <label className="block text-sm font-medium text-stone-700">
            Od dátumu
            <input className="mt-1 block min-h-11 rounded-md border border-stone-300 px-3" type="date" name="from" defaultValue={from ?? ""} />
          </label>
          <label className="block text-sm font-medium text-stone-700">
            Do dátumu
            <input className="mt-1 block min-h-11 rounded-md border border-stone-300 px-3" type="date" name="to" defaultValue={to ?? ""} />
          </label>
          <button className="min-h-11 rounded-md bg-stone-950 px-4 py-2 text-sm font-semibold text-white">Filtrovať</button>
          {from || to ? <Link className="min-h-11 py-3 text-sm font-medium text-amber-800 underline" href={`/app/nakupy${partnerId || includeDeleted ? `?${new URLSearchParams({ ...(partnerId ? { partnerId: partnerId.toString() } : {}), ...(includeDeleted ? { includeDeleted: "true" } : {}) })}` : ""}`}>Zrušiť dátumy</Link> : null}
        </ValidatedForm>
      ) : null}
      <PurchaseHistory
        items={result.items} role={role} includeDeleted={includeDeleted} total={result.total}
        page={page} pageSize={50} partnerId={partnerId?.toString()} from={from} to={to} showPagination
      />
    </section>
  );
}

function parseCalendarDate(value: string) {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  if (!match) return null;
  try {
    return zonedCalendarDayRange(Number(match[1]), Number(match[2]), Number(match[3]), env.APP_TIMEZONE);
  } catch (error) {
    if (error instanceof RangeError) return null;
    throw error;
  }
}
