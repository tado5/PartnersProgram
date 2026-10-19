"use client";

import Link from "next/link";
import { useState, type SubmitEvent } from "react";

import { refreshPartnerViews } from "@/app/app/partneri/actions";
import { useCompanyApi } from "@/components/company-context";
import { ValidatedForm } from "@/components/validated-form";
import { formatApiError } from "@/lib/validation-errors";

type Partner = {
  id: string;
  code: string;
  type: "installer" | "company" | "referrer";
  displayName: string;
  phone: string | null;
  email: string | null;
  contactPerson: string | null;
  ico: string | null;
  internalNote: string | null;
  isActive: boolean;
  deactivatedAt: string | null;
  createdAt: string;
  updatedAt: string;
};

const typeLabels = {
  installer: "Montážnik",
  company: "Firma",
  referrer: "Odporúčateľ",
} as const;

export function PartnerDetails({ partner }: { partner: Partner }) {
  const { companyFetch, companyId, selectionId } = useCompanyApi();
  const [reason, setReason] = useState("");
  const [error, setError] = useState("");
  const [pending, setPending] = useState(false);

  async function changeStatus(action: "activate" | "deactivate") {
    setPending(true);
    setError("");
    try {
      const response = await companyFetch(`/api/partners/${partner.id}/${action}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        ...(action === "deactivate"
          ? { body: JSON.stringify({ reason: reason.trim() }) }
          : {}),
      });
      const body = await response.json();
      if (!response.ok) {
        setError(formatApiError(body.error, "Stav partnera sa nepodarilo zmeniť."));
        return;
      }
      const refresh = await refreshPartnerViews(companyId, selectionId);
      if (refresh.error) {
        setError(refresh.error);
        return;
      }
      setReason("");
    } catch {
      setError("Požiadavku sa nepodarilo dokončiť. Skontrolujte pripojenie.");
    } finally {
      setPending(false);
    }
  }

  function submitDeactivation(event: SubmitEvent<HTMLFormElement>) {
    event.preventDefault();
    void changeStatus("deactivate");
  }

  return (
    <section>
      <div className="mb-6">
        <Link className="text-sm font-medium text-white/90 underline decoration-primary/50 underline-offset-4 hover:text-white" href="/app/partneri">
          ← Späť na partnerov
        </Link>
        <div className="mt-4 flex flex-wrap items-start justify-between gap-4">
          <div>
            <p className="text-xs font-semibold tracking-[0.14em] text-white/85">
              {partner.code} · {typeLabels[partner.type]}
            </p>
            <h1 className="mt-2 text-3xl font-bold tracking-tight text-white sm:text-4xl">
              {partner.displayName}
            </h1>
            <span
              className={`mt-3 inline-flex rounded-full px-2.5 py-1 text-xs ${
                partner.isActive
                  ? "bg-emerald-50 text-emerald-800"
                  : "bg-red-50 text-red-800"
              }`}
            >
              {partner.isActive ? "Aktívny" : "Neaktívny"}
            </span>
          </div>
          <Link
            className="min-h-11 rounded-lg border border-white/20 bg-white/5 px-4 py-2.5 text-sm font-medium text-white hover:bg-white/10"
            href={`/app/partneri/${partner.id}/upravit`}
          >
            Upraviť údaje
          </Link>
        </div>
      </div>

      <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_20rem]">
        <section className="data-surface rounded-xl p-5">
          <h2 className="text-xl font-semibold text-white">Kontaktné údaje</h2>
          <dl className="mt-4 grid gap-4 sm:grid-cols-2">
            <Detail label="Telefón" value={partner.phone} />
            <Detail label="E-mail" value={partner.email} />
            <Detail label="Kontaktná osoba" value={partner.contactPerson} />
            <Detail label="IČO" value={partner.ico} />
          </dl>
          <div className="mt-5 border-t border-stone-200 pt-4">
            <h3 className="text-sm font-medium text-stone-700">Interná poznámka</h3>
            <p className="mt-1 whitespace-pre-wrap text-sm text-stone-600">
              {partner.internalNote || "Bez poznámky"}
            </p>
          </div>
          <p className="mt-5 text-xs text-stone-500">
            Vytvorené {formatDate(partner.createdAt)} · Upravené {formatDate(partner.updatedAt)}
          </p>
        </section>

        <aside className="glass-surface h-fit rounded-xl p-5">
          <h2 className="text-xl font-semibold text-white">Stav partnera</h2>
          <p className="mt-2 text-sm leading-6 text-stone-600">
            {partner.isActive
              ? "Deaktivovaný partner sa nezobrazí predavačom a jeho karta nebude použiteľná."
              : "Aktiváciou sa partner opäť sprístupní predavačom."}
          </p>
          {partner.isActive ? (
            <ValidatedForm className="mt-4 space-y-3" onSubmit={submitDeactivation}>
              <label className="block text-sm font-medium text-stone-700">
                Dôvod deaktivácie *
                <textarea
                  className="mt-1.5 block w-full rounded-md border border-stone-300 px-3 py-2"
                  maxLength={255}
                  name="reason"
                  onChange={(event) => { setError(""); setReason(event.target.value); }}
                  required
                  value={reason}
                  rows={3}
                />
              </label>
              <button
                className="w-full rounded-lg border border-[color:var(--color-pink)]/45 bg-[color:var(--color-pink)]/10 px-4 py-2.5 text-sm font-semibold text-white hover:bg-[color:var(--color-pink)]/20 disabled:opacity-50"
                disabled={pending}
                type="submit"
              >
                Deaktivovať partnera
              </button>
              {error ? <p aria-live="polite" className="text-sm text-red-700">{error}</p> : null}
            </ValidatedForm>
          ) : (
            <button
              className="mt-4 w-full rounded-lg bg-primary px-4 py-2.5 text-sm font-semibold text-primary-foreground hover:bg-primary/90 disabled:opacity-50"
              disabled={pending}
              onClick={() => void changeStatus("activate")}
              type="button"
            >
              Aktivovať partnera
            </button>
          )}
          {!partner.isActive && error ? <p aria-live="polite" className="mt-3 text-sm text-red-700">{error}</p> : null}
        </aside>
      </div>
    </section>
  );
}

function Detail({ label, value }: { label: string; value: string | null }) {
  return (
    <div>
      <dt className="text-xs font-medium uppercase tracking-wide text-stone-500">{label}</dt>
      <dd className="mt-1 break-words text-sm text-stone-900">{value || "—"}</dd>
    </div>
  );
}

function formatDate(value: string) {
  return new Intl.DateTimeFormat("sk-SK", {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(new Date(value));
}
