"use client";

import { useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import Image from "next/image";
import { FileImage, Upload } from "lucide-react";

import { useCompanyApi } from "@/components/company-context";
import { ActionLabel } from "@/components/action-label";
import { ValidatedForm } from "@/components/validated-form";
import { formatApiError } from "@/lib/validation-errors";

export function CompanyLogoSettings({ logoUrl, companyName, readOnly }: {
  logoUrl: string | null; companyName: string; readOnly: boolean;
}) {
  const router = useRouter();
  const { companyFetch } = useCompanyApi();
  const [action, setAction] = useState<"PUT" | "DELETE" | null>(null);
  const busy = action !== null;
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [selectedFile, setSelectedFile] = useState<{ name: string; size: number } | null>(null);

  async function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    await change("PUT", new FormData(event.currentTarget));
  }

  async function change(method: "PUT" | "DELETE", body?: FormData) {
    if (busy) return;
    setAction(method);
    setError("");
    setMessage("");
    try {
      const response = await companyFetch("/api/company/logo", { method, body });
      if (!response.ok) {
        const result = await response.json();
        setError(formatApiError(result.error, "Logo sa nepodarilo uložiť."));
        return;
      }
      setMessage(method === "DELETE" ? "Logo bolo odstránené." : "Logo bolo uložené.");
      router.refresh();
    } catch {
      setError("Požiadavku sa nepodarilo dokončiť. Skontrolujte pripojenie.");
    } finally {
      setAction(null);
    }
  }

  return <section className="data-surface mb-6 max-w-2xl rounded-xl p-5">
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
    {!readOnly ? <ValidatedForm aria-busy={busy} onSubmit={(event) => void save(event)} className="space-y-3">
      <label data-validation-control className={`relative flex min-h-36 min-w-0 flex-col items-center justify-center gap-3 rounded-xl border border-dashed border-primary/50 bg-primary/5 p-5 text-center transition-colors focus-within:outline-2 focus-within:outline-offset-4 focus-within:outline-primary ${busy ? "opacity-60" : "cursor-pointer hover:border-primary hover:bg-primary/10"}`}>
        <input className="absolute inset-0 h-full w-full cursor-pointer rounded-xl opacity-0 disabled:cursor-not-allowed"
          aria-label="Vybrať logo" aria-describedby="company-logo-file-help"
          type="file" name="file" accept="image/png,image/jpeg,image/webp" required disabled={busy}
          onChange={(event) => {
            const file = event.target.files?.[0];
            setSelectedFile(file ? { name: file.name, size: file.size } : null);
            setError("");
            setMessage("");
          }} />
        <span className="flex size-11 items-center justify-center rounded-xl bg-primary/15 text-primary">
          {selectedFile ? <FileImage aria-hidden className="size-6" /> : <Upload aria-hidden className="size-6" />}
        </span>
        <span className="block max-w-full min-w-0">
          <span className="block break-all text-sm font-semibold text-white">
            {selectedFile ? selectedFile.name : "Vybrať logo firmy"}
          </span>
          <span id="company-logo-file-help" className="mt-1 block text-xs text-white/65">
            {selectedFile
              ? `${new Intl.NumberFormat("sk-SK", { maximumFractionDigits: 1 }).format(selectedFile.size / 1024)} kB · Kliknutím vyberiete iný súbor`
              : "Kliknite a vyberte obrázok · PNG, JPG alebo WebP do 2 MB"}
          </span>
        </span>
      </label>
      {selectedFile ? <p className="text-xs text-white/65">Súbor je vybraný. Zmenu uložíte tlačidlom „Nahrať logo“.</p> : null}
      <div className="flex flex-wrap gap-3">
        <button aria-busy={action === "PUT"} disabled={busy} className="min-h-11 rounded-md bg-stone-950 px-4 py-2 text-sm font-semibold text-white disabled:opacity-60">
          <ActionLabel busy={action === "PUT"} pending="Nahrávam logo…">Nahrať logo</ActionLabel>
        </button>
        {logoUrl ? <button type="button" aria-busy={action === "DELETE"} disabled={busy} onClick={() => void change("DELETE")}
          className="min-h-11 rounded-md border border-red-300 px-4 py-2 text-sm font-semibold text-red-800 disabled:opacity-60">
          <ActionLabel busy={action === "DELETE"} pending="Odstraňujem logo…">Odstrániť logo</ActionLabel></button> : null}
      </div>
    </ValidatedForm> : null}
    {error ? <p role="alert" className="mt-3 text-sm text-red-700">{error}</p> : null}
    {message ? <p role="status" className="mt-3 text-sm text-emerald-800">{message}</p> : null}
  </section>;
}
