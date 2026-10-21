"use client";

import Image from "next/image";
import { createPortal } from "react-dom";
import { useEffect, useRef, useState, type SubmitEvent } from "react";
import { useCompanyApi } from "@/components/company-context";
import { ActionLabel } from "@/components/action-label";
import { ValidatedForm } from "@/components/validated-form";
import { formatApiError } from "@/lib/validation-errors";
import { PartnerCardPreview } from "@/components/partners/partner-card-preview";

type Token = {
  id: string;
  type: "qr" | "nfc";
  tokenHint: string;
  label: string | null;
  isActive: boolean;
  createdAt: string;
  deactivatedAt: string | null;
  deactivationReason: string | null;
  lastUsedAt: string | null;
};

type IssuedToken = {
  token: Token;
  value: string;
  url: string;
  qrSvg: string;
  qrPng: string;
};

export function PartnerTokenManager({
  partnerId,
  partnerName,
  partnerCode,
  companyName,
  companyLogoUrl,
  initialTokens,
}: {
  partnerId: string;
  partnerName: string;
  partnerCode: string;
  companyName: string;
  companyLogoUrl: string | null;
  initialTokens: Token[];
}) {
  const { companyFetch } = useCompanyApi();
  const [tokens, setTokens] = useState(initialTokens);
  const [type, setType] = useState<"qr" | "nfc">("qr");
  const [createOpen, setCreateOpen] = useState(false);
  const [label, setLabel] = useState("");
  const [confirmedReplacement, setConfirmedReplacement] = useState(false);
  const [reason, setReason] = useState("");
  const [issued, setIssued] = useState<IssuedToken | null>(null);
  const [nfc, setNfc] = useState<IssuedToken | null>(null);
  const [cardOpen, setCardOpen] = useState(false);
  const [action, setAction] = useState<"create" | "open-qr" | "open-nfc" | "deactivate-qr" | "deactivate-nfc" | null>(null);
  const pending = action !== null;
  const pendingText = action === "create" ? "Vytváram prístup…" :
    action === "open-qr" ? "Načítavam QR náhľad…" :
    action === "open-nfc" ? "Načítavam URL pre NFC…" :
    action === "deactivate-qr" ? "Deaktivujem QR prístup…" : "Deaktivujem NFC prístup…";
  const [error, setError] = useState("");
  const [dialogError, setDialogError] = useState("");
  const [notice, setNotice] = useState("");
  const issuedDialogRef = useRef<HTMLDivElement>(null);
  const issuedCloseRef = useRef<HTMLButtonElement>(null);
  const issuedTriggerRef = useRef<HTMLElement | null>(null);
  const sectionRef = useRef<HTMLElement>(null);
  const activeOfType = tokens.filter((token) => token.isActive && token.type === type);
  const activeQr = tokens.find((token) => token.isActive && token.type === "qr");
  const activeNfc = tokens.find((token) => token.isActive && token.type === "nfc");

  useEffect(() => {
    if (!cardOpen && !createOpen) return;

    const previouslyFocused = document.activeElement instanceof HTMLElement
      ? document.activeElement
      : null;
    const focusFallback = sectionRef.current;
    issuedCloseRef.current?.focus();

    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") {
        if (issuedDialogRef.current?.getAttribute("aria-busy") === "true") return;
        event.preventDefault();
        if (createOpen) { setCreateOpen(false); setError(""); }
        else {
          setIssued(null);
          setNfc(null);
          setCardOpen(false);
        }
        return;
      }
      if (event.key !== "Tab" || !issuedDialogRef.current) return;

      const focusable = issuedDialogRef.current.querySelectorAll<HTMLElement>(
        'a[href], button:not([disabled]), input:not([disabled]), summary, [tabindex]:not([tabindex="-1"])',
      );
      const visible = Array.from(focusable).filter((element) => element.getClientRects().length > 0);
      const first = visible.at(0);
      const last = visible.at(-1);
      if (!first || !last) {
        event.preventDefault();
        issuedDialogRef.current.focus();
      } else if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    }

    document.addEventListener("keydown", handleKeyDown);
    return () => {
      document.removeEventListener("keydown", handleKeyDown);
      const trigger = issuedTriggerRef.current ?? previouslyFocused;
      if (!trigger?.isConnected || (trigger instanceof HTMLButtonElement && trigger.disabled)) {
        const activeButton = focusFallback?.querySelector<HTMLButtonElement>(
          'button[data-card-action]:not([disabled])',
        );
        (activeButton ?? focusFallback)?.focus();
      } else {
        trigger?.focus();
      }
    };
  }, [cardOpen, createOpen]);

  useEffect(() => {
    if (!pending && (cardOpen || createOpen) &&
        !issuedDialogRef.current?.contains(document.activeElement)) {
      issuedCloseRef.current?.focus();
    }
  }, [pending, cardOpen, createOpen]);

  async function refreshTokens() {
    try {
      const response = await companyFetch(`/api/partners/${partnerId}/tokens`, {
        cache: "no-store",
      });
      if (!response.ok) return false;
      const body = (await response.json()) as { tokens: Token[] };
      setTokens(body.tokens);
      return true;
    } catch {
      return false;
    }
  }

  async function createToken() {
    if (pending) return;
    setAction("create");
    setError("");
    try {
      const response = await companyFetch(`/api/partners/${partnerId}/tokens`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          type,
          label: label.trim() || undefined,
          deactivateTokenIds: activeOfType.map((token) => token.id),
          ...(activeOfType.length
            ? { deactivationReason: reason.trim() }
            : {}),
        }),
      });
      const body = (await response.json()) as {
        token?: Token;
        value?: string;
        url?: string;
        qrSvg?: string;
        qrPng?: string;
        error?: { message?: string };
      };
      if (!response.ok || !body.token || !body.value || !body.url || !body.qrSvg || !body.qrPng) {
        setError(formatApiError(body.error, "Token sa nepodarilo vytvoriť."));
        return;
      }
      const access = {
        token: body.token,
        value: body.value,
        url: body.url,
        qrSvg: body.qrSvg,
        qrPng: body.qrPng,
      };
      if (type === "qr") setIssued(access);
      else setNfc(access);
      setTokens((current) => [access.token, ...current.filter((item) => item.id !== access.token.id)
        .map((item) => item.type === type && item.isActive ? { ...item, isActive: false } : item)]);
      setCardOpen(true);
      setCreateOpen(false);
      setLabel("");
      setReason("");
      setConfirmedReplacement(false);
      setDialogError("");
      setNotice("");
      if (!(await refreshTokens())) {
        setDialogError("Prístup bol vytvorený, ale zoznam sa nepodarilo obnoviť. Pred ďalšou správou obnovte stránku.");
      }
    } catch {
      setError("Požiadavku sa nepodarilo dokončiť. Skontrolujte pripojenie.");
    } finally {
      setAction(null);
    }
  }

  async function openToken(token: Token, trigger: HTMLButtonElement) {
    if (pending) return;
    if (!cardOpen) issuedTriggerRef.current = trigger;
    setAction(token.type === "qr" ? "open-qr" : "open-nfc");
    setError("");
    setDialogError("");
    setNotice("");
    try {
      const response = await companyFetch(`/api/tokens/${token.id}/open`, { method: "POST" });
      const body = await response.json() as Partial<IssuedToken> & { error?: { message?: string } };
      if (!response.ok || !body.token || !body.value || !body.url || !body.qrSvg || !body.qrPng) {
        setCardOpen(true);
        setDialogError(formatApiError(body.error, "Prístup sa nepodarilo otvoriť."));
        return;
      }
      const access = { token: body.token, value: body.value, url: body.url, qrSvg: body.qrSvg, qrPng: body.qrPng };
      if (token.type === "qr") setIssued(access);
      else setNfc(access);
      setCardOpen(true);
    } catch {
      setCardOpen(true);
      setDialogError("Prístup sa nepodarilo otvoriť. Skontrolujte pripojenie.");
    } finally {
      setAction(null);
    }
  }

  async function deactivateToken(token: Token, deactivationReason: string) {
    if (pending) return;
    setAction(token.type === "qr" ? "deactivate-qr" : "deactivate-nfc");
    setError("");
    setDialogError("");
    setNotice("");
    try {
      const response = await companyFetch(`/api/tokens/${token.id}/deactivate`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ reason: deactivationReason }),
      });
      const body = (await response.json()) as { error?: { message?: string } };
      if (!response.ok) {
        setDialogError(formatApiError(body.error, "Prístup sa nepodarilo deaktivovať."));
        return;
      }
      if (token.type === "qr") setIssued(null);
      else setNfc(null);
      setTokens((current) => current.map((item) => item.id === token.id ? { ...item, isActive: false,
        deactivatedAt: new Date().toISOString(), deactivationReason } : item));
      if (!(await refreshTokens())) {
        setDialogError("Prístup bol deaktivovaný, ale zoznam sa nepodarilo obnoviť.");
      }
    } catch {
      setDialogError("Požiadavku sa nepodarilo dokončiť. Skontrolujte pripojenie.");
    } finally {
      setAction(null);
    }
  }

  function submitCreate(event: SubmitEvent<HTMLFormElement>) {
    event.preventDefault();
    void createToken();
  }

  function closeIssuedDialog() {
    setIssued(null);
    setNfc(null);
    setCardOpen(false);
    setDialogError("");
    setNotice("");
  }

  async function copyUrl(url: string) {
    try {
      await navigator.clipboard.writeText(url);
      setDialogError("");
      setNotice("Odkaz je skopírovaný.");
    } catch {
      setDialogError("Odkaz sa nepodarilo skopírovať. Označte a skopírujte ho ručne.");
    }
  }

  async function shareUrl() {
    if (!issued) return;
    if (!navigator.share) {
      await copyUrl(issued.url);
      return;
    }
    try {
      await navigator.share({ title: `Partnerská karta ${partnerCode}`, url: issued.url });
      setDialogError("");
      setNotice("Odkaz bol odovzdaný na zdieľanie.");
    } catch (error) {
      if (error instanceof DOMException && error.name === "AbortError") return;
      setDialogError("Odkaz sa nepodarilo zdieľať. Použite kopírovanie odkazu.");
    }
  }

  function selectType(next: "qr" | "nfc", trigger: HTMLButtonElement) {
    if (!cardOpen) issuedTriggerRef.current = trigger;
    setType(next);
    setLabel("");
    setReason("");
    setConfirmedReplacement(false);
    setError("");
    setCreateOpen(true);
  }

  return (
    <section ref={sectionRef} tabIndex={-1} className="data-surface mt-5 rounded-xl p-5">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h2 className="text-lg font-semibold text-stone-950">Partnerská karta</h2>
          <p className="mt-1 text-sm text-stone-600">
            Jedna karta partnera na tlač, zdieľanie aj voliteľné použitie cez NFC.
            Nákupy a body zostávajú spoločné pre oba spôsoby použitia.
          </p>
        </div>
      </div>

      <div className="mt-5 flex flex-wrap items-center justify-between gap-4 rounded-xl border border-stone-200 p-4">
        <div className="text-sm text-stone-600">
          <p>{activeQr ? "QR pripravený na použitie" : "QR zatiaľ nie je vytvorený"}</p>
          <p className="mt-1">{activeNfc ? "NFC aktivované" : "NFC je voliteľné — aktivujete ho v karte"}</p>
        </div>
        <button data-card-action type="button" disabled={pending} aria-busy={pending && !cardOpen && !createOpen}
          className="min-h-11 rounded-lg bg-blue-600 px-5 py-2.5 text-sm font-semibold text-white hover:bg-blue-700 disabled:opacity-50"
          onClick={(event) => {
            if (activeQr) void openToken(activeQr, event.currentTarget);
            else if (activeNfc) { issuedTriggerRef.current = event.currentTarget; setCardOpen(true); }
            else selectType("qr", event.currentTarget);
          }}>
          <ActionLabel busy={pending && !cardOpen && !createOpen} pending={pendingText}>
            {activeQr || activeNfc ? "Otvoriť kartu" : "Vytvoriť kartu"}
          </ActionLabel>
        </button>
      </div>

      {createOpen ? createPortal(
        <div role="dialog" aria-modal="true" aria-labelledby="create-access-title"
          aria-describedby="create-access-description" aria-busy={pending}
          ref={issuedDialogRef} tabIndex={-1}
          className="fixed inset-0 z-[400] flex items-center justify-center overflow-y-auto bg-stone-950/60 p-4">
          <div className="data-surface my-auto w-full max-w-md rounded-xl p-5 sm:p-6">
            <div className="flex items-start justify-between gap-4">
              <h2 id="create-access-title" className="text-xl font-semibold">
                {activeOfType.length ? "Nahradiť" : "Vytvoriť"} {type === "qr" ? "kartu" : "NFC prístup"}
              </h2>
              <button type="button" aria-label="Zavrieť" ref={issuedCloseRef} disabled={pending}
                className="rounded-md px-2 py-1 text-stone-600 hover:bg-stone-100 disabled:opacity-50"
                onClick={() => { setCreateOpen(false); setError(""); }}>✕</button>
            </div>
            <p id="create-access-description" className="mt-2 text-sm text-stone-600">
              {activeOfType.length
                ? "Pôvodný prístup sa zneplatní až po úspešnom vytvorení nového. Nákupy a body zostanú zachované."
                : "Označenie môžete nechať prázdne. Po vytvorení sa zobrazí náhľad a detaily."}
            </p>
      <ValidatedForm className="mt-5 space-y-4" onSubmit={submitCreate}>
        <fieldset disabled={pending} className="space-y-4">
          <legend className="sr-only">Údaje {type.toUpperCase()} prístupu</legend>
        <label className="block text-sm font-medium text-stone-700">
          Označenie (voliteľné)
          <input
            className="mt-1.5 block w-full rounded-md border border-stone-300 px-3 py-2"
            name="label"
            maxLength={80}
            onChange={(event) => { setError(""); setLabel(event.target.value); }}
            value={label}
          />
        </label>
        <div className="space-y-3">
          {activeOfType.length > 0 ? (
            <label className="flex items-start gap-2 text-sm text-stone-700">
              <input
                checked={confirmedReplacement}
                className="mt-1"
                name="confirmReplacement"
                required
                onChange={(event) => { setError(""); setConfirmedReplacement(event.target.checked); }}
                type="checkbox"
              />
              Potvrdzujem nahradenie: pôvodný {type.toUpperCase()} prístup prestane fungovať.
            </label>
          ) : null}
          {activeOfType.length > 0 ? (
            <label className="block text-sm font-medium text-stone-700">
              Dôvod nahradenia *
              <input
                className="mt-1.5 block w-full rounded-md border border-stone-300 px-3 py-2"
                name="deactivationReason"
                maxLength={255}
                onChange={(event) => { setError(""); setReason(event.target.value); }}
                required
                value={reason}
              />
            </label>
          ) : null}
        </div>
        </fieldset>
        {error ? <p role="alert" className="text-sm text-red-700">{error}</p> : null}
        <div className="flex justify-center">
          <button
            className="min-h-11 min-w-40 rounded-lg bg-blue-600 px-6 py-2.5 text-sm font-semibold text-white hover:bg-blue-700 disabled:opacity-50"
            disabled={pending}
            aria-busy={action === "create"}
            type="submit"
          >
            <ActionLabel busy={action === "create"} pending="Vytváram prístup…">{activeOfType.length ? "Nahradiť" : "Vytvoriť"}</ActionLabel>
          </button>
        </div>
      </ValidatedForm>
          </div>
        </div>, document.body,
      ) : null}

      {tokens.some((token) => !token.isActive) ? (
        <details className="mt-6">
          <summary className="cursor-pointer text-sm font-medium">História deaktivovaných prístupov</summary>
          <div className="mt-3 overflow-x-auto">
          <table className="w-full min-w-[38rem] text-left text-sm">
            <thead className="border-b border-stone-200 text-xs uppercase tracking-wide text-stone-500">
              <tr>
                <th className="py-2 pr-4">Typ / označenie</th>
                <th className="py-2 pr-4">Token</th>
                <th className="py-2 pr-4">Stav</th>
                <th className="py-2 pr-4">Posledné použitie</th>
              </tr>
            </thead>
            <tbody>
              {tokens.filter((token) => !token.isActive).map((token) => (
                <TokenRow
                  key={token.id}
                  token={token}
                />
              ))}
            </tbody>
          </table>
          </div>
        </details>
      ) : null}

      {error && !createOpen && !cardOpen ? <p role="alert" className="mt-3 text-sm text-red-700">{error}</p> : null}

      {cardOpen && !createOpen ? createPortal(
        <div
          aria-labelledby="issued-token-title"
          aria-describedby="issued-token-description"
          aria-modal="true"
          aria-busy={pending}
          className="fixed inset-0 z-[400] flex items-center justify-center overflow-y-auto bg-stone-950/60 p-4"
          role="dialog"
          ref={issuedDialogRef}
          tabIndex={-1}
        >
          <div className="data-surface my-auto w-full min-w-0 max-w-4xl rounded-xl p-4 shadow-xl sm:p-6">
            <div className="flex items-start justify-between gap-4">
              <div>
                <h2 className="text-xl font-semibold text-stone-950" id="issued-token-title">
                  Partnerská karta
                </h2>
                <p className="mt-1 text-sm text-stone-600" id="issued-token-description">
                  {partnerName} · {partnerCode}. Kartu môžete kedykoľvek znovu otvoriť.
                </p>
              </div>
              <button
                aria-label="Zavrieť"
                className="rounded-md px-2 py-1 text-stone-600 hover:bg-stone-100"
                onClick={closeIssuedDialog}
                ref={issuedCloseRef}
                disabled={pending}
                type="button"
              >
                ✕
              </button>
            </div>
            {pending ? <p className="mt-4 text-sm text-stone-600"><ActionLabel busy pending={pendingText}>{null}</ActionLabel></p> : null}
            {issued ? <>
            <PartnerCardPreview
              partnerId={partnerId}
              token={issued.value}
              artwork={{ companyName, companyLogoUrl, partnerName, partnerCode, qrPng: issued.qrPng }}
            />
            <details className="mt-5 rounded-lg border border-stone-200 p-4">
              <summary className="cursor-pointer text-sm font-medium">Samostatný QR kód a odkaz</summary>
              <div className="mt-3 grid justify-items-center gap-3">
                <Image
                  alt={`QR kód partnera ${partnerCode}`}
                  className="h-auto w-56 max-w-full"
                  height={512}
                  src={issued.qrPng}
                  unoptimized
                  width={512}
                />
                <p className="font-semibold text-stone-900">{partnerName} · {partnerCode}</p>
                <p className="break-all text-center text-xs text-stone-600">{issued.url}</p>
              </div>
            </details>
            <div className="mt-4 flex flex-wrap gap-2">
              <a
                className="rounded-md border border-stone-300 px-3 py-2 text-sm font-medium text-stone-700 hover:bg-stone-50"
                download={`${partnerCode}-${issued.token.type}.png`}
                href={issued.qrPng}
              >
                Stiahnuť PNG
              </a>
              <a
                className="rounded-md border border-stone-300 px-3 py-2 text-sm font-medium text-stone-700 hover:bg-stone-50"
                download={`${partnerCode}-${issued.token.type}.svg`}
                href={`data:image/svg+xml;charset=utf-8,${encodeURIComponent(issued.qrSvg)}`}
              >
                Stiahnuť SVG
              </a>
              <button
                className="rounded-md border border-stone-300 px-3 py-2 text-sm font-medium text-stone-700 hover:bg-stone-50"
                onClick={() => void copyUrl(issued.url)}
                type="button"
              >
                Kopírovať odkaz
              </button>
              <button className="rounded-md border border-stone-300 px-3 py-2 text-sm font-medium text-stone-700 hover:bg-stone-50"
                onClick={() => void shareUrl()} type="button">Zdieľať odkaz</button>
              <a className="rounded-md border border-stone-300 px-3 py-2 text-sm font-medium text-stone-700 hover:bg-stone-50"
                href={issued.url} target="_blank" rel="noopener noreferrer">Otvoriť verejnú kartu</a>
            </div>
            </> : <div className="mt-5 rounded-xl border border-stone-200 p-4">
              <p className="text-sm text-stone-600">Na tlač a zdieľanie potrebujete QR prístup. NFC môže fungovať samostatne.</p>
              <button type="button" disabled={pending} aria-busy={action === "open-qr"} onClick={(event) => {
                if (activeQr) void openToken(activeQr, event.currentTarget);
                else selectType("qr", event.currentTarget);
              }} className="mt-3 rounded-lg bg-blue-600 px-4 py-2 text-sm font-semibold text-white">
                <ActionLabel busy={action === "open-qr"} pending="Načítavam QR náhľad…">{activeQr ? "Načítať QR náhľad" : "Vytvoriť QR prístup"}</ActionLabel>
              </button>
            </div>}
            <details className="mt-5 rounded-xl border border-stone-200 p-4">
              <summary className="cursor-pointer font-medium">Použiť aj ako NFC kartu</summary>
              <p className="mt-3 text-sm text-stone-600">
                NFC otvára tú istú verejnú kartu cez samostatný odkaz. Jeho zrušenie nezneplatní vytlačený QR.
              </p>
              {activeNfc ? nfc ? <>
                <label className="mt-3 block text-sm font-medium">URL na zápis NFC
                  <input readOnly value={nfc.url} className="mt-1 block w-full rounded-md border border-stone-300 px-3 py-2 text-xs" />
                </label>
                <div className="mt-3 flex flex-wrap gap-3">
                  <button type="button" onClick={() => void copyUrl(nfc.url)}
                    className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-semibold text-white">Kopírovať URL pre NFC</button>
                  <a href={nfc.url} target="_blank" rel="noopener noreferrer" className="rounded-lg border border-stone-300 px-4 py-2 text-sm">
                    Overiť NFC odkaz
                  </a>
                </div>
              </> : <button type="button" disabled={pending} aria-busy={action === "open-nfc"}
                onClick={(event) => void openToken(activeNfc, event.currentTarget)}
                className="mt-3 rounded-lg bg-blue-600 px-4 py-2 text-sm font-semibold text-white disabled:opacity-50">
                <ActionLabel busy={action === "open-nfc"} pending="Načítavam URL pre NFC…">Zobraziť URL pre NFC</ActionLabel>
              </button> : <button type="button" disabled={pending} onClick={(event) => selectType("nfc", event.currentTarget)}
                className="mt-3 rounded-lg bg-blue-600 px-4 py-2 text-sm font-semibold text-white disabled:opacity-50">
                Aktivovať NFC
              </button>}
              <p className="mt-4 text-sm leading-6 text-stone-600">
                Zapíšte skopírovanú URL na prázdnu kartu NTAG213/215 ako NDEF záznam typu URI.
                Na čip sa nezapisujú nákupy ani body. Po zápise overte otvorenie správnej karty a až potom
                čip uzamknite proti prepisu. Toto okno čip nezapisuje; potrebujete kompatibilný NFC zapisovač.
                V aplikácii na zápis (napr. NFC Tools) zvoľte Zápis → Pridať záznam → URL/URI,
                vložte celý NFC odkaz a zapíšte ho na čip.
              </p>
            </details>
            <details className="mt-5 rounded-xl border border-stone-200 p-4">
              <summary className="cursor-pointer font-medium">Správa prístupov</summary>
              <p className="mt-3 text-sm text-stone-600">Výmena alebo deaktivácia ovplyvní iba zvolený spôsob použitia, nie históriu partnera.</p>
              <div className="mt-3 grid gap-4 md:grid-cols-2">
                {(["qr", "nfc"] as const).map((accessType) =>
                  <AccessPanel key={accessType} type={accessType}
                    token={accessType === "qr" ? activeQr : activeNfc} pending={pending} deactivating={action === `deactivate-${accessType}`}
                    onDeactivate={deactivateToken} onReplace={(trigger) => selectType(accessType, trigger)} />,
                )}
              </div>
            </details>
            <p className="mt-4 text-sm leading-6 text-amber-800">
              Každý s týmto odkazom alebo QR kódom môže vidieť verejnú kartu vrátane histórie nákupov.
              Zdieľajte ich iba s oprávnenou osobou.
            </p>
            {dialogError ? <p role="alert" className="mt-3 text-sm text-red-700">{dialogError}</p> : null}
            {notice ? <p role="status" className="mt-3 text-sm text-stone-700">{notice}</p> : null}
            <div className="mt-5 flex justify-end">
              <button
                className="rounded-md bg-stone-950 px-4 py-2 text-sm font-semibold text-white"
                onClick={closeIssuedDialog}
                disabled={pending}
                type="button"
              >
                Hotovo a zavrieť
              </button>
            </div>
          </div>
        </div>,
        document.body,
      ) : null}
    </section>
  );
}

function TokenRow({ token }: { token: Token }) {
  return (
    <tr className="border-b border-stone-100 align-top">
      <td className="py-3 pr-4">
        <span className="font-medium text-stone-900">{token.type.toUpperCase()}</span>
        <span className="block text-stone-600">{token.label || "Bez označenia"}</span>
      </td>
      <td className="py-3 pr-4 font-mono text-xs text-stone-600">{token.tokenHint}…</td>
      <td className="py-3 pr-4">
        <span className={token.isActive ? "text-emerald-800" : "text-stone-500"}>
          {token.isActive ? "Aktívny" : "Deaktivovaný"}
        </span>
        {!token.isActive && token.deactivationReason ? (
          <span className="block max-w-48 text-xs text-stone-500">{token.deactivationReason}</span>
        ) : null}
        {token.deactivatedAt ? <span className="block text-xs text-stone-500">{formatDate(token.deactivatedAt)}</span> : null}
      </td>
      <td className="py-3 pr-4 text-stone-600">
        {token.lastUsedAt ? formatDate(token.lastUsedAt) : "—"}
      </td>
    </tr>
  );
}

function AccessPanel({ type, token, pending, deactivating, onDeactivate, onReplace }: {
  type: "qr" | "nfc";
  token: Token | undefined;
  pending: boolean;
  deactivating: boolean;
  onDeactivate: (token: Token, reason: string) => Promise<void>;
  onReplace: (trigger: HTMLButtonElement) => void;
}) {
  const [reason, setReason] = useState("");
  return <article aria-label={`${type.toUpperCase()} prístup`} className="min-w-0 rounded-xl border border-stone-200 p-4">
    <h3 className="font-semibold">{type === "qr" ? "QR prístup" : "NFC prístup"}</h3>
    <p className={`mt-2 text-sm ${token ? "text-emerald-800" : "text-stone-600"}`}>
      {token ? "Aktívny prístup" : "Žiadny aktívny prístup"}
    </p>
    {token ? <>
      <p className="mt-2 break-words text-sm text-stone-600">{token.label || "Bez označenia"} · {token.tokenHint}…</p>
      <p className="mt-1 text-xs text-stone-500">Vydaný {formatDate(token.createdAt)}</p>
      <p className="mt-1 text-xs text-stone-500">Posledné použitie: {token.lastUsedAt ? formatDate(token.lastUsedAt) : "zatiaľ nepoužitý"}</p>
      <div className="mt-3 flex flex-wrap gap-3">
        <button type="button" disabled={pending} onClick={(event) => onReplace(event.currentTarget)}
          className="text-sm font-medium text-stone-700 disabled:opacity-50">Nahradiť novým</button>
      </div>
      <details className="mt-4">
        <summary className="cursor-pointer text-sm text-red-800">Deaktivovať {type.toUpperCase()}</summary>
        <ValidatedForm className="mt-3 space-y-2" onSubmit={(event) => {
          event.preventDefault();
          void onDeactivate(token, reason.trim());
        }}>
          <label className="block text-sm">Dôvod deaktivácie {type.toUpperCase()}
            <input name="reason" required maxLength={255} value={reason}
              onChange={(event) => setReason(event.target.value)}
              className="mt-1 block w-full rounded-md border border-stone-300 px-2 py-1.5 text-sm" />
          </label>
          <p className="text-xs text-stone-600">Tento prístup prestane fungovať. Nákupy, body a druhý typ prístupu zostanú zachované.</p>
          <button type="submit" disabled={pending} aria-busy={deactivating}
            className="text-sm font-semibold text-red-800 disabled:opacity-50">
            <ActionLabel busy={deactivating} pending={`Deaktivujem ${type.toUpperCase()} prístup…`}>Potvrdiť deaktiváciu {type.toUpperCase()}</ActionLabel></button>
        </ValidatedForm>
      </details>
    </> : <div className="mt-4 flex justify-center">
      <button type="button" disabled={pending} onClick={(event) => onReplace(event.currentTarget)}
        className="min-h-11 rounded-lg bg-blue-600 px-5 py-2.5 text-sm font-semibold text-white hover:bg-blue-700 disabled:opacity-50">
        {type === "qr" ? "Vytvoriť QR prístup" : "Aktivovať NFC prístup"}
      </button>
    </div>}
  </article>;
}

function formatDate(value: string) {
  return new Intl.DateTimeFormat("sk-SK", {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(new Date(value));
}
