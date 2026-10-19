"use client";

import { useState, type SubmitEvent } from "react";
import { ValidatedForm } from "@/components/validated-form";
import { formatApiError } from "@/lib/validation-errors";

const inputClass = "mt-2 block w-full rounded-md border border-stone-300 px-3 py-2";
const buttonClass = "rounded-md bg-stone-950 px-4 py-2 text-sm font-semibold text-white disabled:opacity-50";

export function CompanyForm({ company }: {
  company?: { id: string; name: string; ico: string | null };
}) {
  const [error, setError] = useState("");
  const [pending, setPending] = useState(false);
  async function submit(event: SubmitEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");
    setPending(true);
    const values = new FormData(event.currentTarget);
    const ico = String(values.get("ico") ?? "").trim();
    try {
      const response = await fetch(company ? `/api/superadmin/companies/${company.id}` : "/api/superadmin/companies", {
        method: company ? "PATCH" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: values.get("name"), ico: ico || (company ? null : undefined),
          ...(!company ? { slug: values.get("slug"), admin: {
            name: values.get("admin.name"), email: values.get("admin.email"),
            temporaryPassword: values.get("admin.temporaryPassword"),
          } } : {}),
        }),
      });
      const body = await response.json();
      if (!response.ok) setError(formatApiError(body.error, "Firmu sa nepodarilo uložiť."));
      else window.location.replace(`/superadmin/firmy/${body.company.id}`);
    } catch {
      setError("Požiadavku sa nepodarilo dokončiť.");
    } finally {
      setPending(false);
    }
  }
  return (
    <ValidatedForm onSubmit={submit} className="max-w-xl space-y-5">
      <label className="block text-sm">Názov firmy
        <input className={inputClass} name="name" onChange={() => setError("")}
          required minLength={2} maxLength={100} defaultValue={company?.name} />
      </label>
      {!company ? <label className="block text-sm">Slug (nemenný)
        <input className={inputClass} name="slug" onChange={() => setError("")}
          required maxLength={80} pattern="[a-z0-9]+(-[a-z0-9]+)*" />
      </label> : null}
      <label className="block text-sm">IČO (nepovinné)
        <input className={inputClass} name="ico" onChange={() => setError("")}
          pattern="[0-9]{8}" maxLength={8} defaultValue={company?.ico ?? ""} />
      </label>
      {!company ? <fieldset className="space-y-5 border-t border-stone-200 pt-5">
        <legend className="font-semibold">Prvý admin</legend>
        <label className="block text-sm">Meno
          <input className={inputClass} name="admin.name" onChange={() => setError("")}
            required minLength={2} maxLength={150} />
        </label>
        <label className="block text-sm">E-mail
          <input className={inputClass} name="admin.email" onChange={() => setError("")}
            type="email" required />
        </label>
        <label className="block text-sm">Dočasné heslo
          <input className={inputClass} name="admin.temporaryPassword" onChange={() => setError("")}
            type="password" autoComplete="new-password" required minLength={10} maxLength={128} />
        </label>
      </fieldset> : null}
      {error ? <p role="alert" className="text-sm text-red-700">{error}</p> : null}
      <button className={buttonClass} type="submit" disabled={pending}>{pending ? "Ukladám…" : "Uložiť"}</button>
    </ValidatedForm>
  );
}

export function CompanyControls({ companyId, isActive }: { companyId: string; isActive: boolean }) {
  const [reason, setReason] = useState("");
  const [error, setError] = useState("");
  const [pending, setPending] = useState(false);
  async function perform(action: "select" | "activate" | "deactivate") {
    setPending(true);
    setError("");
    try {
      const response = await fetch(
        action === "select" ? "/api/superadmin/company-context" : `/api/superadmin/companies/${companyId}/${action}`,
        { method: "POST", headers: { "Content-Type": "application/json" },
          body: JSON.stringify(action === "select" ? { companyId } : action === "deactivate" ? { reason: reason.trim() } : {}) },
      );
      const body = await response.json();
      if (!response.ok) {
        setError(formatApiError(body.error, "Operácia zlyhala."));
        return;
      }
      if (action === "select") {
        // A document navigation discards Router Cache, forms and one-time issued tokens.
        try { localStorage.setItem("company-context-change", crypto.randomUUID()); } catch {}
        window.location.replace("/app");
      } else window.location.reload();
    } catch {
      setError("Požiadavku sa nepodarilo dokončiť.");
    } finally {
      setPending(false);
    }
  }
  function submitDeactivation(event: SubmitEvent<HTMLFormElement>) {
    event.preventDefault();
    void perform("deactivate");
  }
  return <div className="my-6 space-y-4">
    <button className={buttonClass} type="button" disabled={pending} onClick={() => void perform("select")}>
      {pending ? "Otváram program firmy…" : "Otvoriť program firmy"}
    </button>
    <div className="flex flex-wrap gap-3">
      {isActive ? <ValidatedForm className="flex flex-wrap gap-3" onSubmit={submitDeactivation}>
        <input className="rounded-md border px-3 py-2" name="reason" aria-label="Dôvod deaktivácie"
          placeholder="Povinný dôvod deaktivácie" maxLength={255} required
          value={reason} onChange={(event) => { setError(""); setReason(event.target.value); }} />
        <button className="rounded-md border px-4 py-2 text-sm" type="submit" disabled={pending}>Deaktivovať firmu</button>
      </ValidatedForm> : <button className="rounded-md border px-4 py-2 text-sm" type="button" disabled={pending}
        onClick={() => void perform("activate")}>Aktivovať firmu</button>}
    </div>
    {error ? <p role="alert" className="text-sm text-red-700">{error}</p> : null}
  </div>;
}

export function ClearCompanyContext() {
  const [error, setError] = useState("");
  async function clear() {
    try {
      const response = await fetch("/api/superadmin/company-context", { method: "DELETE" });
      if (!response.ok) { setError("Kontext sa nepodarilo ukončiť."); return; }
      try { localStorage.setItem("company-context-change", crypto.randomUUID()); } catch {}
      window.location.reload();
    } catch { setError("Požiadavku sa nepodarilo dokončiť."); }
  }

  return <><button className="text-sm underline" type="button" onClick={() => void clear()}>Ukončiť firemný kontext</button>
    {error ? <p role="alert">{error}</p> : null}</>;
}
