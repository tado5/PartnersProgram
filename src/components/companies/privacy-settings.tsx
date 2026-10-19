"use client";

import { useId, useState } from "react";
import { useRouter } from "next/navigation";

import { useCompanyApi } from "@/components/company-context";
import { ValidatedForm } from "@/components/validated-form";
import { formatApiError } from "@/lib/validation-errors";
import { hasPrivacyTemplatePlaceholders, privacyTemplateBody, PRIVACY_TEMPLATE_URL } from "@/lib/privacy-template";

type NoticeFields = {
  controllerName: string;
  controllerAddress: string;
  controllerIco: string | null;
  contactEmail: string;
  dpoContact: string | null;
  body: string;
};
type PrivacyState = {
  draft: (NoticeFields & { updatedAt: string }) | null;
  current: (NoticeFields & { id: string; version: number; publishedAt: string }) | null;
};

export function PrivacySettings({ initial, companySlug, companyName, companyIco, readOnly }: {
  initial: PrivacyState; companySlug: string; companyName: string; companyIco: string | null; readOnly: boolean;
}) {
  const { companyFetch } = useCompanyApi();
  const router = useRouter();
  const [state, setState] = useState(initial);
  const saved = initial.draft ?? initial.current;
  const [fields, setFields] = useState<NoticeFields>({
    controllerName: saved?.controllerName || companyName,
    controllerIco: saved?.controllerIco ?? companyIco,
    controllerAddress: saved?.controllerAddress ?? "",
    contactEmail: saved?.contactEmail ?? "",
    dpoContact: saved?.dpoContact ?? null,
    body: saved?.body || privacyTemplateBody,
  });
  const [dirty, setDirty] = useState(!initial.draft || !initial.draft.controllerName || !initial.draft.body ||
    (!initial.draft.controllerIco && !!companyIco));
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const publishHelpId = useId();
  const hasPlaceholders = hasPrivacyTemplatePlaceholders(fields.body);

  async function change(publish: boolean) {
    setBusy(true);
    setError("");
    setMessage("");
    try {
      const response = await companyFetch(publish ? "/api/company/privacy/publish" : "/api/company/privacy", {
        method: publish ? "POST" : "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(publish ? { expectedUpdatedAt: state.draft?.updatedAt } : {
          controllerName: fields.controllerName, controllerAddress: fields.controllerAddress,
          controllerIco: fields.controllerIco, contactEmail: fields.contactEmail,
          dpoContact: fields.dpoContact, body: fields.body,
        }),
      });
      if (!response.ok) {
        const result = await response.json();
        setError(formatApiError(result.error, "Oznámenie sa nepodarilo uložiť."));
        return;
      }
      const refreshed = await companyFetch("/api/company/privacy", { cache: "no-store" });
      if (!refreshed.ok) {
        setError("Zmena bola uložená, ale aktuálny stav sa nepodarilo načítať. Obnovte stránku.");
        return;
      }
      const next: PrivacyState = await refreshed.json();
      setState(next);
      setFields(next.draft ?? next.current ?? fields);
      setDirty(false);
      setMessage(publish ? "Oznámenie bolo publikované. Publikovanú verziu už nemožno meniť." : "Návrh bol uložený.");
      router.refresh();
    } catch {
      setError("Požiadavku sa nepodarilo dokončiť. Skontrolujte pripojenie.");
    } finally {
      setBusy(false);
    }
  }

  return <section className="mb-6 max-w-3xl rounded-xl border border-stone-200 bg-white p-5">
    <h2 className="text-xl font-semibold">Ochrana osobných údajov</h2>
    <p className="mt-2 text-sm text-stone-600">
      Dokument je predvyplnený pre partnerský program. Názov a IČO sa preberajú z údajov firmy.
      Skontrolujte kontakty a podmienky, uložte ich a publikujte firemnú verziu.
    </p>
    <p className="mt-3 text-sm">
      <a href={PRIVACY_TEMPLATE_URL} target="_blank" rel="noreferrer" className="text-amber-800 underline">Hlavný GDPR dokument</a>
      {" · "}<a href={`${PRIVACY_TEMPLATE_URL}?format=pdf`} className="text-amber-800 underline" download>Stiahnuť hlavný dokument PDF</a>
    </p>
    {state.current ? <p className="mt-3 text-sm">
      Publikovaná verzia {state.current.version} · <a className="text-amber-800 underline"
        href={`/ochrana-udajov/${companySlug}?version=${state.current.version}`} target="_blank" rel="noreferrer">
        Zobraziť publikované oznámenie
      </a>
      {" · "}<a className="text-amber-800 underline"
        href={`/ochrana-udajov/${companySlug}?version=${state.current.version}&format=pdf`} download>Stiahnuť publikované PDF</a>
    </p> : <p className="mt-3 rounded-md bg-amber-50 p-3 text-sm text-amber-900">
      Bez publikovaného oznámenia nie je možné registrovať nových partnerov. Existujúce karty a nákupy zostávajú funkčné.
    </p>}
    <ValidatedForm className="mt-4 space-y-4" onSubmit={(event) => { event.preventDefault(); void change(false); }}>
      <fieldset disabled={readOnly || busy} className="min-w-0 space-y-4">
        {([
          ["controllerName", "Prevádzkovateľ", 150],
          ["controllerAddress", "Sídlo prevádzkovateľa", 500],
          ["controllerIco", "IČO prevádzkovateľa", 8],
          ["contactEmail", "Kontaktný e-mail pre ochranu údajov", 191],
          ["dpoContact", "Zodpovedná osoba (ak je ustanovená)", 500],
        ] as const).map(([key, label, max]) => <label key={key} className="block text-sm font-medium">
          {label}
          <input className="mt-1 block w-full min-w-0 rounded-md border border-stone-300 px-3 py-2"
            name={key}
            value={fields[key] ?? ""} maxLength={max}
            onChange={(event) => { setFields({ ...fields, [key]: event.target.value }); setDirty(true); }} />
        </label>)}
        <details className="rounded-md border border-stone-200 p-3">
          <summary className="cursor-pointer text-sm font-semibold">Zobraziť alebo upraviť podmienky a lehoty</summary>
          <p className="my-3 text-sm text-stone-600">
            Predvolené lehoty: účasť + 3 roky pre profil a nákupy, 12 mesiacov pre audit a deaktivované tokeny,
            30 dní pre pracovné exporty a 90 dní pre zálohy. Sú to nastavené pravidlá, nie univerzálne zákonné lehoty.
            Ak sa vaša prevádzka líši, upravte text nižšie pred publikovaním.
          </p>
          <label className="block text-sm font-medium">Informačné oznámenie
          <textarea className="mt-1 block w-full rounded-md border border-stone-300 px-3 py-2"
            name="body"
            rows={12} maxLength={20000} value={fields.body}
            onChange={(event) => { setFields({ ...fields, body: event.target.value }); setDirty(true); }} />
        </label>
          {!readOnly ? <button type="button"
            className="mt-3 rounded-md border border-stone-300 px-4 py-2 text-sm font-semibold"
            onClick={() => {
              if (fields.body !== privacyTemplateBody && !window.confirm("Obnoviť predvolené znenie dokumentu? Vlastné úpravy návrhu sa nahradia, publikované verzie sa nezmenia.")) return;
              setFields({ ...fields, body: privacyTemplateBody });
              setDirty(true);
              setMessage("Predvolené znenie bolo obnovené. Zmenu uložte a publikujte.");
              setError("");
            }}>Obnoviť predvolené znenie</button> : null}
        </details>
        <p className="text-sm text-stone-600">
          Publikovaním firma prijíma uvedené podmienky. Musí zabezpečiť ich dodržiavanie vrátane retenčných lehôt;
          tento formulár nenastavuje automatický výmaz údajov ani záloh. Overte aj skutočné umiestnenie technických
          služieb a pri prenosoch mimo EHP doplňte konkrétne krajiny a záruky. Dokument nie je GDPR súhlas.
        </p>
        {hasPlaceholders ? <p className="text-sm text-amber-900">
          Starší návrh obsahuje nevyplnené značky. Doplňte ich alebo obnovte predvolené znenie dokumentu.
        </p> : null}
      </fieldset>
      {!readOnly ? <div className="flex flex-wrap gap-3">
        <button disabled={busy} className="rounded-md bg-stone-950 px-4 py-2 text-sm font-semibold text-white disabled:opacity-50">
          Uložiť návrh
        </button>
        <button type="button" aria-describedby={publishHelpId} disabled={busy || dirty || !state.draft || hasPlaceholders} onClick={() => void change(true)}
          className="rounded-md border border-amber-800 px-4 py-2 text-sm font-semibold text-amber-900 disabled:opacity-50">
          Publikovať oznámenie
        </button>
      </div> : <p className="text-sm text-stone-600">Ako superadmin máte iba náhľad oznámenia.</p>}
      {!readOnly ? <p id={publishHelpId} className="text-xs text-stone-600">
        {dirty || !state.draft ? "Publikovanie je vypnuté: najprv uložte návrh. " : ""}
        {hasPlaceholders ? "Publikovanie je vypnuté: nahraďte všetky značky [DOPLNIŤ: …] konkrétnymi údajmi alebo obnovte predvolené znenie a uložte návrh. " : ""}
        Návrh môžete uložiť aj neúplný. Publikovanie vytvorí novú nemennú verziu, účinnú okamihom publikovania.
        Zmenu textu možno vykonať iba publikovaním ďalšej verzie.
      </p> : null}
      {error ? <p role="alert" className="text-sm text-red-700">{error}</p> : null}
      {message ? <p role="status" className="text-sm text-emerald-800">{message}</p> : null}
    </ValidatedForm>
  </section>;
}
