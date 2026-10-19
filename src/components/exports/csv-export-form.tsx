"use client";

import { FileDown, Loader2 } from "lucide-react";
import { useState, type FormEvent, type ReactNode } from "react";

import { useCompanyApi } from "@/components/company-context";
import { ValidatedForm } from "@/components/validated-form";
import { formatApiError } from "@/lib/validation-errors";

export type CsvExportKind = "partners" | "purchases" | "monthly" | "audit-logs";

export function CsvExportForm({
  kind, query = "", children, label = "Stiahnuť CSV",
}: {
  kind: CsvExportKind;
  query?: string;
  children?: ReactNode;
  label?: string;
}) {
  const { companyFetch } = useCompanyApi();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  async function download(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const params = new URLSearchParams(query);
    for (const [key, value] of new FormData(event.currentTarget)) {
      if (typeof value === "string") params.set(key, value);
    }
    params.delete("page");
    setBusy(true);
    setError("");
    try {
      const response = await companyFetch(`/api/exports/${kind}.csv?${params}`);
      if (!response.ok) {
        const body: unknown = await response.json();
        setError(formatApiError(
          body && typeof body === "object" && "error" in body ? body.error : undefined,
          "Export sa nepodarilo vytvoriť.",
        ));
        return;
      }
      const blob = await response.blob();
      const fileName = /filename="([^"]+)"/.exec(response.headers.get("Content-Disposition") ?? "")?.[1] ?? `${kind}.csv`;
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = fileName;
      document.body.append(link);
      link.click();
      link.remove();
      setTimeout(() => URL.revokeObjectURL(url), 10_000);
    } catch {
      setError("CSV sa nepodarilo stiahnuť. Skontrolujte pripojenie a skúste znova.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <ValidatedForm maxRangeDays={kind === "monthly" ? 366 : undefined} onSubmit={(event) => void download(event)} className="flex min-w-0 flex-col items-start gap-3">
      {children}
      <button
        type="submit"
        disabled={busy}
        className="inline-flex min-h-11 items-center gap-2 rounded-md border border-stone-300 bg-white px-4 py-2 text-sm font-semibold text-stone-800 hover:bg-stone-50 disabled:opacity-60"
      >
        {busy ? <Loader2 aria-hidden className="size-4 animate-spin" /> : <FileDown aria-hidden className="size-4" />}
        {busy ? "Pripravujem CSV…" : label}
      </button>
      {error ? <p role="alert" className="text-sm text-red-700">{error}</p> : null}
    </ValidatedForm>
  );
}
