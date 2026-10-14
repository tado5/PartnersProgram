"use client";

import { useState, type FormEvent } from "react";
import { useCompanyApi } from "@/components/company-context";

const inputClass = "mt-2 block w-full rounded-md border border-stone-300 px-3 py-2";
const buttonClass = "rounded-md bg-stone-950 px-4 py-2 text-sm font-semibold text-white disabled:opacity-50";

export function PurchaseConfirmationSettings({
  initialVatRate,
  initialLimit,
  initialBadgeThresholds,
  readOnly = false,
}: {
  initialVatRate: string;
  initialLimit: string | null;
  initialBadgeThresholds: {
    bronze: string;
    silver: string;
    gold: string;
  };
  readOnly?: boolean;
}) {
  const { companyFetch } = useCompanyApi();
  const [vatRate, setVatRate] = useState(initialVatRate);
  const [limit, setLimit] = useState(initialLimit ?? "");
  const [thresholds, setThresholds] = useState(initialBadgeThresholds);
  const [error, setError] = useState("");
  const [saved, setSaved] = useState(false);
  const [pending, setPending] = useState(false);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setPending(true);
    setError("");
    setSaved(false);
    try {
      const response = await companyFetch("/api/company/settings", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          vatRatePercent: vatRate.trim(),
          purchaseConfirmAboveEur: limit.trim() || null,
          bronzeMonthlyTurnoverEur: thresholds.bronze.trim() || null,
          silverMonthlyTurnoverEur: thresholds.silver.trim() || null,
          goldMonthlyTurnoverEur: thresholds.gold.trim() || null,
        }),
      });
      const body = await response.json();
      if (!response.ok) {
        setError(body.error?.message ?? "Nastavenie sa nepodarilo uložiť.");
        return;
      }
      setLimit(body.company.purchaseConfirmAboveEur ?? "");
      setVatRate(body.company.vatRatePercent);
      setThresholds({
        bronze: body.company.bronzeMonthlyTurnoverEur ?? "",
        silver: body.company.silverMonthlyTurnoverEur ?? "",
        gold: body.company.goldMonthlyTurnoverEur ?? "",
      });
      setSaved(true);
    } catch {
      setError("Požiadavku sa nepodarilo dokončiť.");
    } finally {
      setPending(false);
    }
  }

  return (
    <form onSubmit={submit} className="max-w-xl space-y-5 rounded-xl border border-stone-200 bg-white p-5">
      <fieldset disabled={readOnly} className="space-y-5">
      <div>
        <label className="block text-sm font-medium text-stone-700" htmlFor="company-vat-rate">
          Sadzba DPH firmy (%)
        </label>
        <input
          id="company-vat-rate"
          className={inputClass}
          type="number"
          min="0"
          max="100"
          step="0.01"
          inputMode="decimal"
          required
          value={vatRate}
          onChange={(event) => setVatRate(event.target.value)}
        />
        <p className="mt-2 text-sm text-stone-600">
          Predvolená sadzba je 23 %. Nové nákupy používajú túto sadzbu; uložené nákupy si zachovajú svoju sadzbu a suma bez DPH.
        </p>
      </div>
      <div>
        <label className="block text-sm font-medium text-stone-700" htmlFor="purchase-confirm-limit">
          Potvrdenie pri nákupe od (€)
        </label>
        <input
          id="purchase-confirm-limit"
          className={inputClass}
          type="number"
          min="0.01"
          max="999999.99"
          step="0.01"
          inputMode="decimal"
          value={limit}
          onChange={(event) => setLimit(event.target.value)}
          placeholder="Bez limitu"
        />
        <p className="mt-2 text-sm text-stone-600">
          Prázdna hodnota vypne dodatočné potvrdenie. Pri sume rovnej limitu alebo vyššej
          musí zapisujúci používateľ nákup ešte raz potvrdiť.
        </p>
      </div>
      <fieldset className="space-y-4 border-t border-stone-200 pt-5">
        <legend className="font-semibold text-stone-900">Mesačné ocenenia partnerov</legend>
        <p className="text-sm text-stone-600">
          Prázdna hranica vypne dané ocenenie. Každý partner, ktorý dosiahne hranicu,
          ho získa; hranice musia byť v rastúcom poradí. Započítava sa obrat bez DPH v aktuálnom mesiaci.
        </p>
        {([
          ["bronze", "Bronzový partner"],
          ["silver", "Strieborný partner"],
          ["gold", "Zlatý partner"],
        ] as const).map(([tier, label]) => (
          <label key={tier} className="block text-sm font-medium text-stone-700">
            {label} od (€)
            <input
              className={inputClass}
              type="number"
              min="0.01"
              max="99999999.99"
              step="0.01"
              inputMode="decimal"
              value={thresholds[tier]}
              onChange={(event) => setThresholds((current) => ({ ...current, [tier]: event.target.value }))}
              placeholder="Vypnuté"
            />
          </label>
        ))}
        <p className="text-sm text-stone-600">
          Po skončení mesiaca sa uloží dosiahnuté ocenenie a obrat. Historické záznamy sa už nemenia.
        </p>
      </fieldset>
      </fieldset>
      {error ? <p role="alert" className="text-sm text-red-700">{error}</p> : null}
      {saved ? <p role="status" className="text-sm text-emerald-800">Nastavenie je uložené.</p> : null}
      {readOnly ? null : (
        <button className={buttonClass} disabled={pending}>
          {pending ? "Ukladám…" : "Uložiť nastavenie"}
        </button>
      )}
    </form>
  );
}
