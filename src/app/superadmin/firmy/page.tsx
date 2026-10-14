import { requireSuperadminPage } from "@/server/auth/superadmin";
import { CompanyError, listCompanies } from "@/server/companies";
import { DocumentLink } from "@/components/company-context";

export default async function CompaniesPage({ searchParams }: {
  searchParams: Promise<{ q?: string; active?: string; page?: string }>;
}) {
  await requireSuperadminPage();
  const filters = await searchParams;
  let result;
  try {
    result = await listCompanies({ q: filters.q, active: filters.active, page: Number(filters.page ?? 1) });
  } catch (error) {
    if (error instanceof CompanyError) return <p role="alert">{error.message}</p>;
    throw error;
  }
  const pageUrl = (page: number) => `/superadmin/firmy?${new URLSearchParams({
    q: filters.q ?? "", active: filters.active ?? "all", page: String(page),
  })}`;
  return <section>
    <div className="mb-6 flex items-center justify-between gap-4">
      <h1 className="text-3xl font-semibold">Firmy</h1>
      <DocumentLink href="/superadmin/firmy/nova" className="rounded-md bg-stone-950 px-4 py-2 text-sm text-white">Pridať firmu</DocumentLink>
    </div>
    <form className="mb-6 flex flex-wrap gap-3">
      <input className="rounded-md border px-3 py-2" name="q" aria-label="Vyhľadať firmu" placeholder="Názov, slug alebo IČO" defaultValue={filters.q} />
      <select className="rounded-md border px-3 py-2" name="active" aria-label="Stav firmy" defaultValue={filters.active ?? "all"}>
        <option value="all">Všetky stavy</option><option value="true">Aktívne</option><option value="false">Neaktívne</option>
      </select>
      <button className="rounded-md border px-4 py-2">Vyhľadať</button>
    </form>
    <div className="divide-y rounded-xl border bg-white px-5">
      {result.items.map((company) => <article key={company.id} className="flex flex-wrap items-center justify-between gap-4 py-5">
        <div><a href={`/superadmin/firmy/${company.id}`} className="font-semibold underline">{company.name}</a>
          <p className="mt-1 text-sm text-stone-600">{company.slug} · IČO {company.ico ?? "—"} · {company.isActive ? "Aktívna" : "Neaktívna"}</p>
          <p className="text-sm text-stone-600">{company.counts.users} používateľov · {company.counts.partners} partnerov</p>
        </div>
        <a href={`/superadmin/firmy/${company.id}`} className="text-sm underline">Detail / výber firmy</a>
      </article>)}
      {!result.items.length ? <p className="py-5">Žiadne firmy.</p> : null}
    </div>
    <div className="mt-5 flex gap-5 text-sm">
      {result.page > 1 ? <a href={pageUrl(result.page - 1)}>Predchádzajúca</a> : null}
      <span>Strana {result.page} · {result.total} firiem</span>
      {result.page * result.pageSize < result.total ? <a href={pageUrl(result.page + 1)}>Nasledujúca</a> : null}
    </div>
  </section>;
}
