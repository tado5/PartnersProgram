"use client";

import Link from "next/link";
import { useState } from "react";

import { refreshPartnerViews } from "@/app/app/partneri/actions";
import { useCompanyApi } from "@/components/company-context";

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
    const response = await companyFetch(`/api/partners/${partner.id}/${action}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      ...(action === "deactivate"
        ? { body: JSON.stringify({ reason }) }
        : {}),
    });
    if (!response.ok) {
      const body = (await response.json()) as { error?: { message?: string } };
      setError(body.error?.message ?? "Stav partnera sa nepodarilo zmeniť.");
      setPending(false);
      return;
    }
    const refresh = await refreshPartnerViews(companyId, selectionId);
    if (refresh.error) {
      setError(refresh.error);
      setPending(false);
      return;
    }
    setReason("");
    setPending(false);
  }

  return (
    <section>
      <div className="mb-6">
        <Link className="text-sm font-medium text-amber-800 hover:text-amber-950" href="/app/partneri">
          ← Späť na partnerov
        </Link>
        <div className="mt-4 flex flex-wrap items-start justify-between gap-4">
          <div>
            <p className="text-sm font-semibold uppercase tracking-[0.16em] text-amber-800">
              {partner.code} · {typeLabels[partner.type]}
            </p>
            <h1 className="mt-2 text-3xl font-semibold tracking-tight text-stone-950">
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
            className="rounded-md border border-stone-300 px-4 py-2.5 text-sm font-medium text-stone-700 hover:bg-stone-100"
            href={`/app/partneri/${partner.id}/upravit`}
          >
            Upraviť údaje
          </Link>
        </div>
      </div>

      <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_20rem]">
        <section className="rounded-xl border border-stone-200 bg-white p-5">
          <h2 className="text-lg font-semibold text-stone-950">Kontaktné údaje</h2>
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

        <aside className="h-fit rounded-xl border border-stone-200 bg-white p-5">
          <h2 className="text-lg font-semibold text-stone-950">Stav partnera</h2>
          <p className="mt-2 text-sm leading-6 text-stone-600">
            {partner.isActive
              ? "Deaktivovaný partner sa nezobrazí predavačom a jeho karta nebude použiteľná."
              : "Aktiváciou sa partner opäť sprístupní predavačom."}
          </p>
          {partner.isActive ? (
            <div className="mt-4 space-y-3">
              <label className="block text-sm font-medium text-stone-700">
                Dôvod deaktivácie *
                <textarea
                  className="mt-1.5 block w-full rounded-md border border-stone-300 px-3 py-2"
                  maxLength={255}
                  onChange={(event) => setReason(event.target.value)}
                  required
                  value={reason}
                  rows={3}
                />
              </label>
              <button
                className="w-full rounded-md border border-red-300 px-4 py-2.5 text-sm font-semibold text-red-800 hover:bg-red-50 disabled:opacity-50"
                disabled={pending || !reason.trim()}
                onClick={() => void changeStatus("deactivate")}
                type="button"
              >
                Deaktivovať partnera
              </button>
            </div>
          ) : (
            <button
              className="mt-4 w-full rounded-md bg-stone-950 px-4 py-2.5 text-sm font-semibold text-white hover:bg-stone-800 disabled:opacity-50"
              disabled={pending}
              onClick={() => void changeStatus("activate")}
              type="button"
            >
              Aktivovať partnera
            </button>
          )}
          {error ? <p aria-live="polite" className="mt-3 text-sm text-red-700">{error}</p> : null}
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
