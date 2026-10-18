import {
  ArrowDownRight,
  ArrowRight,
  BadgeCheck,
  Building2,
  ScanLine,
} from "lucide-react";
import Link from "next/link";

const features = [
  {
    icon: Building2,
    label: "Partneri",
    description: "Evidencia montážnikov, firiem a odporúčateľov na jednom mieste.",
    accent: "text-primary",
  },
  {
    icon: ScanLine,
    label: "Nákupy a body",
    description: "Zápis nákupu priradeného k partnerovi cez QR kód alebo vyhľadanie.",
    accent: "text-[color:var(--color-teal)]",
  },
  {
    icon: BadgeCheck,
    label: "Prehľad programu",
    description: "Reporty, história nákupov a získané body v prehľadnej evidencii.",
    accent: "text-[color:var(--color-pink)]",
  },
];

export default function Home() {
  return (
    <main className="relative isolate flex min-h-[100dvh] flex-col overflow-hidden px-4 sm:px-6">
      <div aria-hidden="true" className="pointer-events-none absolute inset-0 -z-10 overflow-hidden">
        <div className="absolute -left-40 top-24 size-[28rem] rounded-full bg-primary/20 blur-[110px]" />
        <div className="absolute -right-36 top-1/3 size-[30rem] rounded-full bg-secondary/20 blur-[120px]" />
        <div className="absolute bottom-[-12rem] left-1/3 size-[26rem] rounded-full bg-[color:var(--color-teal)]/10 blur-[110px]" />
      </div>

      <header className="mx-auto flex w-full max-w-7xl items-center justify-between gap-4 py-5 sm:py-7">
        <Link href="/" aria-label="PartnersProgram, úvod" className="flex items-center gap-3">
          <span aria-hidden="true" className="flex size-10 items-center justify-center rounded-xl border border-white/20 bg-white/10 text-lg font-bold text-white shadow-lg">
            P
          </span>
          <span className="text-base font-semibold tracking-tight text-white sm:text-lg">
            Partners<span className="text-primary">Program</span>
          </span>
        </Link>
        <Link
          href="/login"
          className="inline-flex min-h-11 items-center justify-center gap-2 rounded-lg border border-white/20 bg-white/10 px-4 text-sm font-semibold text-white transition hover:bg-white/15 focus-visible:outline-offset-4"
        >
          Prihlásiť sa
          <ArrowRight aria-hidden="true" className="size-4" />
        </Link>
      </header>

      <div className="mx-auto grid w-full max-w-7xl flex-1 items-center gap-12 py-12 sm:py-16 lg:grid-cols-[1.05fr_0.95fr] lg:gap-16 lg:py-20">
        <section aria-labelledby="welcome-title" className="max-w-2xl">
          <p className="mb-6 inline-flex items-center gap-2 rounded-full border border-primary/35 bg-primary/10 px-3.5 py-2 text-xs font-semibold tracking-wide text-white">
            <span aria-hidden="true" className="size-2 rounded-full bg-primary" />
            SPOLUPRÁCA, KTORÁ SA POČÍTA
          </p>
          <h1 id="welcome-title" className="text-[clamp(2.5rem,5vw,4.5rem)] font-bold leading-[1.06] tracking-tight text-white">
            Partnerstvo, ktoré má <span className="text-primary">prehľad.</span>
          </h1>
          <p className="mt-6 max-w-xl text-base leading-7 text-white/75 sm:text-lg sm:leading-8">
            Vitajte v aplikácii PartnersProgram. Jednoducho spravujte
            partnerov, evidujte nákupy a sledujte získané body.
          </p>
          <div className="mt-9 flex flex-col gap-3 sm:flex-row">
            <Link
              href="/login"
              className="inline-flex min-h-12 items-center justify-center gap-2 rounded-lg bg-primary px-5 py-3 text-sm font-semibold text-primary-foreground shadow-[0_10px_30px_rgba(0,128,255,0.22)] transition hover:-translate-y-0.5 hover:bg-primary/90 focus-visible:outline-offset-4"
            >
              Vstúpiť do programu
              <ArrowRight aria-hidden="true" className="size-4" />
            </Link>
            <a
              href="#ako-to-funguje"
              className="inline-flex min-h-12 items-center justify-center gap-2 rounded-lg border border-white/20 bg-white/5 px-5 py-3 text-sm font-semibold text-white transition hover:bg-white/10 focus-visible:outline-offset-4"
            >
              Ako program funguje
              <ArrowDownRight aria-hidden="true" className="size-4" />
            </a>
          </div>
          <p className="mt-5 text-sm text-white/60">
            Prístup do aplikácie vám vytvorí správca programu.
          </p>
        </section>

        <section aria-labelledby="features-title" className="glass-surface relative rounded-3xl p-6 sm:p-8 lg:p-9">
          <div aria-hidden="true" className="absolute -right-3 -top-3 size-20 rounded-full border border-white/15 bg-[radial-gradient(circle_at_35%_35%,rgba(255,255,255,0.3),rgba(139,0,255,0.22)_48%,transparent_72%)] blur-sm" />
          <div className="relative">
            <p className="text-xs font-semibold tracking-[0.14em] text-white/60">VÁŠ PRACOVNÝ PRIESTOR</p>
            <h2 id="features-title" className="mt-3 text-2xl font-bold tracking-tight text-white sm:text-3xl">
              Všetko dôležité. Na jednom mieste.
            </h2>
            <ul className="mt-8 divide-y divide-white/12">
              {features.map(({ icon: Icon, label, description, accent }, index) => (
                <li key={label} className="flex gap-4 py-5 first:pt-0 last:pb-0">
                  <span className="mt-0.5 flex size-11 shrink-0 items-center justify-center rounded-xl border border-white/15 bg-black/20">
                    <Icon aria-hidden="true" className={`size-5 ${accent}`} />
                  </span>
                  <div>
                    <p className="text-xs font-medium text-white/45">0{index + 1}</p>
                    <h3 className="mt-1 font-semibold text-white">{label}</h3>
                    <p className="mt-1 text-sm leading-6 text-white/70">{description}</p>
                  </div>
                </li>
              ))}
            </ul>
          </div>
        </section>
      </div>

      <section id="ako-to-funguje" aria-labelledby="steps-title" className="mx-auto w-full max-w-7xl border-t border-white/12 py-10 sm:py-12">
        <p className="text-xs font-semibold tracking-[0.14em] text-white/55">JEDNODUCHÝ POSTUP</p>
        <h2 id="steps-title" className="mt-2 text-xl font-semibold text-white sm:text-2xl">Od partnerskej karty k prehľadu bodov</h2>
        <ol className="mt-6 grid gap-3 md:grid-cols-3">
          {[
            ["Karta partnera", "Partner dostane QR alebo NFC kartu pre svoju partnerskú evidenciu."],
            ["Evidencia nákupu", "Predajca nájde partnera a zaznamená jeho nákup v programe."],
            ["Prehľad bodov", "Partner si môže pozrieť body a históriu na svojej karte."],
          ].map(([title, description], index) => (
            <li key={title} className="rounded-xl border border-white/12 bg-black/20 p-4">
              <p className="text-xs font-semibold text-white/85">KROK 0{index + 1}</p>
              <h3 className="mt-2 font-semibold text-white">{title}</h3>
              <p className="mt-1 text-sm leading-6 text-white/65">{description}</p>
            </li>
          ))}
        </ol>
        <footer className="mt-9 flex flex-wrap items-center justify-between gap-3 border-t border-white/12 pt-5 text-sm">
          <p className="text-white/60">Správa partnerov a vernostných bodov pre viacero firiem.</p>
          <div className="flex flex-wrap items-center gap-5">
            <Link href="/gdpr" className="text-white/70 underline decoration-white/30 underline-offset-4 transition hover:text-white">
              Ochrana osobných údajov
            </Link>
            <span className="text-white/45">© PartnersProgram</span>
          </div>
        </footer>
      </section>
    </main>
  );
}
