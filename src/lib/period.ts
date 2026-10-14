export type PeriodValue = { month: string | null; from: string; to: string };

const monthFormatter = new Intl.DateTimeFormat("sk-SK", { month: "long", year: "numeric", timeZone: "UTC" });
const dayFormatter = new Intl.DateTimeFormat("sk-SK", { day: "numeric", month: "numeric", year: "numeric", timeZone: "UTC" });

export function shiftMonth(month: string, delta: number) {
  const [year, monthIndex] = month.split("-").map(Number);
  const date = new Date(Date.UTC(year, monthIndex - 1 + delta, 1));
  return `${date.getUTCFullYear().toString().padStart(4, "0")}-${(date.getUTCMonth() + 1).toString().padStart(2, "0")}`;
}

export function monthLabel(month: string) {
  const label = monthFormatter.format(new Date(`${month}-01T00:00:00.000Z`));
  return label.charAt(0).toLocaleUpperCase("sk-SK") + label.slice(1);
}

export function periodLabel(period: PeriodValue) {
  if (period.month) return monthLabel(period.month);
  const from = dayFormatter.format(new Date(`${period.from}T00:00:00.000Z`));
  const to = dayFormatter.format(new Date(`${period.to}T00:00:00.000Z`));
  return from === to ? from : `${from} – ${to}`;
}

/** Last `count` months ending at `currentMonth`, newest first; keeps `selected` if older. */
export function monthOptions(currentMonth: string, selected: string | null, count = 6) {
  const months = Array.from({ length: count }, (_, index) => shiftMonth(currentMonth, -index));
  if (selected && !months.includes(selected)) months.push(selected);
  return months.sort().reverse();
}
