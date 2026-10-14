import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import type { Prisma } from "@prisma/client";
import { Suspense } from "react";

import { PageLoading } from "@/components/page-loading";
import { PeriodPicker } from "@/components/period-picker";
import { TopPartners } from "@/components/reports/top-partners";
import { periodLabel } from "@/lib/period";
import { PurchaseHistory, type PurchaseItem } from "@/components/purchases/purchase-history";
import { env } from "@/lib/env";
import { zonedDayRange } from "@/lib/dates";
import { requireCompanyPage } from "@/server/auth/session";
import { listPurchases } from "@/server/purchases";
import { getPeriodReport, parseReportPeriod } from "@/server/reports";
import { prisma } from "@/server/db";

type HomeSearchParams = Promise<Record<string, string | string[] | undefined>>;

export default function AppHomePage({ searchParams }: { searchParams: HomeSearchParams }) {
  return (
    <Suspense fallback={<PageLoading />}>
      <AppHome searchParams={searchParams} />
    </Suspense>
  );
}

async function AppHome({ searchParams }: { searchParams: HomeSearchParams }) {
  const context = await requireCompanyPage();
  if (!context) redirect("/login");
  if (context.user.mustChangePassword) redirect("/change-password");

  if (context.user.role === "seller") {
    const today = zonedDayRange(new Date(), env.APP_TIMEZONE);
    const result = await listPurchases(context, {
      createdByUserId: context.user.id,
      createdAt: { gte: today.start, lt: today.end },
      isDeleted: false,
    }, 0, 10);
    const purchases = result.items as PurchaseItem[];
    return (
      <section>
        <p className="text-sm font-semibold uppercase tracking-[0.16em] text-amber-800">Pracovný priestor</p>
        <h1 className="mt-3 text-3xl font-semibold tracking-tight text-stone-950">Dobrý deň, {context.user.name}.</h1>
        <p className="mt-3 max-w-2xl leading-7 text-stone-600">Rýchlo zapíšte nákup partnera cez mobil alebo počítač.</p>
        <div className="mt-6 flex flex-wrap gap-3">
          <Link className="min-h-12 rounded-md bg-stone-950 px-5 py-3 text-sm font-semibold text-white" href="/app/sken">
            Skenovať partnera
          </Link>
          <Link className="min-h-12 rounded-md border border-stone-300 bg-white px-5 py-3 text-sm font-semibold text-stone-700" href="/app/nakupy/manualne">
            Nákup bez karty
          </Link>
          <Link className="min-h-12 rounded-md border border-stone-300 bg-white px-5 py-3 text-sm font-semibold text-stone-700" href="/app/nakupy">
            Všetky moje dnešné nákupy ({result.total})
          </Link>
        </div>
        <section className="mt-8">
          <h2 className="text-xl font-semibold text-stone-950">Moje dnešné zápisy</h2>
          <p className="mt-1 text-sm text-stone-600">Dnešok sa určuje podľa časového pásma {env.APP_TIMEZONE}.</p>
          <PurchaseHistory
            role="seller"
            items={purchases}
            total={result.total}
            pageSize={10}
          />
        </section>
      </section>
    );
  }

  const params = await searchParams;
  const period = parseReportPeriod(params);
  if (!period) notFound();
  const currentMonth = parseReportPeriod({})!.month!;
  const range = period;
  const where: Prisma.PurchaseWhereInput = {
    companyId: context.companyId,
    isDeleted: false,
    purchasedAt: { gte: range.start, lt: range.end },
  };
  const [report, activePartners, recent] = await Promise.all([
    getPeriodReport(context, period),
    prisma.partner.count({ where: { companyId: context.companyId, isActive: true } }),
    listPurchases(context, where, 0, 10),
  ]);
  const label = periodLabel(period);
  const periodQuery = period.month ? `month=${period.month}` : `from=${period.from}&to=${period.to}`;
  const recentPurchases = recent.items as PurchaseItem[];

  return (
    <section>
      <p className="text-sm font-semibold uppercase tracking-[0.16em] text-amber-800">Pracovný priestor</p>
      <h1 className="mt-3 text-3xl font-semibold tracking-tight text-stone-950">Dobrý deň, {context.user.name}.</h1>
      <p className="mt-3 max-w-2xl leading-7 text-stone-600">Mesačný prehľad firmy a posledné zapísané nákupy. Body aj odznaky sa počítajú zo sumy bez DPH.</p>
      <div className="mt-6 flex flex-wrap gap-3">
        <Link className="min-h-12 rounded-md bg-stone-950 px-5 py-3 text-sm font-semibold text-white" href="/app/sken">Skenovať partnera</Link>
        <Link className="min-h-12 rounded-md border border-stone-300 bg-white px-5 py-3 text-sm font-semibold text-stone-700" href="/app/nakupy/manualne">Nákup bez karty</Link>
        <Link className="min-h-12 rounded-md border border-stone-300 bg-white px-5 py-3 text-sm font-semibold text-stone-700" href="/app/partneri/novy">Nový partner</Link>
        <Link className="min-h-12 rounded-md border border-stone-300 bg-white px-5 py-3 text-sm font-semibold text-stone-700" href={`/app/reporty?${periodQuery}`}>Mesačný report</Link>
      </div>

      <div className="mt-8">
        <PeriodPicker period={period} currentMonth={currentMonth} />
      </div>

      <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
        <Metric label="Obrat bez DPH" value={`${report.summary.netAmount} €`} />
        <Metric label="Tržba s DPH" value={`${report.summary.grossAmount} €`} />
        <Metric label={period.month ? "Body za mesiac" : "Body za obdobie"} value={report.summary.points.toLocaleString("sk-SK")} />
        <Metric label="Počet nákupov" value={String(report.summary.purchases)} />
        <Metric label="Aktívni partneri" value={String(activePartners)} />
      </div>

      <TopPartners className="mt-8" label={label} partners={report.partners} />

      <section className="mt-8">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <h2 className="text-xl font-semibold text-stone-950">Posledné nákupy · {label}</h2>
            <p className="mt-1 text-sm text-stone-600">Zobrazuje sa najviac 10 nákupov z vybraného obdobia.</p>
          </div>
          <Link className="text-sm font-medium text-amber-800 underline" href={`/app/nakupy?from=${period.from}&to=${period.to}`}>
            Otvoriť históriu nákupov
          </Link>
        </div>
        <PurchaseHistory role="admin" items={recentPurchases} total={recent.total} />
      </section>
    </section>
  );
}

function Metric({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl border border-stone-200 bg-white p-4">
      <p className="text-sm text-stone-600">{label}</p>
      <p className="mt-2 text-2xl font-semibold tracking-tight text-stone-950">{value}</p>
    </div>
  );
}
