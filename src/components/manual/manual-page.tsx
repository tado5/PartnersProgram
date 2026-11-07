import Link from "next/link";
import { notFound } from "next/navigation";
import { BookOpen, ArrowRight } from "lucide-react";

import { getManualArticle, getManualArticles, manualRoleLabels, type ManualRole } from "@/lib/manual";

export function ManualPage({ role, base, slug = [], companySelected }: {
  role: ManualRole;
  base: string;
  slug?: string[];
  companySelected: boolean;
}) {
  const articles = getManualArticles(role);
  const article = slug.length === 1 ? getManualArticle(role, slug[0]) : undefined;
  if (slug.length > 1 || (slug.length === 1 && !article)) notFound();
  const action = article?.action;
  const canOpenAction = action && (!action.href.startsWith("/app") || companySelected);
  const related = article?.related.flatMap((id) => {
    const guide = getManualArticle(role, id);
    return guide ? [guide] : [];
  }) ?? [];

  return (
    <section className="mx-auto max-w-5xl">
      <p className="flex items-center gap-2 text-xs font-semibold uppercase tracking-widest text-white/70">
        <BookOpen aria-hidden className="size-4" /> Manuál · {manualRoleLabels[role]}
      </p>
      <h1 className="mt-3 text-3xl font-bold tracking-tight text-white sm:text-4xl">
        {article?.title ?? "S čím potrebujete pomôcť?"}
      </h1>
      <p className="mt-3 max-w-3xl leading-7 text-white/75">
        {article?.summary ?? "Vyberte si návod podľa úlohy. Nájdete tu postup, očakávaný výsledok aj upozornenia. Čítanie manuálu nemení žiadne údaje."}
      </p>
      {role === "superadmin" ? (
        <p className="mt-5 rounded-xl border border-primary/30 bg-primary/10 p-4 text-sm leading-6 text-white/85">
          Firemné návody sú dostupné aj bez výberu firmy. Na vykonanie firemnej operácie najprv
          otvorte jej program. Logo, pravidlá programu a publikovanie oznámenia o ochrane údajov
          môže meniť iba administrátor danej firmy; ako superadministrátor máte v týchto nastaveniach len náhľad.
        </p>
      ) : null}
      {article ? (
        <>
          <nav aria-label="Navigácia manuálu" className="mt-6">
            <Link href={base} className="text-sm text-primary underline underline-offset-4">Všetky kapitoly manuálu</Link>
          </nav>
          <div className="mt-6 space-y-6">
            {article.sections.map((section) => (
              <section key={section.title} className="data-surface rounded-xl p-5 sm:p-7">
                <h2 className="text-xl font-semibold">{section.title}</h2>
                <ol className="mt-4 list-decimal space-y-3 pl-6 leading-7">
                  {section.steps.map((step) => <li key={step} className="pl-1">{step}</li>)}
                </ol>
                <p className="mt-5 border-t border-white/15 pt-4 leading-7">
                  <strong>Výsledok: </strong>{section.result}
                </p>
                {section.warning ? (
                  <p className="mt-4 rounded-lg border border-amber-400/30 bg-amber-400/10 p-4 text-sm leading-6">
                    <strong>Pozor: </strong>{section.warning}
                  </p>
                ) : null}
              </section>
            ))}
          </div>
          {canOpenAction ? (
            <Link href={action.href} className="mt-6 inline-flex items-center gap-2 rounded-lg bg-primary px-4 py-3 text-sm font-semibold text-primary-foreground">
              {action.label}<ArrowRight aria-hidden className="size-4" />
            </Link>
          ) : null}
          {!companySelected && action?.href.startsWith("/app") ? (
            <p className="mt-6 text-sm text-white/75">
              Na vykonanie postupu najprv <Link href="/superadmin/firmy" className="text-primary underline">vyberte firmu a otvorte jej program</Link>.
            </p>
          ) : null}
          {related.length ? (
            <nav aria-label="Súvisiace návody" className="mt-8">
              <h2 className="text-lg font-semibold text-white">Súvisiace návody</h2>
              <ul className="mt-3 flex flex-wrap gap-3">
                {related.map((guide) => <li key={guide.slug}>
                  <Link href={`${base}/${guide.slug}`} className="inline-block rounded-lg border border-white/20 px-3 py-2 text-sm text-white/85 hover:bg-white/10">
                    {guide.title}
                  </Link>
                </li>)}
              </ul>
            </nav>
          ) : null}
        </>
      ) : (
        <nav aria-label="Kapitoly manuálu" className="mt-7">
          <ul className="grid gap-4 sm:grid-cols-2">
            {articles.map((guide) => <li key={guide.slug}>
              <Link href={`${base}/${guide.slug}`} className="data-surface block h-full rounded-xl p-5 transition hover:ring-2 hover:ring-primary focus-visible:outline-2 focus-visible:outline-primary">
                <h2 className="text-lg font-semibold">{guide.title}</h2>
                <p className="mt-2 text-sm leading-6 opacity-80">{guide.summary}</p>
              </Link>
            </li>)}
          </ul>
        </nav>
      )}
    </section>
  );
}
