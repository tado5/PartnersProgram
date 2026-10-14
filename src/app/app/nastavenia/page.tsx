import { redirect } from "next/navigation";

import { PurchaseConfirmationSettings } from "@/components/companies/purchase-confirmation-settings";
import { requireCompanyPage } from "@/server/auth/session";

export default async function CompanySettingsPage() {
  const context = await requireCompanyPage(["admin"]);
  if (context.user.role === "seller") redirect("/app");

  return (
    <section>
      <p className="text-sm font-semibold uppercase tracking-[0.16em] text-amber-800">Firma</p>
      <h1 className="mt-3 text-3xl font-semibold tracking-tight text-stone-950">Nastavenia firmy</h1>
      <p className="mt-3 max-w-2xl leading-7 text-stone-600">
        Nastavte sadzbu DPH, potvrdenie vysokej sumy a mesačné hranice partnerských ocenení počítané z obratu bez DPH.
      </p>
      {context.user.role !== "admin" ? (
        <p className="mt-4 max-w-2xl rounded-md bg-amber-50 p-3 text-sm text-amber-900">
          Tieto nastavenia môže meniť iba admin danej firmy. Ako superadmin ich vidíte len na čítanie.
        </p>
      ) : null}
      <div className="mt-6">
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
