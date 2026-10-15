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
      <p className="text-sm font-semibold uppercase tracking-[0.16em] text-amber-800">
        Administrácia
      </p>
      <h1 className="mb-6 mt-3 text-3xl font-semibold tracking-tight text-stone-950">
        Nový partner
      </h1>
      {notice ? <PartnerForm privacyNotice={{
        id: notice.id.toString(), version: notice.version,
        url: `/ochrana-udajov/${context.company.slug}?version=${notice.version}`,
      }} /> : <p role="alert" className="rounded-xl border border-amber-300 bg-amber-50 p-5 text-amber-950">
        Registrácia nových partnerov je zablokovaná, kým admin firmy nepublikuje informačné oznámenie.
        {" "}<Link href="/app/nastavenia" className="underline">Otvoriť nastavenia firmy</Link>.
        Existujúce karty a nákupy zostávajú funkčné.
      </p>}
    </section>
  );
}
