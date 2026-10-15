import { PartnerType } from "@prisma/client";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";

import { env } from "@/lib/env";
import { requireCompanyPage } from "@/server/auth/session";
import { PartnerTypeBadge, partnerTypeLabel } from "@/components/partners/partner-type-badge";
import { ReportPdfButton } from "@/components/reports/report-pdf-button";
import { CsvExportForm } from "@/components/exports/csv-export-form";
import { TopPartners } from "@/components/reports/top-partners";
import { PeriodPicker } from "@/components/period-picker";
import { periodLabel } from "@/lib/period";
import { getPeriodReport, parseReportPeriod } from "@/server/reports";

export default async function MonthlyReportsPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const context = await requireCompanyPage(["admin"]);
  if (context.user.role !== "admin" && context.user.role !== "superadmin") redirect("/app");
  const params = await searchParams;
  const period = parseReportPeriod(params);
  const typeInput = typeof params.type === "string" && params.type ? params.type : undefined;
  if (!period || (typeInput && !Object.values(PartnerType).includes(typeInput as PartnerType))) {
    notFound();
  }

  const report = await getPeriodReport(context, period, typeInput as PartnerType | undefined);
  const currentMonth = parseReportPeriod({})!.month!;
  const periodQuery = period.month ? `month=${period.month}` : `from=${period.from}&to=${period.to}`;

  return (
    <section>
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="text-sm font-semibold uppercase tracking-[0.16em] text-amber-800">Prehľady</p>
          <h1 className="mt-3 text-3xl font-semibold tracking-tight text-stone-950">{period.month ? "Mesačný report" : "Report za obdobie"}</h1>
          <p className="mt-2 text-stone-600">Súhrny zobrazujú sumy s DPH aj bez DPH; body a odznaky vychádzajú zo sumy bez DPH. Obdobie sa počíta podľa {env.APP_TIMEZONE}.</p>
        </div>
        <div className="flex flex-wrap items-center gap-4">
          <ReportPdfButton query={`${periodQuery}${typeInput ? `&type=${typeInput}` : ""}`} />
          <CsvExportForm kind="monthly" query={`${periodQuery}${typeInput ? `&type=${typeInput}` : ""}`} />
          <Link className="text-sm font-medium text-amber-800 underline" href="/app">Späť na dashboard</Link>
        </div>
      </div>

      <div className="mt-6 space-y-3">
        <PeriodPicker period={period} currentMonth={currentMonth} extraParams={{ type: typeInput }} />
        <form method="get" className="flex flex-wrap items-end gap-3 rounded-xl border border-stone-200 bg-white p-4">
          {period.month ? <input type="hidden" name="month" value={period.month} /> : <>
            <input type="hidden" name="from" value={period.from} />
            <input type="hidden" name="to" value={period.to} />
          </>}
          <label className="block text-sm font-medium text-stone-700">
            Typ partnera
            <select className="mt-1 block min-h-11 rounded-md border border-stone-300 bg-white px-3" name="type" defaultValue={typeInput ?? ""} key={typeInput ?? ""}>
              <option value="">Všetky typy</option>
              {Object.values(PartnerType).map((type) => <option value={type} key={type}>{partnerTypeLabel(type)}</option>)}
            </select>
          </label>
          <button className="min-h-11 rounded-md bg-stone-950 px-4 py-2 text-sm font-semibold text-white">Filtrovať</button>
        </form>
      </div>

      <h2 className="mt-8 text-xl font-semibold text-stone-950">{periodLabel(period)}</h2>
      <div className="mt-4 grid gap-3 sm:grid-cols-3">
        <Metric label="Obrat bez DPH" value={`${report.summary.netAmount} €`} />
        <Metric label="Tržba s DPH" value={`${report.summary.grossAmount} €`} />
        <Metric label="Body" value={report.summary.points.toLocaleString("sk-SK")} />
        <Metric label="Počet nákupov" value={String(report.summary.purchases)} />
      </div>

      <TopPartners className="mt-8" label={periodLabel(period)} partners={report.partners} />

      <section className="mt-8">
        <div className="flex flex-wrap items-end justify-between gap-2">
          <div>
            <h2 className="text-xl font-semibold text-stone-950">Partneri podľa obratu</h2>
            <p className="mt-1 text-sm text-stone-600">Zahrnutí sú partneri s aspoň jedným nezmazaným nákupom v tomto období.</p>
          </div>
          {typeInput ? <Link className="text-sm text-amber-800 underline" href={`/app/reporty?${periodQuery}`}>Zrušiť filter typu</Link> : null}
        </div>
        {report.partners.length ? (
          <>
            <ul className="mt-4 space-y-3 md:hidden">
              {report.partners.map((partner) => (
                <li key={partner.id} className="rounded-xl border border-stone-200 bg-white p-4">
                  <div className="flex justify-between gap-3">
                    <div><Link className="font-semibold underline" href={`/app/partneri/${partner.id}`}>{partner.displayName}</Link><p className="mt-1 flex flex-wrap items-center gap-2 text-sm text-stone-600">{partner.code} <PartnerTypeBadge type={partner.type} /></p></div>
                    <strong className="whitespace-nowrap">{partner.netAmount} € bez DPH</strong>
                  </div>
                  <p className="mt-3 text-sm text-stone-600">{partner.grossAmount} € s DPH · {partner.purchases} nákupov · <strong className="text-base font-bold text-stone-950">{partner.points.toLocaleString("sk-SK")} bodov</strong></p>
                </li>
              ))}
            </ul>
            <div className="mt-4 hidden overflow-x-auto rounded-xl border border-stone-200 bg-white md:block">
              <table className="w-full text-left text-sm">
                <thead className="bg-stone-50 text-xs uppercase tracking-wide text-stone-500">
                  <tr><th className="px-4 py-3">Partner</th><th className="px-4 py-3">Typ</th><th className="px-4 py-3 text-right">Nákupov</th><th className="px-4 py-3 text-right">Body</th><th className="px-4 py-3 text-right">S DPH</th><th className="px-4 py-3 text-right">Bez DPH</th></tr>
                </thead>
                <tbody className="divide-y divide-stone-100">
                  {report.partners.map((partner) => (
                    <tr key={partner.id}>
                      <td className="px-4 py-3"><Link className="font-semibold underline" href={`/app/partneri/${partner.id}`}>{partner.displayName}</Link><span className="ml-2 text-xs text-stone-500">{partner.code}</span></td>
                      <td className="px-4 py-3"><PartnerTypeBadge type={partner.type} /></td>
                      <td className="px-4 py-3 text-right">{partner.purchases}</td>
                      <td className="whitespace-nowrap px-4 py-3 text-right text-base font-bold tabular-nums text-stone-950">{partner.points.toLocaleString("sk-SK")}</td>
                      <td className="px-4 py-3 text-right">{partner.grossAmount} €</td>
                      <td className="px-4 py-3 text-right font-semibold">{partner.netAmount} €</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </>
        ) : <p className="mt-4 rounded-xl border border-stone-200 bg-white p-5 text-sm text-stone-600">Za toto obdobie nie sú evidované nákupy.</p>}
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
