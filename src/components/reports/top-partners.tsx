import Link from "next/link";

export type TopPartner = {
  id: string; code: string; displayName: string; points: number; netAmount: string; grossAmount: string;
};

const podium = [
  { label: "1. miesto", medal: "🥇", tone: "podium-card--gold" },
  { label: "2. miesto", medal: "🥈", tone: "podium-card--silver" },
  { label: "3. miesto", medal: "🥉", tone: "podium-card--bronze" },
] as const;

function TopPartnerCard({ rank, partner }: { rank: number; partner: TopPartner }) {
  const style = podium[rank - 1];
  return (
    <li className={`podium-card ${style.tone} rounded-xl p-4`}>
      <div className="flex items-center justify-between gap-3">
        <span className="inline-flex items-center gap-1.5 rounded-full border border-white/20 bg-black/25 px-2.5 py-1 text-xs font-bold text-white">
          <span aria-hidden="true">{style.medal}</span>
          <span>{style.label}</span>
        </span>
        <span className="text-xs text-stone-600">{partner.code}</span>
      </div>
      <Link className="mt-3 block truncate font-semibold text-stone-950 underline" href={`/app/partneri/${partner.id}`}>
        {partner.displayName}
      </Link>
      <p className="podium-points financial-value mt-2 text-4xl font-extrabold tracking-tight">
        {partner.points.toLocaleString("sk-SK")} <span className="text-lg font-bold">bodov</span>
      </p>
      <p className="mt-1 text-sm text-stone-700">
        Tržba <strong className="financial-value">{partner.netAmount} €</strong> bez DPH · <span className="financial-value">{partner.grossAmount} €</span> s DPH
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
        <p className="glass-surface mt-4 rounded-xl p-5 text-sm text-white/75">Za toto obdobie nie sú evidované nákupy.</p>
      )}
    </section>
  );
}
