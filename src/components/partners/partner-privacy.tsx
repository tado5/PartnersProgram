"use client";

import { useId, useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { useCompanyApi } from "@/components/company-context";
import { ValidatedForm } from "@/components/validated-form";
import { formatApiError } from "@/lib/validation-errors";
import { PrivacyReceiptFields, privacyPayload } from "./privacy-receipt-fields";

type Receipt = {
  id: string; noticeId: string; version: number; method: string; providedAt: string;
  recordedAt: string; recordedBy: string; reason: string | null;
};
const methods: Record<string, string> = { in_person: "Osobne na obrazovke", printed: "V tlačenej podobe", email: "E-mailom" };

export function PartnerPrivacy({ partnerId, companySlug, receipts, notices, readOnly, timeZone }: {
  partnerId: string; companySlug: string; receipts: Receipt[];
  notices: { id: string; version: number }[]; readOnly: boolean; timeZone: string;
}) {
  const { companyFetch } = useCompanyApi();
  const router = useRouter();
  const [noticeId, setNoticeId] = useState(notices[0]?.id ?? "");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [addingReceipt, setAddingReceipt] = useState(false);
  const formId = useId();
  const notice = notices.find((item) => item.id === noticeId);
  const date = (value: string) => new Intl.DateTimeFormat("sk-SK", {
    dateStyle: "medium", timeStyle: "medium", timeZone,
  }).format(new Date(value));

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = event.currentTarget;
    const payload = privacyPayload(new FormData(form), noticeId);
    if (!payload) { setError("Vyplňte platný dátum a čas poskytnutia oznámenia."); return; }
    setBusy(true); setError(""); setMessage("");
    try {
      const response = await companyFetch(`/api/partners/${partnerId}/privacy`, {
        method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload),
      });
      if (!response.ok) {
        const result = await response.json();
        setError(formatApiError(result.error, "Poskytnutie informácií sa nepodarilo zaznamenať."));
        return;
      }
      form.reset();
      setAddingReceipt(false);
      setMessage("Poskytnutie informácií bolo zaznamenané.");
      router.refresh();
    } catch {
      setError("Požiadavku sa nepodarilo dokončiť. Skontrolujte pripojenie.");
    } finally { setBusy(false); }
  }

  return <section className="data-surface mt-8 rounded-xl p-5">
    <h2 className="text-xl font-semibold">Informovanie o spracúvaní údajov</h2>
    <p className={`mt-2 text-sm ${receipts.length ? "text-emerald-800" : "text-amber-900"}`}>
      {receipts.length ? "Poskytnutie informácií zaevidované" : "Poskytnutie informácií nezaevidované"}.
      {" "}Evidencia nie je súhlas ani dôkaz prečítania. Nová verzia oznámenia spätne nemení predchádzajúce záznamy.
    </p>
    {receipts.length ? <ol className="mt-4 divide-y divide-stone-200">
      {receipts.map((receipt) => <li key={receipt.id} className="py-3 text-sm">
        <a className="text-amber-800 underline" target="_blank" rel="noreferrer"
          href={`/ochrana-udajov/${companySlug}?version=${receipt.version}`}>Verzia {receipt.version}</a>
        {" · "}{methods[receipt.method]} · poskytnuté {date(receipt.providedAt)}
        <p className="mt-1 text-stone-600">Zaznamenal: {receipt.recordedBy} · {date(receipt.recordedAt)} ({timeZone})</p>
        {receipt.reason ? <p className="mt-1 break-words">Dôvod: {receipt.reason}</p> : null}
      </li>)}
    </ol> : null}
    {!readOnly && notice ? <>
      {receipts.length > 0 ? <div className="mt-5">
        <p className="text-sm text-stone-600">
          Informovanie je už zaevidované. Ďalší záznam pridajte iba pri opätovnom poskytnutí alebo oprave; pôvodná evidencia zostane zachovaná.
        </p>
        <button type="button" aria-expanded={addingReceipt} aria-controls={formId}
          disabled={busy}
          className="mt-3 min-h-11 rounded-md border border-stone-300 px-4 py-2 text-sm font-semibold disabled:opacity-50"
          onClick={() => { setAddingReceipt(!addingReceipt); setError(""); setMessage(""); }}>
          {addingReceipt ? "Zrušiť pridávanie záznamu" : "Zaznamenať ďalšie poskytnutie / opravu"}
        </button>
      </div> : null}
      <div id={formId} hidden={receipts.length > 0 && !addingReceipt}>
        {receipts.length === 0 || addingReceipt ? <ValidatedForm onSubmit={(event) => void submit(event)} className="mt-5 max-w-xl space-y-3">
          <fieldset disabled={busy} className="min-w-0 space-y-3">
            <label className="block text-sm font-medium">Verzia poskytnutého oznámenia
              <select name="noticeId" required value={noticeId} onChange={(event) => setNoticeId(event.target.value)}
                className="mt-1 block w-full rounded-md border border-stone-300 bg-white px-3 py-2">
                {notices.map((item) => <option key={item.id} value={item.id}>Verzia {item.version}</option>)}
              </select>
            </label>
            <PrivacyReceiptFields key={noticeId} version={notice.version}
              noticeUrl={`/ochrana-udajov/${companySlug}?version=${notice.version}`} correction={receipts.length > 0} />
            <button className="rounded-md bg-stone-950 px-4 py-2 text-sm font-semibold text-white disabled:opacity-50">
              Zaznamenať poskytnutie
            </button>
          </fieldset>
        </ValidatedForm> : null}
      </div>
    </> : <p className="mt-4 text-sm text-stone-600">
      {readOnly ? "Superadmin môže evidenciu iba prezerať." : "Najprv publikujte oznámenie v nastaveniach firmy."}
    </p>}
    {error ? <p role="alert" className="mt-3 text-sm text-red-700">{error}</p> : null}
    {message ? <p role="status" className="mt-3 text-sm text-emerald-800">{message}</p> : null}
  </section>;
}
