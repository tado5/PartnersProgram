"use client";

import { ChevronRight, Search } from "lucide-react";
import Link from "next/link";
import { useEffect, useState } from "react";

import { useCompanyApi } from "@/components/company-context";
import { PartnerTypeBadge, type PartnerTypeValue } from "@/components/partners/partner-type-badge";

type PartnerMatch = {
  id: string;
  code: string;
  displayName: string;
  phone: string | null;
  type: PartnerTypeValue;
};

type SearchState = {
  key: string;
  items: PartnerMatch[];
  page: number;
  total: number;
  error: string;
};

export function PartnerPicker() {
  const { companyFetch } = useCompanyApi();
  const [query, setQuery] = useState("");
  const [debounced, setDebounced] = useState("");
  const [state, setState] = useState<SearchState | null>(null);
  const [loadingMore, setLoadingMore] = useState(false);

  useEffect(() => {
    const timer = window.setTimeout(() => setDebounced(query.trim()), 250);
    return () => window.clearTimeout(timer);
  }, [query]);

  useEffect(() => {
    const controller = new AbortController();
    void fetchPage(debounced, 1, controller.signal).then((result) => {
      if (result) setState({ key: debounced, ...result, page: 1 });
    });
    return () => controller.abort();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [debounced]);

  async function fetchPage(q: string, page: number, signal?: AbortSignal) {
    const params = new URLSearchParams({ active: "true", page: String(page) });
    if (q) params.set("q", q);
    try {
      const response = await companyFetch(`/api/partners?${params}`, { cache: "no-store", signal });
      const body = await response.json();
      if (!response.ok) return { items: [], total: 0, error: body.error?.message ?? "Vyhľadávanie zlyhalo." };
      return { items: body.items as PartnerMatch[], total: body.total as number, error: "" };
    } catch {
      if (signal?.aborted) return null;
      return { items: [], total: 0, error: "Vyhľadávanie zlyhalo. Skontrolujte pripojenie." };
    }
  }

  async function loadMore() {
    if (!state) return;
    setLoadingMore(true);
    const next = state.page + 1;
    const result = await fetchPage(state.key, next);
    setLoadingMore(false);
    if (!result) return;
    setState((current) => current && current.key === state.key
      ? { ...current, items: [...current.items, ...result.items], page: next, total: result.total, error: result.error }
      : current);
  }

  const loading = !state || state.key !== query.trim();

  return (
    <div>
      <label className="block text-sm font-medium text-stone-700" htmlFor="partner-picker-search">
        Vyhľadať partnera
      </label>
      <div className="relative mt-1.5">
        <Search aria-hidden className="pointer-events-none absolute left-3 top-1/2 size-5 -translate-y-1/2 text-stone-400" />
        <input
          autoComplete="off"
          autoFocus
          className="block min-h-12 w-full rounded-lg border border-stone-300 bg-white py-3 pl-11 pr-3 text-base"
          id="partner-picker-search"
          onChange={(event) => setQuery(event.target.value)}
          placeholder="Meno, telefón, IČO alebo kód"
          type="search"
          value={query}
        />
      </div>

      {state?.error ? <p className="mt-3 text-sm text-red-700" role="alert">{state.error}</p> : null}

      <p aria-live="polite" className="mt-3 text-sm text-stone-500">
        {loading ? "Hľadám…" : state && !state.error
          ? state.total ? `Nájdených ${state.total} aktívnych partnerov` : "Partner sa nenašiel."
          : null}
      </p>

      {state?.items.length ? (
        <ul className={`mt-2 divide-y divide-stone-200 overflow-hidden rounded-xl border border-stone-200 bg-white ${loading ? "opacity-60" : ""}`}>
          {state.items.map((partner) => (
            <li key={partner.id}>
              <Link
                className="flex min-h-14 items-center gap-3 px-4 py-3 hover:bg-amber-50"
                href={`/app/nakupy/novy?partner=${encodeURIComponent(partner.id)}&source=manual`}
              >
                <span className="min-w-0 flex-1">
                  <span className="block truncate font-semibold text-stone-950">{partner.displayName}</span>
                  <span className="mt-0.5 flex flex-wrap items-center gap-x-2 gap-y-1 text-sm text-stone-500">
                    <span className="font-mono">{partner.code}</span>
                    {partner.phone ? <span>{partner.phone}</span> : null}
                    <PartnerTypeBadge type={partner.type} />
                  </span>
                </span>
                <span className="hidden text-sm font-semibold text-amber-800 sm:inline">Zapísať nákup</span>
                <ChevronRight aria-hidden className="size-5 shrink-0 text-stone-400" />
              </Link>
            </li>
          ))}
        </ul>
      ) : null}

      {state && !loading && state.items.length < state.total ? (
        <button
          className="mt-3 rounded-md border border-stone-300 bg-white px-4 py-2 text-sm font-semibold text-stone-700 hover:bg-stone-100 disabled:opacity-50"
          disabled={loadingMore}
          onClick={() => void loadMore()}
          type="button"
        >
          {loadingMore ? "Načítavam…" : `Zobraziť ďalších (${state.total - state.items.length})`}
        </button>
      ) : null}
    </div>
  );
}
