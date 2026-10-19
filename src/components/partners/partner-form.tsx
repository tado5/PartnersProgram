"use client";

import { useRouter } from "next/navigation";
import { useState, type FormEvent } from "react";

import { refreshPartnerViews } from "@/app/app/partneri/actions";
import { useCompanyApi } from "@/components/company-context";
import { ValidatedForm } from "@/components/validated-form";
import { formatApiError } from "@/lib/validation-errors";
import { PrivacyReceiptFields, privacyPayload } from "./privacy-receipt-fields";

type PartnerValues = {
  type: "installer" | "company" | "referrer";
  displayName: string;
  phone: string | null;
  email: string | null;
  contactPerson: string | null;
  ico: string | null;
  internalNote: string | null;
};

type Duplicate = {
  id: string;
  code: string;
  displayName: string;
  matchesPhone: boolean;
  matchesIco: boolean;
};

type ApiResponse = {
  error?: { code?: string; message?: string; matches?: Duplicate[] };
};

export function PartnerForm({
  partner, privacyNotice,
}: {
  partner?: PartnerValues & { id: string; code: string };
  privacyNotice?: { id: string; version: number; url: string };
}) {
  const { companyFetch, companyId, selectionId } = useCompanyApi();
  const router = useRouter();
  const [error, setError] = useState("");
  const [duplicates, setDuplicates] = useState<Duplicate[]>([]);
  const [pendingPayload, setPendingPayload] = useState<Record<string, unknown> | null>(null);
  const [pending, setPending] = useState(false);

  async function save(payload: Record<string, unknown>, confirmDuplicates = false) {
    setPending(true);
    setError("");
    if (!confirmDuplicates) {
      setDuplicates([]);
      setPendingPayload(null);
    }
    const response = await companyFetch(
      partner ? `/api/partners/${partner.id}` : "/api/partners",
      {
        method: partner ? "PATCH" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...payload, ...(confirmDuplicates ? { confirmDuplicates: true } : {}) }),
      },
    );
    const body = (await response.json()) as ApiResponse & {
      partner?: { id: string };
    };
    if (!response.ok) {
      if (body.error?.code === "DUPLICATE_WARNING" && body.error.matches) {
        setDuplicates(body.error.matches);
        setPendingPayload(payload);
      } else {
        setError(formatApiError(body.error, "Partnera sa nepodarilo uložiť."));
      }
      setPending(false);
      return;
    }
    const refresh = await refreshPartnerViews(companyId, selectionId);
    if (refresh.error) {
      setError(refresh.error);
      setPending(false);
      return;
    }
    router.push(`/app/partneri/${body.partner?.id ?? partner?.id}`);
  }

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const data = new FormData(event.currentTarget);
    const payload: Record<string, unknown> = Object.fromEntries(data.entries());
    if (!partner && privacyNotice) {
      const privacy = privacyPayload(data, privacyNotice.id);
      if (!privacy) { setError("Vyplňte platný dátum a čas poskytnutia oznámenia."); return; }
      for (const field of ["privacyMethod", "privacyProvidedAt", "privacyConfirmed", "privacyReason"]) delete payload[field];
      payload.privacy = privacy;
    }
    if (partner) {
      for (const field of ["phone", "email", "contactPerson", "ico", "internalNote"]) {
        if (payload[field] === "") payload[field] = null;
      }
    }
    void save(payload);
  }

  return (
    <ValidatedForm className="data-surface space-y-5 rounded-xl p-5 sm:p-7" onSubmit={submit}>
      {partner ? (
        <div className="rounded-md bg-stone-50 px-4 py-3 text-sm text-stone-700">
          Kód partnera: <strong>{partner.code}</strong> (nemeniteľný)
        </div>
      ) : null}
      {!partner && privacyNotice ? <PrivacyReceiptFields version={privacyNotice.version} noticeUrl={privacyNotice.url} /> : null}
      <div className="grid gap-5 sm:grid-cols-2">
        <label className="block text-sm font-medium text-stone-700">
          Typ partnera *
          <select
            className="mt-1.5 block w-full rounded-md border border-stone-300 bg-white px-3 py-2"
            defaultValue={partner?.type ?? "installer"}
            name="type"
            required
          >
            <option value="installer">Montážnik</option>
            <option value="company">Firma</option>
            <option value="referrer">Odporúčateľ</option>
          </select>
        </label>
        <label className="block text-sm font-medium text-stone-700">
          Zobrazované meno *
          <input
            className="mt-1.5 block w-full rounded-md border border-stone-300 px-3 py-2"
            defaultValue={partner?.displayName}
            maxLength={100}
            minLength={2}
            name="displayName"
            required
          />
          <span className="mt-1 block text-xs font-normal text-stone-500">
            Toto meno sa zobrazí na partnerskej karte.
          </span>
        </label>
        <label className="block text-sm font-medium text-stone-700">
          Telefón
          <input
            className="mt-1.5 block w-full rounded-md border border-stone-300 px-3 py-2"
            defaultValue={partner?.phone ?? ""}
            maxLength={40}
            name="phone"
            placeholder="+421 903 123 456"
            type="tel"
          />
        </label>
        <label className="block text-sm font-medium text-stone-700">
          E-mail
          <input
            className="mt-1.5 block w-full rounded-md border border-stone-300 px-3 py-2"
            defaultValue={partner?.email ?? ""}
            maxLength={191}
            name="email"
            type="email"
          />
        </label>
        <label className="block text-sm font-medium text-stone-700">
          Kontaktná osoba
          <input
            className="mt-1.5 block w-full rounded-md border border-stone-300 px-3 py-2"
            defaultValue={partner?.contactPerson ?? ""}
            maxLength={100}
            name="contactPerson"
          />
        </label>
        <label className="block text-sm font-medium text-stone-700">
          IČO {partner?.type === "company" || !partner ? "(pri firme odporúčané)" : ""}
          <input
            className="mt-1.5 block w-full rounded-md border border-stone-300 px-3 py-2"
            defaultValue={partner?.ico ?? ""}
            inputMode="numeric"
            maxLength={8}
            name="ico"
            pattern="\d{8}"
            title="IČO musí mať 8 číslic."
          />
        </label>
      </div>
      <label className="block text-sm font-medium text-stone-700">
        Interná poznámka
        <textarea
          className="mt-1.5 block w-full rounded-md border border-stone-300 px-3 py-2"
          defaultValue={partner?.internalNote ?? ""}
          maxLength={1000}
          name="internalNote"
          rows={4}
        />
      </label>
      {error ? <p role="alert" aria-live="polite" className="text-sm text-red-700">{error}</p> : null}
      {duplicates.length ? (
        <div className="rounded-lg border border-amber-300 bg-amber-50 p-4">
          <p className="font-medium text-amber-950">
            Našli sa podobné záznamy. Skontrolujte, či nejde o duplicitného partnera:
          </p>
          <ul className="mt-2 list-inside list-disc text-sm text-amber-950">
            {duplicates.map((duplicate) => (
              <li key={duplicate.id}>
                {duplicate.displayName} ({duplicate.code}) —{" "}
                {[
                  duplicate.matchesPhone ? "telefón" : "",
                  duplicate.matchesIco ? "IČO" : "",
                ].filter(Boolean).join(", ")}
              </li>
            ))}
          </ul>
          <button
            className="mt-4 rounded-md bg-amber-900 px-4 py-2 text-sm font-semibold text-white hover:bg-amber-800 disabled:opacity-50"
            disabled={pending || !pendingPayload}
            onClick={() => pendingPayload && void save(pendingPayload, true)}
            type="button"
          >
            Napriek tomu pokračovať
          </button>
        </div>
      ) : null}
      <div className="flex flex-wrap gap-3">
        <button
          className="rounded-md bg-stone-950 px-4 py-2.5 text-sm font-semibold text-white hover:bg-stone-800 disabled:opacity-50"
          disabled={pending}
          type="submit"
        >
          {pending ? "Ukladám…" : partner ? "Uložiť zmeny" : "Vytvoriť partnera"}
        </button>
        <button
          className="rounded-md border border-stone-300 px-4 py-2.5 text-sm font-medium text-stone-700 hover:bg-stone-100"
          onClick={() => router.back()}
          type="button"
        >
          Zrušiť
        </button>
      </div>
    </ValidatedForm>
  );
}
