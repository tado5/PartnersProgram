"use client";

import Link from "next/link";
import { useCallback, useState } from "react";
import { useCompanyApi } from "@/components/company-context";
import { PartnerTypeBadge } from "@/components/partners/partner-type-badge";

type PartnerItem = {
  id: string;
  code: string;
  type: "installer" | "company" | "referrer";
  displayName: string;
  phone: string | null;
  isActive: boolean;
};

type ApiError = { error?: { message?: string } };

export function PartnerList({
  initialItems,
  initialTotal,
  role,
}: {
  initialItems: PartnerItem[];
  initialTotal: number;
  role: "admin" | "seller";
}) {
  const { companyFetch } = useCompanyApi();
  const [results, setResults] = useState<{
    source: PartnerItem[];
    items: PartnerItem[];
    page: number;
    total: number;
  } | null>(null);
  const [query, setQuery] = useState("");
  const [type, setType] = useState("");
  const [active, setActive] = useState("all");
  const [error, setError] = useState("");
  const [pending, setPending] = useState(false);
  const pageSize = 20;
  const currentResults = results?.source === initialItems ? results : null;
  const items = currentResults?.items ?? initialItems;
  const page = currentResults?.page ?? 1;
  const total = currentResults?.total ?? initialTotal;

  if (results && results.source !== initialItems) {
    setResults(null);
  }

  const load = useCallback(
    async (nextPage = 1) => {
      setPending(true);
      setError("");
      const params = new URLSearchParams({ page: String(nextPage), active });
      if (query.trim()) params.set("q", query.trim());
      if (type) params.set("type", type);
      const response = await companyFetch(`/api/partners?${params}`, { cache: "no-store" });
      if (!response.ok) {
        const body = (await response.json()) as ApiError;
        setError(body.error?.message ?? "Zoznam partnerov sa nepodarilo načítať.");
      } else {
        const body = (await response.json()) as {
          items: PartnerItem[];
          page: number;
          total: number;
        };
        setResults({
          source: initialItems,
          items: body.items,
          page: body.page,
          total: body.total,
        });
      }
      setPending(false);
    },
    [active, initialItems, query, type, companyFetch],
  );

  function submitSearch(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    void load(1);
  }

  return (
    <div>
      <div className="mb-6 flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="mt-3 text-3xl font-semibold tracking-tight text-stone-950">
            Správa partnerov
          </h1>
          <p className="mt-2 text-sm text-stone-600">
            Vyhľadávanie podľa kódu, mena, telefónu alebo IČO.
          </p>
        </div>
        {role === "admin" ? (
          <Link
            className="rounded-md bg-stone-950 px-4 py-2.5 text-sm font-semibold text-white hover:bg-stone-800"
            href="/app/partneri/novy"
          >
            Nový partner
          </Link>
        ) : null}
      </div>

      <form
        className="mb-5 grid gap-3 rounded-xl border border-stone-200 bg-white p-4 sm:grid-cols-[minmax(14rem,1fr)_auto_auto_auto]"
        onSubmit={submitSearch}
      >
        <label className="sr-only" htmlFor="partner-search">Vyhľadať partnera</label>
        <input
          className="rounded-md border border-stone-300 px-3 py-2 text-sm"
          id="partner-search"
          onChange={(event) => setQuery(event.target.value)}
          placeholder="Kód, meno, telefón alebo IČO"
          value={query}
        />
        <select
          aria-label="Typ partnera"
          className="rounded-md border border-stone-300 bg-white px-3 py-2 text-sm"
          onChange={(event) => setType(event.target.value)}
          value={type}
        >
          <option value="">Všetky typy</option>
          <option value="installer">Montážnik</option>
          <option value="company">Firma</option>
          <option value="referrer">Odporúčateľ</option>
        </select>
        {role === "admin" ? (
          <select
            aria-label="Stav partnera"
            className="rounded-md border border-stone-300 bg-white px-3 py-2 text-sm"
            onChange={(event) => setActive(event.target.value)}
            value={active}
          >
            <option value="all">Všetky stavy</option>
            <option value="true">Aktívni</option>
            <option value="false">Neaktívni</option>
          </select>
        ) : null}
        <button
          className="rounded-md border border-stone-300 px-4 py-2 text-sm font-medium hover:bg-stone-100 disabled:opacity-50"
          disabled={pending}
          type="submit"
        >
          Hľadať
        </button>
      </form>

      {error ? (
        <p aria-live="polite" className="mb-4 text-sm text-red-700">{error}</p>
      ) : null}
      <section className="overflow-hidden rounded-xl border border-stone-200 bg-white">
        {items.length ? (
          <div className="divide-y divide-stone-200">
            {items.map((partner) => (
              <div
                className={`flex flex-wrap items-center justify-between gap-3 px-5 py-4 ${role === "admin" ? "hover:bg-stone-50" : ""}`}
                key={partner.id}
              >
                <div>
                  <div className="flex flex-wrap items-center gap-2">
                    <h2 className="font-semibold text-stone-950">{partner.displayName}</h2>
                    <PartnerTypeBadge type={partner.type} />
                    <span
                      className={`rounded-full px-2.5 py-1 text-xs ${
                        partner.isActive
                          ? "bg-emerald-50 text-emerald-800"
                          : "bg-red-50 text-red-800"
                      }`}
                    >
                      {partner.isActive ? "Aktívny" : "Neaktívny"}
                    </span>
                  </div>
                  <p className="mt-1 text-sm text-stone-600">
                    {partner.code}{partner.phone ? ` · ${partner.phone}` : ""}
                  </p>
                </div>
                {role === "admin" ? (
                  <Link
                    className="text-sm font-medium text-amber-800 hover:text-amber-950"
                    href={`/app/partneri/${partner.id}`}
                  >
                    Detail →
                  </Link>
                ) : null}
              </div>
            ))}
          </div>
        ) : (
          <p className="px-5 py-8 text-center text-sm text-stone-600">
            {pending ? "Načítavam…" : "Nenašli sa žiadni partneri."}
          </p>
        )}
        <div className="flex items-center justify-between border-t border-stone-200 px-5 py-3 text-sm text-stone-600">
          <span>{total} partnerov</span>
          <div className="flex items-center gap-2">
            <button
              className="rounded border border-stone-300 px-3 py-1.5 disabled:opacity-40"
              disabled={pending || page <= 1}
              onClick={() => void load(page - 1)}
              type="button"
            >
              Predošlá
            </button>
            <span>{page} / {Math.max(1, Math.ceil(total / pageSize))}</span>
            <button
              className="rounded border border-stone-300 px-3 py-1.5 disabled:opacity-40"
              disabled={pending || page * pageSize >= total}
              onClick={() => void load(page + 1)}
              type="button"
            >
              Ďalšia
            </button>
          </div>
        </div>
      </section>
    </div>
  );
}
