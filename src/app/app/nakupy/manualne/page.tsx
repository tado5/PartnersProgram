import Link from "next/link";
import { redirect } from "next/navigation";

import { PartnerPicker } from "@/components/purchases/partner-picker";
import { requireCompanyPage } from "@/server/auth/session";

export default async function ManualPurchasePage() {
  const context = await requireCompanyPage(["admin", "seller"]);
  if (context.user.role !== "admin" && context.user.role !== "seller") redirect("/app");
  return (
    <section className="mx-auto max-w-3xl">
      <p className="text-xs font-semibold tracking-[0.14em] text-white/85">ZÁPIS NÁKUPU</p>
      <h1 className="mt-3 text-3xl font-bold tracking-tight text-white sm:text-4xl">Nákup bez karty</h1>
      <p className="mt-2 max-w-2xl leading-7 text-white/70">
        Vyhľadajte partnera a zapíšte mu nový nákup. Nákup sa uloží ako zadaný ručne (bez QR/NFC).
      </p>
      <div className="glass-surface mt-6 rounded-xl p-4 sm:p-5">
        <PartnerPicker />
      </div>
      <div className="mt-6 flex flex-wrap gap-4 text-sm font-medium">
        <Link className="text-amber-800 underline" href="/app/sken">Skenovať QR / NFC kartu</Link>
        <Link className="text-stone-600 underline" href="/app">Späť na úvod</Link>
      </div>
    </section>
  );
}
