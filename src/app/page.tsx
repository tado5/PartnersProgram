import { BadgeCheck, Building2, ScanLine } from "lucide-react";
import Link from "next/link";

const highlights = [
  {
    icon: Building2,
    label: "Partneri",
    description: "Evidencia montážnikov, firiem a odporúčateľov.",
  },
  {
    icon: ScanLine,
    label: "Nákupy a body",
    description: "Jednoduchý zápis nákupu priradeného k partnerovi.",
  },
  {
    icon: BadgeCheck,
    label: "Prehľadné odmeny",
    description: "Partner má svoje body a históriu vždy poruke.",
  },
];

export default function Home() {
  return (
    <main className="mx-auto flex min-h-screen w-full max-w-6xl flex-col px-6 py-8 sm:px-10 lg:px-12">
      <header className="flex items-center justify-between border-b border-stone-200 pb-6">
        <Link href="/" className="text-lg font-bold tracking-tight text-stone-950">
          europodlahy<span className="text-amber-700">.</span>
        </Link>
        <span className="rounded-full border border-stone-200 px-3 py-1 text-xs font-medium text-stone-600">
          Partnerský program
        </span>
      </header>

      <section className="grid flex-1 items-center gap-12 py-16 lg:grid-cols-[1.15fr_0.85fr] lg:py-24">
        <div>
          <p className="mb-5 text-sm font-semibold uppercase tracking-[0.18em] text-amber-800">
            Spolupráca, ktorá sa počíta
          </p>
          <h1 className="max-w-2xl text-4xl font-semibold leading-tight tracking-tight text-stone-950 sm:text-6xl">
            Vitajte v partnerskom programe Europodlahy.
          </h1>
          <p className="mt-6 max-w-xl text-lg leading-8 text-stone-600">
            Jednoduchý prehľad partnerov, nákupov a získaných bodov. Prihláste
            sa a pokračujte do svojho pracovného priestoru.
          </p>
          <Link
            href="/login"
            className="mt-9 inline-flex rounded-md bg-stone-950 px-5 py-3 text-sm font-semibold text-white transition hover:bg-stone-800"
          >
            Prihlásiť sa
          </Link>
        </div>

        <div className="rounded-2xl border border-stone-200 bg-white p-6 shadow-sm sm:p-8">
          <p className="text-sm font-semibold text-stone-950">
            Všetko dôležité na jednom mieste
          </p>
          <ul className="mt-6 divide-y divide-stone-100">
            {highlights.map(({ icon: Icon, label, description }) => (
              <li key={label} className="flex gap-4 py-5 first:pt-0 last:pb-0">
                <span className="mt-0.5 flex size-10 shrink-0 items-center justify-center rounded-lg bg-amber-50 text-amber-800">
                  <Icon aria-hidden="true" size={19} />
                </span>
                <div>
                  <h2 className="font-semibold text-stone-900">{label}</h2>
                  <p className="mt-1 text-sm leading-6 text-stone-600">
                    {description}
                  </p>
                </div>
              </li>
            ))}
          </ul>
        </div>
      </section>

      <footer className="border-t border-stone-200 py-5 text-xs text-stone-500">
        Europodlahy · Partnerský evidenčný systém
      </footer>
    </main>
  );
}
