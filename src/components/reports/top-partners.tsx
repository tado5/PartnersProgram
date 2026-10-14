import Link from "next/link";

export type TopPartner = {
  id: string; code: string; displayName: string; points: number; netAmount: string; grossAmount: string;
};

const podium = [
  { label: "1. miesto", medal: "🥇", card: "border-amber-300 bg-gradient-to-br from-amber-50 to-yellow-100", accent: "text-amber-800", ring: "bg-amber-400 text-amber-950" },
  { label: "2. miesto", medal: "🥈", card: "border-slate-300 bg-gradient-to-br from-slate-50 to-slate-200", accent: "text-slate-700", ring: "bg-slate-300 text-slate-900" },
  { label: "3. miesto", medal: "🥉", card: "border-orange-300 bg-gradient-to-br from-orange-50 to-orange-200", accent: "text-orange-900", ring: "bg-orange-400 text-orange-950" },
] as const;

function TopPartnerCard({ rank, partner }: { rank: number; partner: TopPartner }) {
  const style = podium[rank - 1];
  return (
    <li className={`rounded-xl border p-4 ${style.card}`}>
      <div className="flex items-center justify-between gap-3">
        <span className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-bold ${style.ring}`}>
          <span aria-hidden>{style.medal}</span>{style.label}
        </span>
        <span className="text-xs text-stone-600">{partner.code}</span>
      </div>
      <Link className="mt-3 block truncate font-semibold text-stone-950 underline" href={`/app/partneri/${partner.id}`}>
        {partner.displayName}
      </Link>
      <p className={`mt-2 text-4xl font-extrabold tracking-tight tabular-nums ${style.accent}`}>
        {partner.points.toLocaleString("sk-SK")} <span className="text-lg font-bold">bodov</span>
      </p>
      <p className="mt-1 text-sm text-stone-700">
        Tržba <strong>{partner.netAmount} €</strong> bez DPH · {partner.grossAmount} € s DPH
      </p>
    </li>
  );
}

/** Top 3 partners by net turnover; `partners` must already be ordered by net amount desc. */
export function TopPartners({ partners, label, className = "" }: {
  partners: TopPartner[]; label: string; className?: string;
}) {
  const top = partners.slice(0, 3);
  return (
    <section className={className} aria-labelledby="top-partners-heading">
      <h2 id="top-partners-heading" className="text-xl font-semibold text-stone-950">Top partneri · {label}</h2>
      <p className="mt-1 text-sm text-stone-600">Poradie podľa tržby bez DPH vo vybranom období.</p>
      {top.length ? (
        <ol className="mt-4 grid gap-3 md:grid-cols-3">
          {top.map((partner, index) => (
            <TopPartnerCard key={partner.id} rank={index + 1} partner={partner} />
          ))}
        </ol>
      ) : (
        <p className="mt-4 rounded-xl border border-stone-200 bg-white p-5 text-sm text-stone-600">Za toto obdobie nie sú evidované nákupy.</p>
      )}
    </section>
  );
}
