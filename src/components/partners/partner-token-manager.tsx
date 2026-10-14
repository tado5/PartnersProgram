"use client";

import Image from "next/image";
import { useState } from "react";
import { useCompanyApi } from "@/components/company-context";

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
  initialTokens,
}: {
  partnerId: string;
  partnerName: string;
  partnerCode: string;
  initialTokens: Token[];
}) {
  const { companyFetch } = useCompanyApi();
  const [tokens, setTokens] = useState(initialTokens);
  const [type, setType] = useState<"qr" | "nfc">("qr");
  const [label, setLabel] = useState("");
  const [replaceExisting, setReplaceExisting] = useState(true);
  const [reason, setReason] = useState("");
  const [issued, setIssued] = useState<IssuedToken | null>(null);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState("");
  const activeOfType = tokens.filter((token) => token.isActive && token.type === type);

  async function refreshTokens() {
    const response = await companyFetch(`/api/partners/${partnerId}/tokens`, {
      cache: "no-store",
    });
    if (!response.ok) return false;
    const body = (await response.json()) as { tokens: Token[] };
    setTokens(body.tokens);
    return true;
  }

  async function createToken() {
    setPending(true);
    setError("");
    try {
      const response = await companyFetch(`/api/partners/${partnerId}/tokens`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          type,
          label: label.trim() || undefined,
          deactivateTokenIds: replaceExisting
            ? activeOfType.map((token) => token.id)
            : [],
          ...(replaceExisting && activeOfType.length
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
        setError(body.error?.message ?? "Token sa nepodarilo vytvoriť.");
        return;
      }
      setIssued({
        token: body.token,
        value: body.value,
        url: body.url,
        qrSvg: body.qrSvg,
        qrPng: body.qrPng,
      });
      setLabel("");
      setReason("");
      if (!(await refreshTokens())) {
        setError("Token bol vytvorený, ale zoznam sa nepodarilo obnoviť.");
      }
    } catch {
      setError("Požiadavku sa nepodarilo dokončiť. Skontrolujte pripojenie.");
    } finally {
      setPending(false);
    }
  }

  async function deactivateToken(token: Token, deactivationReason: string) {
    setPending(true);
    setError("");
    try {
      const response = await companyFetch(`/api/tokens/${token.id}/deactivate`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ reason: deactivationReason }),
      });
      const body = (await response.json()) as { error?: { message?: string } };
      if (!response.ok) {
        setError(body.error?.message ?? "Token sa nepodarilo deaktivovať.");
        return;
      }
      if (!(await refreshTokens())) {
        setError("Token bol deaktivovaný, ale zoznam sa nepodarilo obnoviť.");
      }
    } catch {
      setError("Požiadavku sa nepodarilo dokončiť. Skontrolujte pripojenie.");
    } finally {
      setPending(false);
    }
  }

  function closeIssuedDialog() {
    setIssued(null);
  }

  async function copyUrl() {
    if (!issued) return;
    try {
      await navigator.clipboard.writeText(issued.url);
      setError("");
    } catch {
      setError("URL sa nepodarilo skopírovať. Označte a skopírujte ju ručne.");
    }
  }

  function printCard() {
    if (!issued) return;
    const printWindow = window.open("", "_blank");
    if (!printWindow) {
      setError("Pre tlač povoľte v prehliadači vyskakovacie okná.");
      return;
    }
    printWindow.opener = null;
    printWindow.onload = () => printWindow.print();
    printWindow.document.write(`<!doctype html><html lang="sk"><head><meta charset="utf-8"><title>${escapeHtml(partnerName)} - ${escapeHtml(partnerCode)}</title><style>body{font-family:Arial,sans-serif;text-align:center;padding:32px}img{width:250px;height:250px}.code{font-size:20px;font-weight:bold}.name{font-size:18px}</style></head><body><img alt="QR karta" src="${issued.qrPng}"><p class="name">${escapeHtml(partnerName)}</p><p class="code">${escapeHtml(partnerCode)}</p></body></html>`);
    printWindow.document.close();
  }

  return (
    <section className="mt-5 rounded-xl border border-stone-200 bg-white p-5">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h2 className="text-lg font-semibold text-stone-950">QR a NFC tokeny</h2>
          <p className="mt-1 text-sm text-stone-600">
            Plný token sa zobrazí iba po vytvorení. Neskôr sa dá vytvoriť nový.
          </p>
        </div>
        <div className="flex gap-2">
          <button
            className={`rounded-md px-3 py-2 text-sm font-medium ${type === "qr" ? "bg-stone-950 text-white" : "border border-stone-300 text-stone-700"}`}
            onClick={() => setType("qr")}
            type="button"
          >
            Nový QR
          </button>
          <button
            className={`rounded-md px-3 py-2 text-sm font-medium ${type === "nfc" ? "bg-stone-950 text-white" : "border border-stone-300 text-stone-700"}`}
            onClick={() => setType("nfc")}
            type="button"
          >
            Nový NFC
          </button>
        </div>
      </div>

      <div className="mt-4 grid gap-4 sm:grid-cols-[minmax(0,1fr)_minmax(14rem,0.8fr)]">
        <label className="block text-sm font-medium text-stone-700">
          Označenie (voliteľné)
          <input
            className="mt-1.5 block w-full rounded-md border border-stone-300 px-3 py-2"
            maxLength={80}
            onChange={(event) => setLabel(event.target.value)}
            value={label}
          />
        </label>
        <div className="space-y-3">
          {activeOfType.length > 0 ? (
            <label className="flex items-start gap-2 text-sm text-stone-700">
              <input
                checked={replaceExisting}
                className="mt-1"
                onChange={(event) => setReplaceExisting(event.target.checked)}
                type="checkbox"
              />
              Deaktivovať pôvodné aktívne {type === "qr" ? "QR kódy" : "NFC tokeny"}
            </label>
          ) : null}
          {replaceExisting && activeOfType.length > 0 ? (
            <label className="block text-sm font-medium text-stone-700">
              Dôvod deaktivácie *
              <input
                className="mt-1.5 block w-full rounded-md border border-stone-300 px-3 py-2"
                maxLength={255}
                onChange={(event) => setReason(event.target.value)}
                required
                value={reason}
              />
            </label>
          ) : null}
          <button
            className="rounded-md bg-amber-800 px-4 py-2.5 text-sm font-semibold text-white hover:bg-amber-900 disabled:opacity-50"
            disabled={pending || (replaceExisting && activeOfType.length > 0 && !reason.trim())}
            onClick={() => void createToken()}
            type="button"
          >
            Vygenerovať {type === "qr" ? "QR" : "NFC"}
          </button>
        </div>
      </div>

      {tokens.length ? (
        <div className="mt-6 overflow-x-auto">
          <table className="w-full min-w-[38rem] text-left text-sm">
            <thead className="border-b border-stone-200 text-xs uppercase tracking-wide text-stone-500">
              <tr>
                <th className="py-2 pr-4">Typ / označenie</th>
                <th className="py-2 pr-4">Token</th>
                <th className="py-2 pr-4">Stav</th>
                <th className="py-2 pr-4">Posledné použitie</th>
                <th className="py-2">Akcia</th>
              </tr>
            </thead>
            <tbody>
              {tokens.map((token) => (
                <TokenRow
                  key={token.id}
                  onDeactivate={deactivateToken}
                  pending={pending}
                  token={token}
                />
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <p className="mt-5 text-sm text-stone-500">Partner zatiaľ nemá žiadny token.</p>
      )}

      {error ? <p aria-live="polite" className="mt-3 text-sm text-red-700">{error}</p> : null}

      {issued ? (
        <div
          aria-labelledby="issued-token-title"
          aria-modal="true"
          className="fixed inset-0 z-50 flex items-center justify-center overflow-y-auto bg-stone-950/60 p-4"
          role="dialog"
        >
          <div className="my-auto w-full max-w-lg rounded-xl bg-white p-6 shadow-xl">
            <div className="flex items-start justify-between gap-4">
              <div>
                <h2 className="text-xl font-semibold text-stone-950" id="issued-token-title">
                  Token je vytvorený
                </h2>
                <p className="mt-1 text-sm text-stone-600">
                  Po zatvorení sa QR nedá znova zobraziť.
                </p>
              </div>
              <button
                aria-label="Zavrieť"
                className="rounded-md px-2 py-1 text-stone-600 hover:bg-stone-100"
                onClick={closeIssuedDialog}
                type="button"
              >
                ✕
              </button>
            </div>
            <div className="mt-5 grid justify-items-center gap-3 rounded-lg border border-stone-200 p-4">
              <Image
                alt={`QR kód partnera ${partnerCode}`}
                className="h-56 w-56"
                height={512}
                src={issued.qrPng}
                unoptimized
                width={512}
              />
              <p className="font-semibold text-stone-900">{partnerName} · {partnerCode}</p>
              <p className="break-all text-center text-xs text-stone-600">{issued.url}</p>
            </div>
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
                onClick={printCard}
                type="button"
              >
                Tlačiť kartu
              </button>
              <button
                className="rounded-md border border-stone-300 px-3 py-2 text-sm font-medium text-stone-700 hover:bg-stone-50"
                onClick={() => void copyUrl()}
                type="button"
              >
                Kopírovať URL pre NFC
              </button>
            </div>
            {issued.token.type === "nfc" ? (
              <p className="mt-4 text-sm leading-6 text-stone-600">
                Zapíšte skopírovanú URL na prázdnu kartu NTAG213/215 ako NDEF URL záznam.
                Po zápise overte kartu a uzamknite ju proti prepisu. Zápis vyžaduje
                kompatibilný NFC zapisovač; QR kód zostáva dostupnou alternatívou.
              </p>
            ) : null}
            <div className="mt-5 flex items-center justify-between gap-3">
              <button
                className="text-sm font-medium text-amber-800 hover:text-amber-950"
                onClick={() => {
                  setError("");
                  void navigator.clipboard.writeText(issued.value).catch(() => {
                    setError("Token sa nepodarilo skopírovať.");
                  });
                }}
                type="button"
              >
                Kopírovať plný token
              </button>
              <button
                className="rounded-md bg-stone-950 px-4 py-2 text-sm font-semibold text-white"
                onClick={closeIssuedDialog}
                type="button"
              >
                Hotovo a zavrieť
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </section>
  );
}

function TokenRow({
  token,
  pending,
  onDeactivate,
}: {
  token: Token;
  pending: boolean;
  onDeactivate: (token: Token, reason: string) => Promise<void>;
}) {
  const [reason, setReason] = useState("");
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
      </td>
      <td className="py-3 pr-4 text-stone-600">
        {token.lastUsedAt ? formatDate(token.lastUsedAt) : "—"}
      </td>
      <td className="py-3">
        {token.isActive ? (
          <div className="min-w-40 space-y-2">
            <input
              aria-label={`Dôvod deaktivácie tokenu ${token.tokenHint}`}
              className="w-full rounded-md border border-stone-300 px-2 py-1.5 text-xs"
              maxLength={255}
              onChange={(event) => setReason(event.target.value)}
              placeholder="Dôvod deaktivácie"
              value={reason}
            />
            <button
              className="text-xs font-semibold text-red-800 disabled:opacity-50"
              disabled={pending || !reason.trim()}
              onClick={() => void onDeactivate(token, reason.trim())}
              type="button"
            >
              Deaktivovať
            </button>
          </div>
        ) : null}
      </td>
    </tr>
  );
}

function formatDate(value: string) {
  return new Intl.DateTimeFormat("sk-SK", {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(new Date(value));
}

function escapeHtml(value: string) {
  return value.replace(/[&<>"']/g, (character) => {
    const entities: Record<string, string> = {
      "&": "&amp;",
      "<": "&lt;",
      ">": "&gt;",
      '"': "&quot;",
      "'": "&#39;",
    };
    return entities[character];
  });
}
