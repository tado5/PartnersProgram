"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useRef, useState, type SubmitEvent } from "react";

import { useCompanyApi } from "@/components/company-context";
import { ValidatedForm } from "@/components/validated-form";
import { dateTimeInputInZoneToIso } from "@/lib/dates";
import { netAmountFromGross, pointsForAmount } from "@/lib/purchases";
import { formatApiError } from "@/lib/validation-errors";

export function PurchaseAdminForm({
  purchase,
  partner,
  initialDate,
}: {
  purchase: {
    id: string;
    amount: string;
    netAmount: string;
    vatRatePercent: string;
    partnerPresent: boolean;
    note: string | null;
    isDeleted: boolean;
    partnerId: string;
  };
  partner: { id: string; code: string; displayName: string };
  initialDate: string;
}) {
  const router = useRouter();
  const { companyFetch } = useCompanyApi();
  const [amount, setAmount] = useState(purchase.amount);
  const [present, setPresent] = useState(purchase.partnerPresent);
  const [note, setNote] = useState(purchase.note ?? "");
  const [date, setDate] = useState(initialDate);
  const [selectedPartner, setSelectedPartner] = useState(partner);
  const [partnerQuery, setPartnerQuery] = useState("");
  const [partnerMatches, setPartnerMatches] = useState<Array<{ id: string; code: string; displayName: string }>>([]);
  const [searchingPartners, setSearchingPartners] = useState(false);
  const [reason, setReason] = useState("");
  const [error, setError] = useState("");
  const [deleteReasonInvalid, setDeleteReasonInvalid] = useState(false);
  const [pending, setPending] = useState(false);
  const reasonRef = useRef<HTMLTextAreaElement>(null);
  const partnerQueryRef = useRef<HTMLInputElement>(null);

  async function submit(event: SubmitEvent<HTMLFormElement>) {
    event.preventDefault();
    const purchasedAt = dateTimeInputInZoneToIso(date, "Europe/Bratislava");
    if (!purchasedAt) {
      setError("Dátum a čas: zadaná hodnota nie je platná.");
      return;
    }
    setPending(true);
    setError("");
    try {
      const response = await companyFetch(`/api/purchases/${purchase.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ...(selectedPartner.id !== purchase.partnerId ? { partnerId: selectedPartner.id } : {}),
          amount, partnerPresent: present, note,
          purchasedAt, reason,
        }),
      });
      const body = await response.json();
      if (!response.ok) throw new Error(formatApiError(body.error, "Nákup sa nepodarilo upraviť."));
      router.refresh();
      setReason("");
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Požiadavku sa nepodarilo dokončiť.");
    } finally {
      setPending(false);
    }
  }

  async function searchPartners() {
    if (!partnerQuery.trim()) {
      setError("Vyhľadávanie partnerov: zadajte meno alebo kód.");
      partnerQueryRef.current?.focus();
      return;
    }
    setSearchingPartners(true);
    setError("");
    try {
      const response = await companyFetch(`/api/partners?q=${encodeURIComponent(partnerQuery.trim())}&active=true`);
      const body = await response.json();
      if (!response.ok) throw new Error(formatApiError(body.error, "Vyhľadávanie partnerov zlyhalo."));
      setPartnerMatches(body.items.map((item: { id: string; code: string; displayName: string }) => ({
        id: item.id, code: item.code, displayName: item.displayName,
      })));
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Vyhľadávanie partnerov zlyhalo.");
    } finally {
      setSearchingPartners(false);
    }
  }

  async function remove() {
    if (!reason.trim()) {
      setDeleteReasonInvalid(true);
      setError("Dôvod úpravy: zadajte dôvod pred zmazaním nákupu.");
      reasonRef.current?.focus();
      return;
    }
    if (!window.confirm("Nákup sa označí ako zmazaný a jeho body sa prestanú započítavať. Pokračovať?")) return;
    setPending(true);
    setError("");
    try {
      const response = await companyFetch(`/api/purchases/${purchase.id}`, {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ reason }),
      });
      const body = await response.json();
      if (!response.ok) throw new Error(formatApiError(body.error, "Nákup sa nepodarilo zmazať."));
      router.replace("/app/nakupy?includeDeleted=true");
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Požiadavku sa nepodarilo dokončiť.");
      setPending(false);
    }
  }

  return (
    <ValidatedForm aria-busy={pending} onSubmit={(event) => void submit(event)} className="data-surface rounded-xl p-5">
      {purchase.isDeleted ? (
        <p className="rounded-md bg-red-50 p-3 text-sm font-medium text-red-800">Tento nákup je zmazaný a body sa nezapočítavajú.</p>
      ) : (
        <>
          <fieldset className="mb-5">
            <legend className="text-sm font-medium">Partner</legend>
            <p className="mt-1 text-sm text-stone-600">{selectedPartner.displayName} · {selectedPartner.code}</p>
            <div className="mt-3 flex gap-2">
              <input ref={partnerQueryRef} className={inputClass} aria-label="Vyhľadať iného partnera" name="q" value={partnerQuery}
                onChange={(event) => { setError(""); setPartnerQuery(event.target.value); }} />
              <button className={secondaryButton} type="button" disabled={searchingPartners}
                onClick={() => void searchPartners()}>
                {searchingPartners ? "Hľadám…" : "Vyhľadať"}
              </button>
            </div>
            {partnerMatches.length ? <ul className="data-surface mt-2 divide-y divide-stone-200 overflow-hidden rounded-md">
              {partnerMatches.map((match) => <li key={match.id}>
                <button type="button" className="w-full p-2 text-left text-sm hover:bg-stone-50"
                  onClick={() => { setSelectedPartner(match); setPartnerMatches([]); }}>
                  {match.displayName} · {match.code}
                </button>
              </li>)}
            </ul> : null}
          </fieldset>
          <div className="grid gap-5 sm:grid-cols-2">
            <label className="block text-sm font-medium">Suma s DPH (€)
              <input className={inputClass} type="text" name="amount" inputMode="decimal" pattern="\d{1,6}([.,]\d{1,2})?" required
                value={amount} onChange={(event) => {
                  const value = event.target.value;
                  const matchesAmountPattern = /^\d{1,6}(?:[.,]\d{1,2})?$/.test(value.trim());
                  const numericAmount = Number(value.trim().replace(",", "."));
                  event.currentTarget.setCustomValidity(
                    matchesAmountPattern && numericAmount <= 0 ? "Suma musí byť väčšia ako 0 €." : "",
                  );
                  setError("");
                  setAmount(value);
                }} />
            </label>
            <p className="text-sm text-stone-600">
              Sadzba pri pôvodnom zápise: {purchase.vatRatePercent} %. Úprava sumy použije túto historickú sadzbu. Bodový súčet sa počíta bez DPH.
            </p>
            <fieldset>
              <legend className="text-sm font-medium">Partner bol prítomný?</legend>
              <div className="mt-3 flex gap-4">
                <label className="flex items-center gap-2"><input type="radio" name="partnerPresent" value="yes" checked={present} onChange={() => setPresent(true)} /> Áno</label>
                <label className="flex items-center gap-2"><input type="radio" name="partnerPresent" value="no" checked={!present} onChange={() => setPresent(false)} /> Nie</label>
              </div>
            </fieldset>
            <label className="block text-sm font-medium">Dátum a čas
              <input className={inputClass} type="datetime-local" name="purchasedAt" required value={date} onChange={(event) => { setError(""); setDate(event.target.value); }} />
            </label>
            <label className="block text-sm font-medium">Interná poznámka
              <textarea className={inputClass} name="note" rows={2} maxLength={500} value={note} onChange={(event) => setNote(event.target.value)} />
            </label>
          </div>
          <label className="mt-5 block text-sm font-medium">Dôvod úpravy *
            <textarea ref={reasonRef} className={inputClass} name="reason" aria-invalid={deleteReasonInvalid || undefined}
              aria-describedby={deleteReasonInvalid ? "purchase-delete-reason-error" : undefined}
              rows={2} maxLength={255} required value={reason}
              onChange={(event) => { setDeleteReasonInvalid(false); setError(""); setReason(event.target.value); }} />
          </label>
          {deleteReasonInvalid ? <p id="purchase-delete-reason-error" role="alert" className="mt-2 text-sm text-red-700">
            Dôvod úpravy: zadajte dôvod pred zmazaním nákupu.
          </p> : null}
          {/^\d{1,6}(?:[.,]\d{1,2})?$/.test(amount.trim()) ? (() => {
            const preview = netAmountFromGross(amount.replace(",", "."), purchase.vatRatePercent);
            return <p className="mt-3 rounded-md border border-white/12 bg-white/5 p-3 text-sm">
              Bez DPH: <strong className="financial-value">{preview.netAmount} €</strong> · DPH: <span className="financial-value">{preview.vatAmount} €</span> · body: <strong className="financial-value text-base font-bold">{pointsForAmount(preview.netAmount)}</strong>
            </p>;
          })() : null}
          <div className="mt-4 flex flex-wrap gap-3">
            <button className={primaryButton} type="submit" disabled={pending}>{pending ? "Ukladám…" : "Uložiť zmeny"}</button>
            <button className={dangerButton} type="button" disabled={pending} onClick={() => void remove()}>
              Zmazať nákup
            </button>
            <Link className={secondaryButton} href="/app/nakupy">Späť na nákupy</Link>
          </div>
        </>
      )}
      {purchase.isDeleted ? <Link className={`${secondaryButton} mt-4`} href="/app/nakupy?includeDeleted=true">Späť na nákupy</Link> : null}
      {error && !deleteReasonInvalid ? <p role="alert" className="mt-4 text-sm text-red-700">{error}</p> : null}
    </ValidatedForm>
  );
}

const inputClass = "mt-2 block w-full rounded-md border border-stone-300 px-3 py-2";
const primaryButton = "min-h-11 rounded-lg bg-primary px-4 py-2.5 text-sm font-semibold text-primary-foreground hover:bg-primary/90 disabled:opacity-50";
const dangerButton = "min-h-11 rounded-lg border border-[color:var(--color-pink)]/45 bg-[color:var(--color-pink)]/10 px-4 py-2.5 text-sm font-semibold text-white disabled:opacity-50";
const secondaryButton = "inline-flex min-h-11 items-center rounded-lg border border-white/20 bg-white/5 px-4 py-2.5 text-sm font-semibold text-white hover:bg-white/10";
