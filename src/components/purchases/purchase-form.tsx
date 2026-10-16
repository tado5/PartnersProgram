"use client";

import Link from "next/link";
import { useRef, useState, type FormEvent } from "react";

import { useCompanyApi } from "@/components/company-context";
import { dateTimeInputInZoneToIso } from "@/lib/dates";
import { netAmountFromGross, pointsForAmount } from "@/lib/purchases";

type PurchaseSuccess = {
  id: string; amount: string; netAmount: string; vatAmount: string;
  vatRatePercent: string; points: number; purchasedAt: string;
};

export function PurchaseForm({
  partner,
  source,
  tokenId,
  initialDate,
  confirmationLimit,
  vatRatePercent,
}: {
  partner: { id: string; code: string; displayName: string; totalPoints: number; totalGrossAmount: string; totalNetAmount: string };
  source: "qr" | "nfc" | "manual";
  tokenId: string | null;
  initialDate: string;
  confirmationLimit: string | null;
  vatRatePercent: string;
}) {
  const { companyFetch } = useCompanyApi();
  const idempotencyKey = useRef<string | null>(null);
  const [amount, setAmount] = useState("");
  const [partnerPresent, setPartnerPresent] = useState("");
  const [note, setNote] = useState("");
  const [purchasedAt, setPurchasedAt] = useState(initialDate);
  const [confirmationRequired, setConfirmationRequired] = useState(false);
  const [confirmedAmount, setConfirmedAmount] = useState(false);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState<PurchaseSuccess | null>(null);

  function changed() {
    idempotencyKey.current = null;
    setConfirmationRequired(false);
    setConfirmedAmount(false);
    setError("");
  }

  async function save(highAmountConfirmed: boolean) {
    const purchasedAtIso = dateTimeInputInZoneToIso(purchasedAt, "Europe/Bratislava");
    if (!purchasedAtIso) {
      setError("Zadaný dátum a čas nie je platný.");
      return;
    }
    if (!idempotencyKey.current) idempotencyKey.current = crypto.randomUUID();
    setPending(true);
    setError("");
    try {
      const response = await companyFetch("/api/purchases", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          partnerId: partner.id,
          amount,
          partnerPresent: partnerPresent === "yes",
          note: note.trim() || undefined,
          source,
          ...(tokenId ? { tokenId } : {}),
          purchasedAt: purchasedAtIso,
          idempotencyKey: idempotencyKey.current,
          highAmountConfirmed,
        }),
      });
      const body = await response.json();
      if (response.status === 409 && body.error?.code === "PURCHASE_CONFIRMATION_REQUIRED") {
        setConfirmationRequired(true);
        return;
      }
      if (!response.ok) throw new Error(body.error?.message ?? "Nákup sa nepodarilo uložiť.");
      setSuccess(body.purchase);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Požiadavku sa nepodarilo dokončiť.");
    } finally {
      setPending(false);
    }
  }

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    void save(confirmedAmount);
  }

  if (success) {
    return (
      <section className="glass-surface rounded-xl border border-emerald-200 bg-emerald-50 p-6">
        <h2 className="text-xl font-semibold text-emerald-950">Nákup bol uložený</h2>
        <p className="mt-2 text-sm text-emerald-900">
          {success.amount} € s DPH · {success.netAmount} € bez DPH · <strong className="text-base font-bold">{success.points} bodov</strong> · {formatDate(success.purchasedAt)}
        </p>
        <p className="mt-1 text-sm text-emerald-900">Použitá sadzba DPH: {success.vatRatePercent} %</p>
        <p className="mt-3 text-sm text-emerald-900">
          Nový súčet partnera: <strong className="text-base font-bold">{partner.totalPoints + success.points} bodov</strong>
        </p>
        <div className="mt-5 flex flex-wrap gap-3">
          <Link className={primaryButton} href="/app/sken">Skenovať ďalšieho</Link>
          <Link className={secondaryButton} href="/app/nakupy">Prejsť na nákupy</Link>
          <Link className={secondaryButton} href="/app">Úvodná stránka</Link>
        </div>
      </section>
    );
  }

  const validAmount = /^\d{1,6}(?:[.,]\d{1,2})?$/.test(amount.trim());
  const preview = validAmount ? netAmountFromGross(amount.replace(",", "."), vatRatePercent) : null;
  const pointsPreview = preview ? pointsForAmount(preview.netAmount) : null;
  return (
    <form aria-busy={pending} onSubmit={submit} className="data-surface rounded-xl p-5 sm:p-6">
      <div className="grid gap-5 sm:grid-cols-2">
        <label className="block text-sm font-medium text-stone-700">
          Suma nákupu s DPH (€)
          <input
            className={inputClass}
            type="text"
            inputMode="decimal"
            autoComplete="off"
            required
            pattern="\d{1,6}([.,]\d{1,2})?"
            maxLength={10}
            value={amount}
            onChange={(event) => { changed(); setAmount(event.target.value); }}
            placeholder="0,00"
          />
          <span className="mt-1 block text-xs font-normal text-stone-500">
            Zadajte sumu z dokladu vrátane DPH. Aktuálna sadzba firmy: {vatRatePercent} %.
          </span>
        </label>
        <fieldset>
          <legend className="text-sm font-medium text-stone-700">Partner bol prítomný? *</legend>
          <div className="mt-3 flex gap-4">
            <label className="flex items-center gap-2 text-sm">
              <input type="radio" name="partnerPresent" value="yes" required checked={partnerPresent === "yes"}
                onChange={(event) => { changed(); setPartnerPresent(event.target.value); }} /> Áno
            </label>
            <label className="flex items-center gap-2 text-sm">
              <input type="radio" name="partnerPresent" value="no" required checked={partnerPresent === "no"}
                onChange={(event) => { changed(); setPartnerPresent(event.target.value); }} /> Nie
            </label>
          </div>
        </fieldset>
        <label className="block text-sm font-medium text-stone-700">
          Dátum a čas nákupu
          <input className={inputClass} type="datetime-local" required value={purchasedAt}
            onChange={(event) => { changed(); setPurchasedAt(event.target.value); }} />
          <span className="mt-1 block text-xs font-normal text-stone-500">Predvolene aktuálny čas; dátum možno upraviť pri zápise.</span>
        </label>
        <label className="block text-sm font-medium text-stone-700">
          Interná poznámka (nepovinné)
          <textarea className={inputClass} maxLength={500} rows={2} value={note}
            onChange={(event) => { changed(); setNote(event.target.value); }} />
        </label>
      </div>
      {pointsPreview !== null && Number.isFinite(pointsPreview) ? (
        <p className="mt-5 rounded-md border border-white/12 bg-white/5 px-4 py-3 text-sm">
          Bez DPH: <strong className="financial-value">{preview?.netAmount} €</strong> · DPH: <span className="financial-value">{preview?.vatAmount} €</span> · pripočíta sa <strong className="financial-value text-base font-bold">{pointsPreview} bodov</strong> zo sumy bez DPH
          {confirmationLimit ? ` · suma od ${confirmationLimit} € vyžaduje dodatočné potvrdenie` : ""}
        </p>
      ) : null}
      {confirmationRequired ? (
        <div className="mt-4 rounded-md border border-amber-300 bg-amber-50 p-4">
          <p className="text-sm font-semibold text-amber-950">
            Suma dosahuje firemný limit {confirmationLimit} €. Potvrďte, že chcete tento nákup zapísať.
          </p>
          <label className="mt-3 flex items-center gap-2 text-sm">
            <input type="checkbox" checked={confirmedAmount} onChange={(event) => setConfirmedAmount(event.target.checked)} />
            Potvrdzujem správnosť sumy a zápisu
          </label>
        </div>
      ) : null}
      {error ? <p role="alert" className="mt-4 text-sm text-red-700">{error}</p> : null}
      <div className="mt-5 flex flex-wrap gap-3">
        <button className={primaryButton} disabled={pending || (confirmationRequired && !confirmedAmount)}>
          {pending ? "Ukladám…" : confirmationRequired ? "Potvrdiť a uložiť nákup" : "Uložiť nákup"}
        </button>
        <Link className={secondaryButton} href="/app/sken">Zrušiť</Link>
      </div>
    </form>
  );
}

function formatDate(value: string) {
  return new Intl.DateTimeFormat("sk-SK", {
    dateStyle: "medium", timeStyle: "short", timeZone: "Europe/Bratislava",
  }).format(new Date(value));
}

const inputClass = "mt-2 block w-full rounded-md border border-stone-300 px-3 py-2";
const primaryButton = "inline-flex rounded-md bg-stone-950 px-4 py-2.5 text-sm font-semibold text-white hover:bg-stone-800 disabled:opacity-50";
const secondaryButton = "inline-flex rounded-md border border-stone-300 px-4 py-2.5 text-sm font-semibold text-stone-700 hover:bg-stone-100";
