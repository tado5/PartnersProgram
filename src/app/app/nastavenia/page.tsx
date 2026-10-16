import { redirect } from "next/navigation";

import { PurchaseConfirmationSettings } from "@/components/companies/purchase-confirmation-settings";
import { CompanyLogoSettings } from "@/components/companies/company-logo-settings";
import { companyLogoDataUrl } from "@/lib/company-logo";
import { PrivacySettings } from "@/components/companies/privacy-settings";
import { getCompanyPrivacy } from "@/server/privacy";
import { requireCompanyPage } from "@/server/auth/session";

export default async function CompanySettingsPage() {
  const context = await requireCompanyPage(["admin"]);
  if (context.user.role === "seller") redirect("/app");
  const privacy = await getCompanyPrivacy(context.companyId);

  return (
    <section>
      <p className="text-xs font-semibold tracking-[0.14em] text-white/85">FIRMA</p>
      <h1 className="mt-3 text-3xl font-bold tracking-tight text-white sm:text-4xl">Nastavenia firmy</h1>
      <p className="mt-3 max-w-2xl leading-7 text-white/70">
        Nastavte sadzbu DPH, potvrdenie vysokej sumy a mesačné hranice partnerských ocenení počítané z obratu bez DPH.
      </p>
      {context.user.role !== "admin" ? (
        <p className="glass-surface mt-4 max-w-2xl rounded-xl p-3 text-sm text-white">
          Tieto nastavenia môže meniť iba admin danej firmy. Ako superadmin ich vidíte len na čítanie.
        </p>
      ) : null}
      <div className="mt-6">
        <PrivacySettings initial={privacy} companySlug={context.company.slug}
          companyName={context.company.name} companyIco={context.company.ico} readOnly={context.user.role !== "admin"} />
        <CompanyLogoSettings companyName={context.company.name}
          logoUrl={companyLogoDataUrl(context.company.logoData)} readOnly={context.user.role !== "admin"} />
        <PurchaseConfirmationSettings
          readOnly={context.user.role !== "admin"}
          initialVatRate={context.company.vatRatePercent.toFixed(2)}
          initialLimit={context.company.purchaseConfirmAboveEur?.toFixed(2) ?? null}
          initialBadgeThresholds={{
            bronze: context.company.bronzeMonthlyTurnoverEur?.toFixed(2) ?? "",
            silver: context.company.silverMonthlyTurnoverEur?.toFixed(2) ?? "",
            gold: context.company.goldMonthlyTurnoverEur?.toFixed(2) ?? "",
          }}
        />
      </div>
    </section>
  );
}
