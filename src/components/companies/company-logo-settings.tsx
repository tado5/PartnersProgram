"use client";

import { useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import Image from "next/image";

import { useCompanyApi } from "@/components/company-context";

export function CompanyLogoSettings({ logoUrl, companyName, readOnly }: {
  logoUrl: string | null; companyName: string; readOnly: boolean;
}) {
  const router = useRouter();
  const { companyFetch } = useCompanyApi();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");

  async function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    await change("PUT", new FormData(event.currentTarget));
  }

  async function change(method: "PUT" | "DELETE", body?: FormData) {
    setBusy(true);
    setError("");
    setMessage("");
    try {
      const response = await companyFetch("/api/company/logo", { method, body });
      if (!response.ok) {
        const result = await response.json();
        setError(result.error?.message ?? "Logo sa nepodarilo uložiť.");
        return;
      }
      setMessage(method === "DELETE" ? "Logo bolo odstránené." : "Logo bolo uložené.");
      router.refresh();
    } catch {
      setError("Požiadavku sa nepodarilo dokončiť. Skontrolujte pripojenie.");
    } finally {
      setBusy(false);
    }
  }

  return <section className="mb-6 max-w-2xl rounded-xl border border-stone-200 bg-white p-5">
    <h2 className="text-xl font-semibold">Logo firmy</h2>
    <p className="mt-2 text-sm leading-6 text-stone-600">
      Zobrazuje sa v menu, verejnej partnerskej karte a PDF reporte.
      PNG, JPG alebo WebP, najviac 2 MB. Obrázok sa zmenší na najviac 512 × 256 px.
      Bez loga sa zobrazuje názov firmy.
    </p>
    <div className="my-4 flex min-h-20 items-center rounded-lg border border-stone-200 bg-stone-50 p-4">
      {logoUrl ? <Image unoptimized src={logoUrl} width={192} height={64} alt={`Logo ${companyName}`}
        className="h-16 w-full max-w-48 object-contain object-left" /> : <strong className="break-words">{companyName}</strong>}
    </div>
    {!readOnly ? <form onSubmit={(event) => void save(event)} className="space-y-3">
      <label className="block text-sm font-medium">Vybrať logo
        <input className="mt-2 block w-full min-w-0 text-sm file:mr-3 file:rounded-md file:border file:border-stone-300 file:bg-white file:px-3 file:py-2"
          type="file" name="file" accept="image/png,image/jpeg,image/webp" required disabled={busy} />
      </label>
      <div className="flex flex-wrap gap-3">
        <button disabled={busy} className="min-h-11 rounded-md bg-stone-950 px-4 py-2 text-sm font-semibold text-white disabled:opacity-60">
          {busy ? "Ukladám…" : "Nahrať logo"}
        </button>
        {logoUrl ? <button type="button" disabled={busy} onClick={() => void change("DELETE")}
          className="min-h-11 rounded-md border border-red-300 px-4 py-2 text-sm font-semibold text-red-800 disabled:opacity-60">Odstrániť logo</button> : null}
      </div>
    </form> : null}
    {error ? <p role="alert" className="mt-3 text-sm text-red-700">{error}</p> : null}
    {message ? <p role="status" className="mt-3 text-sm text-emerald-800">{message}</p> : null}
  </section>;
}
