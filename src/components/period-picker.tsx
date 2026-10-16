"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useState } from "react";
import { CalendarRange, ChevronLeft, ChevronRight } from "lucide-react";

import { monthLabel, monthOptions, shiftMonth, type PeriodValue } from "@/lib/period";

const chip = "inline-flex min-h-11 items-center rounded-full border px-4 text-sm font-medium transition";
const chipIdle = "border-stone-300 bg-white text-stone-700 hover:bg-stone-100";
const chipActive = "border-stone-950 bg-stone-950 text-white";

export function PeriodPicker({
  period, currentMonth, extraParams = {},
}: {
  period: PeriodValue;
  currentMonth: string;
  /** Other query params to keep when the period changes (e.g. partner type filter). */
  extraParams?: Record<string, string | undefined>;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const [showRange, setShowRange] = useState(period.month === null);

  const extras = Object.entries(extraParams).filter((entry): entry is [string, string] => Boolean(entry[1]));
  const hrefFor = (values: Record<string, string>) =>
    `${pathname}?${new URLSearchParams([...Object.entries(values), ...extras]).toString()}`;
  const monthHref = (month: string) => hrefFor({ month });

  const anchorMonth = period.month ?? period.from.slice(0, 7);
  const previousMonth = shiftMonth(anchorMonth, -1);
  const nextMonth = shiftMonth(anchorMonth, 1);
  const lastMonth = shiftMonth(currentMonth, -1);
  const canGoNext = nextMonth <= currentMonth;

  return (
    <div className="glass-surface rounded-xl p-4 sm:p-5">
      <p className="text-sm font-semibold text-white">Obdobie</p>
      <div className="mt-2 flex flex-wrap items-center gap-2">
        <div className="flex items-center gap-1">
          <Link aria-label={`Predchádzajúci mesiac (${monthLabel(previousMonth)})`} href={monthHref(previousMonth)}
            className="inline-flex size-11 items-center justify-center rounded-md border border-stone-300 text-stone-700 hover:bg-stone-100">
            <ChevronLeft className="size-5" />
          </Link>
          <label className="sr-only" htmlFor="period-month">Mesiac</label>
          <select
            id="period-month"
            key={period.month ?? "range"}
            className="min-h-11 rounded-md border border-stone-300 bg-white px-3 text-sm font-semibold text-stone-900"
            defaultValue={period.month ?? ""}
            onChange={(event) => { if (event.target.value) router.push(monthHref(event.target.value)); }}
          >
            {period.month ? null : <option value="">Vlastné obdobie</option>}
            {monthOptions(currentMonth, period.month).map((month) => (
              <option key={month} value={month}>{monthLabel(month)}</option>
            ))}
          </select>
          {canGoNext ? (
            <Link aria-label={`Nasledujúci mesiac (${monthLabel(nextMonth)})`} href={monthHref(nextMonth)}
              className="inline-flex size-11 items-center justify-center rounded-md border border-stone-300 text-stone-700 hover:bg-stone-100">
              <ChevronRight className="size-5" />
            </Link>
          ) : (
            <span aria-hidden className="inline-flex size-11 items-center justify-center rounded-md border border-stone-200 text-stone-300">
              <ChevronRight className="size-5" />
            </span>
          )}
        </div>
        <div className="flex flex-wrap gap-2">
          <Link href={monthHref(currentMonth)} className={`${chip} ${period.month === currentMonth ? chipActive : chipIdle}`}>
            Tento mesiac
          </Link>
          <Link href={monthHref(lastMonth)} className={`${chip} ${period.month === lastMonth ? chipActive : chipIdle}`}>
            Minulý mesiac
          </Link>
          <button type="button" onClick={() => setShowRange((value) => !value)} aria-expanded={showRange}
            className={`${chip} gap-2 ${period.month === null ? chipActive : chipIdle}`}>
            <CalendarRange aria-hidden className="size-4" />Od – do
          </button>
        </div>
      </div>
      {showRange ? (
        <form method="get" action={pathname} className="mt-3 flex flex-wrap items-end gap-3 border-t border-stone-100 pt-3">
          {extras.map(([name, value]) => <input key={name} type="hidden" name={name} value={value} />)}
          <label className="block text-sm font-medium text-stone-700">
            Od dátumu
            <input key={`from-${period.from}`} className="mt-1 block min-h-11 rounded-md border border-stone-300 px-3"
              type="date" name="from" defaultValue={period.from} required />
          </label>
          <label className="block text-sm font-medium text-stone-700">
            Do dátumu
            <input key={`to-${period.to}`} className="mt-1 block min-h-11 rounded-md border border-stone-300 px-3"
              type="date" name="to" defaultValue={period.to} required />
          </label>
          <button className="min-h-11 rounded-md bg-stone-950 px-4 py-2 text-sm font-semibold text-white">Zobraziť</button>
          <p className="w-full text-xs text-stone-500">Najviac 366 dní. Odznaky partnerov sa vždy počítajú po celých mesiacoch.</p>
        </form>
      ) : null}
    </div>
  );
}
