import Link from "next/link";

export type PurchaseItem = {
  id: string;
  amount: string;
  netAmount: string;
  vatRatePercent: string;
  vatAmount?: string;
  points: number;
  partnerPresent: boolean;
  purchasedAt: string;
  source: string;
  isDeleted: boolean;
  deletedAt: string | null;
  partner: { id: string; code: string; displayName: string };
  createdBy: { id: string; name: string };
};

const badgeBase = "inline-flex max-w-[12rem] items-center gap-1.5 whitespace-nowrap rounded-full px-2.5 py-0.5 text-xs font-semibold ring-1 ring-inset";

function AuthorBadge({ name }: { name: string }) {
  return (
    <span className={`${badgeBase} bg-stone-100 text-stone-700 ring-stone-200`} title={`Zapísal: ${name}`}>
      <span className="sr-only">Zapísal: </span><span className="truncate">{name}</span>
    </span>
  );
}

function StatusBadge({ purchase }: { purchase: Pick<PurchaseItem, "isDeleted" | "partnerPresent"> }) {
  const [label, tone, dot] = purchase.isDeleted
    ? ["Zmazaný", "bg-red-50 text-red-700 ring-red-200", "bg-red-500"]
    : purchase.partnerPresent
      ? ["Osobne", "bg-emerald-50 text-emerald-700 ring-emerald-200", "bg-emerald-500"]
      : ["Neosobne", "bg-sky-50 text-sky-700 ring-sky-200", "bg-sky-500"];
  return (
    <span className={`${badgeBase} ${tone}`}>
      <span aria-hidden className={`size-1.5 rounded-full ${dot}`} />{label}
    </span>
  );
}

export function PurchaseHistory({
  items,
  role,
  includeDeleted = false,
  total = items.length,
  page = 1,
  pageSize = 50,
  partnerId,
  from,
  to,
  showPagination = false,
}: {
  items: PurchaseItem[];
  role: "admin" | "seller" | "superadmin";
  includeDeleted?: boolean;
  total?: number;
  page?: number;
  pageSize?: number;
  partnerId?: string;
  from?: string;
  to?: string;
  showPagination?: boolean;
}) {
  function pageHref(targetPage: number) {
    const params = new URLSearchParams();
    if (includeDeleted) params.set("includeDeleted", "true");
    if (partnerId) params.set("partnerId", partnerId);
    if (from) params.set("from", from);
    if (to) params.set("to", to);
    params.set("page", String(targetPage));
    return `/app/nakupy?${params.toString()}`;
  }
  const toggleParams = new URLSearchParams();
  if (partnerId) toggleParams.set("partnerId", partnerId);
  if (from) toggleParams.set("from", from);
  if (to) toggleParams.set("to", to);
  if (!includeDeleted) toggleParams.set("includeDeleted", "true");
  const toggleHref = `/app/nakupy${toggleParams.size ? `?${toggleParams.toString()}` : ""}`;
  const pageCount = Math.max(1, Math.ceil(total / pageSize));
  const firstShown = total ? (page - 1) * pageSize + 1 : 0;
  const lastShown = Math.min(page * pageSize, total);
  const pagination = showPagination && total > pageSize ? (
    <Pagination page={page} pageCount={pageCount} hrefFor={pageHref} />
  ) : null;
  return (
    <section className="mt-6 overflow-hidden rounded-xl border border-stone-200 bg-white">
      {role !== "seller" ? (
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-stone-200 p-4">
          <p className="text-sm text-stone-600">
            {showPagination && total > pageSize
              ? <>Zobrazené <strong className="text-stone-900">{firstShown}–{lastShown}</strong> z {total} nákupov (najnovšie prvé)</>
              : <>{total} nákupov</>}
          </p>
          <Link className="text-sm font-medium text-amber-800 underline" href={toggleHref}>
            {includeDeleted ? "Skryť zmazané" : "Zobraziť aj zmazané"}
          </Link>
        </div>
      ) : null}
      {items.length ? (
        <>
          {pagination ? <div className="border-b border-stone-200">{pagination}</div> : null}
          <p className="border-b border-stone-100 px-4 py-2 text-xs text-stone-500">
            Suma je uvedená s DPH aj bez DPH; body sa počítajú zo sumy bez DPH.
          </p>
          <ul className="divide-y divide-stone-100 md:hidden">
            {items.map((purchase) => (
              <li key={purchase.id} className={`p-4 ${purchase.isDeleted ? "text-stone-400" : ""}`}>
                <div className="flex items-start justify-between gap-3">
                  <div>
                    {role !== "seller" ? (
                      <Link className="font-semibold text-stone-950 underline" href={`/app/nakupy/${purchase.id}`}>
                        {purchase.partner.displayName}
                      </Link>
                    ) : <strong className="text-stone-950">{purchase.partner.displayName}</strong>}
                    <p className="text-xs text-stone-500">{purchase.partner.code} · {formatDate(purchase.purchasedAt)}</p>
                  </div>
                  <strong className="whitespace-nowrap text-stone-950">{purchase.netAmount} € bez DPH</strong>
                </div>
                <p className="mt-3 text-sm text-stone-600">
                  {purchase.amount} € s DPH · <strong className="text-base font-bold text-stone-950">{purchase.points} bodov</strong> · DPH {purchase.vatRatePercent} %
                </p>
                <div className="mt-2 flex flex-wrap gap-1.5">
                  <AuthorBadge name={purchase.createdBy.name} />
                  <StatusBadge purchase={purchase} />
                </div>
              </li>
            ))}
          </ul>
          <div className="hidden overflow-x-auto md:block">
          <table className="w-full text-left text-sm">
            <thead className="bg-stone-50 text-xs uppercase tracking-wide text-stone-500">
              <tr>
                <th className="px-4 py-3">Dátum</th>
                <th className="px-4 py-3">Partner</th>
                <th className="px-4 py-3">Suma s DPH</th>
                <th className="px-4 py-3">Suma bez DPH</th>
                <th className="px-4 py-3">Body</th>
                <th className="px-4 py-3">Zapísal</th>
                <th className="px-4 py-3">Stav</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-stone-100">
              {items.map((purchase) => (
                <tr key={purchase.id} className={purchase.isDeleted ? "text-stone-400" : ""}>
                  <td className="px-4 py-3">{formatDate(purchase.purchasedAt)}</td>
                  <td className="px-4 py-3">
                    {role !== "seller" ? (
                      <Link className="font-medium text-stone-900 underline" href={`/app/nakupy/${purchase.id}`}>
                        {purchase.partner.displayName}
                      </Link>
                    ) : <span className="font-medium text-stone-900">{purchase.partner.displayName}</span>}
                    <span className="ml-2 text-xs">{purchase.partner.code}</span>
                  </td>
                  <td className="px-4 py-3">{purchase.amount} € ({purchase.vatRatePercent} %)</td>
                  <td className="px-4 py-3 font-medium">{purchase.netAmount} €</td>
                  <td className="whitespace-nowrap px-4 py-3 text-base font-bold tabular-nums">{purchase.points}</td>
                  <td className="px-4 py-3"><AuthorBadge name={purchase.createdBy.name} /></td>
                  <td className="px-4 py-3"><StatusBadge purchase={purchase} /></td>
                </tr>
              ))}
            </tbody>
          </table>
          </div>
        </>
      ) : <p className="p-5 text-sm text-stone-600">Zatiaľ tu nie sú žiadne nákupy.</p>}
      {pagination ? <div className="border-t border-stone-200">{pagination}</div> : null}
    </section>
  );
}

function pageWindow(page: number, pageCount: number) {
  const pages = new Set([1, pageCount, page - 1, page, page + 1]);
  const sorted = [...pages].filter((value) => value >= 1 && value <= pageCount).sort((a, b) => a - b);
  const result: (number | "gap")[] = [];
  sorted.forEach((value, index) => {
    if (index && value - sorted[index - 1] > 1) result.push("gap");
    result.push(value);
  });
  return result;
}

function Pagination({ page, pageCount, hrefFor }: {
  page: number; pageCount: number; hrefFor: (page: number) => string;
}) {
  const button = "inline-flex min-h-11 min-w-11 items-center justify-center rounded-md border px-3 text-sm font-medium";
  const idle = "border-stone-300 bg-white text-stone-700 hover:bg-stone-100";
  const disabled = "border-stone-200 text-stone-300";
  return (
    <nav aria-label="Stránkovanie nákupov" className="flex flex-wrap items-center justify-between gap-2 p-3">
      {page > 1
        ? <Link className={`${button} ${idle}`} href={hrefFor(page - 1)} rel="prev">← Novšie</Link>
        : <span aria-hidden className={`${button} ${disabled}`}>← Novšie</span>}
      <ol className="hidden items-center gap-1 sm:flex">
        {pageWindow(page, pageCount).map((value, index) => (
          <li key={value === "gap" ? `gap-${index}` : value}>
            {value === "gap" ? <span className="px-1 text-stone-400">…</span>
              : value === page
                ? <span aria-current="page" className={`${button} border-stone-950 bg-stone-950 text-white`}>{value}</span>
                : <Link className={`${button} ${idle}`} href={hrefFor(value)}>{value}</Link>}
          </li>
        ))}
      </ol>
      <span className="text-sm text-stone-600 sm:hidden">Strana {page} / {pageCount}</span>
      {page < pageCount
        ? <Link className={`${button} ${idle}`} href={hrefFor(page + 1)} rel="next">Staršie →</Link>
        : <span aria-hidden className={`${button} ${disabled}`}>Staršie →</span>}
    </nav>
  );
}

function formatDate(value: string) {
  return new Intl.DateTimeFormat("sk-SK", {
    dateStyle: "medium", timeStyle: "short", timeZone: "Europe/Bratislava",
  }).format(new Date(value));
}
