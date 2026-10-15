"use client";

export function privacyPayload(data: FormData, noticeId: string) {
  const localDate = new Date(String(data.get("privacyProvidedAt") ?? ""));
  if (!Number.isFinite(localDate.getTime())) return null;
  return {
    noticeId,
    providedAt: localDate.toISOString(),
    method: String(data.get("privacyMethod") ?? ""),
    ...(data.get("privacyReason") ? { reason: String(data.get("privacyReason")) } : {}),
  };
}

export function PrivacyReceiptFields({ version, noticeUrl, correction = false }: {
  version: number; noticeUrl: string; correction?: boolean;
}) {
  return <fieldset className="min-w-0 space-y-3 rounded-lg border border-stone-200 p-4">
    <legend className="px-1 font-semibold">Poskytnutie informácií o spracúvaní údajov</legend>
    <p className="text-sm text-stone-600">
      <a href={noticeUrl} target="_blank" rel="noreferrer" className="text-amber-800 underline">
        Informačné oznámenie – verzia {version}
      </a>. Poskytnite ho partnerovi pred získaním údajov alebo pri ich získavaní.
      Zaznamenajte skutočné poskytnutie, nie súhlas ani potvrdenie prečítania.
    </p>
    <label className="block text-sm font-medium">Spôsob poskytnutia
      <select name="privacyMethod" required defaultValue=""
        className="mt-1 block w-full rounded-md border border-stone-300 bg-white px-3 py-2">
        <option value="" disabled>Vyberte spôsob</option>
        <option value="in_person">Osobne na obrazovke</option>
        <option value="printed">V tlačenej podobe</option>
        <option value="email">E-mailom</option>
      </select>
    </label>
    <label className="block text-sm font-medium">Dátum a čas poskytnutia (čas zariadenia)
      <input type="datetime-local" step="0.001" name="privacyProvidedAt" required
        className="mt-1 block w-full min-w-0 rounded-md border border-stone-300 px-3 py-2" />
    </label>
    {correction ? <label className="block text-sm font-medium">Dôvod ďalšieho záznamu alebo opravy
      <input name="privacyReason" required minLength={2} maxLength={255}
        className="mt-1 block w-full rounded-md border border-stone-300 px-3 py-2" />
    </label> : null}
    <label className="flex items-start gap-2 text-sm">
      <input type="checkbox" required name="privacyConfirmed" className="mt-1" />
      Potvrdzujem, že zaznamenávam skutočné poskytnutie uvedenej verzie oznámenia partnerovi.
    </label>
    <p className="text-xs text-stone-600">Výber „E-mailom“ nič neodosiela; zaznamenáva už vykonané odovzdanie.</p>
  </fieldset>;
}
