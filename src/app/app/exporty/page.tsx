import type { ReactNode } from "react";

import { CsvExportForm } from "@/components/exports/csv-export-form";
import { auditActionLabels, auditEntityLabels } from "@/lib/audit";
import { env } from "@/lib/env";
import { requireCompanyPage } from "@/server/auth/session";
import { parseReportPeriod } from "@/server/reports";

const inputClass = "mt-1 block min-h-11 w-full min-w-0 rounded-md border border-stone-300 bg-white px-3 py-2 text-sm";

export default async function ExportsPage() {
  await requireCompanyPage(["admin"]);
  const currentMonth = parseReportPeriod({})!.month!;

  return (
    <section>
      <h1 className="text-3xl font-semibold tracking-tight text-stone-950">Exporty CSV</h1>
      <p className="mt-2 max-w-3xl text-sm leading-6 text-stone-600">
        Export obsahuje všetky záznamy zodpovedajúce filtrom aktuálnej firmy, nie iba zobrazenú stranu.
        Súbory používajú UTF-8 s BOM, bodkočiarku a desatinnú čiarku pre Excel.
        Dátumy sú v pásme {env.APP_TIMEZONE}. Každé vytvorenie exportu sa zaznamená do auditu.
      </p>
      <p className="mt-2 max-w-3xl text-sm leading-6 text-stone-600">
        Ak Excel nerozdelí stĺpce správne, použite import z textu/CSV: kódovanie UTF-8,
        oddeľovač bodkočiarka a desatinná čiarka (slovenské miestne nastavenie).
      </p>
      <div className="mt-6 grid gap-5 xl:grid-cols-2">
        <Panel title="Partneri" description="Kontaktné údaje a stav partnerov. Súbor obsahuje aj interné údaje — ukladajte ho bezpečne.">
          <CsvExportForm kind="partners">
            <div className="grid w-full gap-3 sm:grid-cols-2">
              <label className="text-sm">Vyhľadávanie
                <input className={inputClass} name="q" placeholder="Kód, meno, telefón alebo IČO" maxLength={191} />
              </label>
              <PartnerTypeSelect />
              <label className="text-sm">Stav partnera
                <select className={inputClass} name="active" defaultValue="all">
                  <option value="all">Všetky stavy</option>
                  <option value="true">Aktívni</option>
                  <option value="false">Neaktívni</option>
                </select>
              </label>
            </div>
          </CsvExportForm>
        </Panel>
        <Panel title="Nákupy" description="Jednotlivé nákupy vrátane súm s DPH aj bez DPH, bodov a autora. Bez dátumov sa exportuje celá história.">
          <CsvExportForm kind="purchases">
            <div className="grid w-full gap-3 sm:grid-cols-2">
              <DateFields />
              <label className="text-sm">ID partnera (nepovinné)
                <input className={inputClass} name="partnerId" inputMode="numeric" pattern="[0-9]+" />
              </label>
              <label className="text-sm">Zmazané nákupy
                <select className={inputClass} name="includeDeleted" defaultValue="false">
                  <option value="false">Vynechať zmazané</option>
                  <option value="true">Vrátane zmazaných</option>
                </select>
              </label>
            </div>
          </CsvExportForm>
        </Panel>
        <Panel title="Mesačný prehľad" description="Súčty partnerov sa zhodujú s reportom za vybraný mesiac; zmazané nákupy sa nezapočítavajú. Vlastné obdobie môžete exportovať priamo v reportoch.">
          <CsvExportForm kind="monthly">
            <div className="grid w-full gap-3 sm:grid-cols-2">
              <label className="text-sm">Mesiac
                <input className={inputClass} name="month" type="month" required defaultValue={currentMonth} />
              </label>
              <PartnerTypeSelect />
            </div>
          </CsvExportForm>
        </Panel>
        <Panel title="Audit log" description="Nemenná história udalostí s bezpečnými pôvodnými a novými hodnotami. Heslá, tokeny ani skryté kontaktné hodnoty sa neexportujú.">
          <CsvExportForm kind="audit-logs">
            <div className="grid w-full gap-3 sm:grid-cols-2">
              <DateFields />
              <label className="text-sm">Akcia
                <select className={inputClass} name="action" defaultValue="">
                  <option value="">Všetky akcie</option>
                  {Object.entries(auditActionLabels).map(([value, label]) => <option value={value} key={value}>{label}</option>)}
                </select>
              </label>
              <label className="text-sm">Typ záznamu
                <select className={inputClass} name="entityType" defaultValue="">
                  <option value="">Všetky typy</option>
                  {Object.entries(auditEntityLabels).map(([value, label]) => <option value={value} key={value}>{label}</option>)}
                </select>
              </label>
              <label className="text-sm">ID partnera (nepovinné)
                <input className={inputClass} name="partnerId" inputMode="numeric" pattern="[0-9]+" />
              </label>
              <label className="text-sm">ID používateľa (nepovinné)
                <input className={inputClass} name="userId" inputMode="numeric" pattern="[0-9]+" />
              </label>
              <label className="text-sm">ID záznamu (nepovinné)
                <input className={inputClass} name="entityId" inputMode="numeric" pattern="[0-9]+" />
              </label>
            </div>
          </CsvExportForm>
        </Panel>
      </div>
    </section>
  );
}

function Panel({ title, description, children }: { title: string; description: string; children: ReactNode }) {
  return <section className="min-w-0 rounded-xl border border-stone-200 bg-white p-4 sm:p-5">
    <h2 className="text-xl font-semibold text-stone-950">{title}</h2>
    <p className="mb-4 mt-2 text-sm leading-6 text-stone-600">{description}</p>
    {children}
  </section>;
}

function DateFields() {
  return <>
    <label className="text-sm">Od dátumu
      <input className={inputClass} name="from" type="date" />
    </label>
    <label className="text-sm">Do dátumu (vrátane)
      <input className={inputClass} name="to" type="date" />
    </label>
  </>;
}

function PartnerTypeSelect() {
  return <label className="text-sm">Typ partnera
    <select className={inputClass} name="type" defaultValue="">
      <option value="">Všetky typy</option>
      <option value="installer">Montážnik</option>
      <option value="company">Firma</option>
      <option value="referrer">Odporúčateľ</option>
    </select>
  </label>;
}
