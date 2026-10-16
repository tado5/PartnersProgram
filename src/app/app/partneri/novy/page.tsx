import { redirect } from "next/navigation";

import { PartnerForm } from "@/components/partners/partner-form";
import { requireCompanyPage } from "@/server/auth/session";
import Link from "next/link";
import { currentPrivacyNotice } from "@/server/privacy";

export default async function NewPartnerPage() {
  const context = await requireCompanyPage(["admin"]);
  if (!context) redirect("/login");
  if (context.user.role === "seller") redirect("/app");
  const notice = await currentPrivacyNotice(context.companyId);

  return (
    <section className="mx-auto max-w-3xl">
      <p       className="text-xs font-semibold tracking-[0.14em] text-white/85">
        Administrácia
      </p>
      <h1 className="mb-6 mt-3 text-3xl font-bold tracking-tight text-white sm:text-4xl">
        Nový partner
      </h1>
      {notice ? <PartnerForm privacyNotice={{
        id: notice.id.toString(), version: notice.version,
        url: `/ochrana-udajov/${context.company.slug}?version=${notice.version}`,
      }} /> : <p role="alert" className="glass-surface rounded-xl border border-primary/35 p-5 text-white">
        Registrácia nových partnerov je zablokovaná, kým admin firmy nepublikuje informačné oznámenie.
        {" "}<Link href="/app/nastavenia" className="underline">Otvoriť nastavenia firmy</Link>.
        Existujúce karty a nákupy zostávajú funkčné.
      </p>}
    </section>
  );
}
