"use client";

import { useState } from "react";
import { FileDown, Loader2 } from "lucide-react";

import { useCompanyApi } from "@/components/company-context";
import { formatApiError } from "@/lib/validation-errors";

export function ReportPdfButton({ query }: { query: string }) {
  const { companyFetch } = useCompanyApi();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  async function download() {
    setBusy(true);
    setError("");
    try {
      const response = await companyFetch(`/api/reports/pdf?${query}`);
      if (!response.ok) {
        const body = await response.json().catch(() => null) as { error?: { message?: string } } | null;
        setError(formatApiError(body?.error, "PDF sa nepodarilo vygenerovať."));
        return;
      }
      const blob = await response.blob();
      const fileName = /filename="([^"]+)"/.exec(response.headers.get("Content-Disposition") ?? "")?.[1] ?? "report.pdf";
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = fileName;
      document.body.append(link);
      link.click();
      link.remove();
      setTimeout(() => URL.revokeObjectURL(url), 10_000);
    } catch {
      setError("PDF sa nepodarilo stiahnuť. Skontrolujte pripojenie.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="flex flex-col items-start gap-1">
      <button
        type="button"
        onClick={() => void download()}
        disabled={busy}
        className="inline-flex min-h-11 items-center gap-2 rounded-md bg-stone-950 px-4 py-2 text-sm font-semibold text-white disabled:opacity-60"
      >
        {busy ? <Loader2 aria-hidden className="size-4 animate-spin" /> : <FileDown aria-hidden className="size-4" />}
        {busy ? "Generujem PDF…" : "Tlačiť / stiahnuť PDF"}
      </button>
      {error ? <p role="alert" className="text-sm text-red-700">{error}</p> : null}
    </div>
  );
}
