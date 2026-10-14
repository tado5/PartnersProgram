"use client";

import { BrowserQRCodeReader } from "@zxing/browser";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ChevronRight, Nfc, QrCode, UserSearch } from "lucide-react";
import { useEffect, useRef, useState, useSyncExternalStore } from "react";

import { useCompanyApi } from "@/components/company-context";

type NdefRecord = { recordType: string; data: DataView };
type NdefEvent = Event & { message: { records: NdefRecord[] } };
type NdefReaderLike = {
  scan(options?: { signal?: AbortSignal }): Promise<void>;
  addEventListener(type: "reading", listener: (event: NdefEvent) => void): void;
  addEventListener(type: "readingerror", listener: () => void): void;
};
type NdefReaderConstructor = new () => NdefReaderLike;

const subscribeNfc = () => () => {};
const getNfcSupport = () =>
  Boolean((window as Window & { NDEFReader?: NdefReaderConstructor }).NDEFReader);
const getNfcServerSnapshot = () => false;

export function PurchaseScanner() {
  const router = useRouter();
  const { companyFetch } = useCompanyApi();
  const videoRef = useRef<HTMLVideoElement>(null);
  const scannerRef = useRef<Awaited<ReturnType<BrowserQRCodeReader["decodeFromVideoDevice"]>> | null>(null);
  const nfcAbortRef = useRef<AbortController | null>(null);
  const resolvingRef = useRef(false);
  const [message, setMessage] = useState("");
  const [cameraActive, setCameraActive] = useState(false);
  const nfcSupported = useSyncExternalStore(subscribeNfc, getNfcSupport, getNfcServerSnapshot);

  const Reader = typeof window === "undefined"
    ? undefined
    : (window as Window & { NDEFReader?: NdefReaderConstructor }).NDEFReader;

  useEffect(() => {
    return () => {
      scannerRef.current?.stop();
      nfcAbortRef.current?.abort();
    };
  }, []);

  async function resolveScan(value: string, source: "qr" | "nfc") {
    if (resolvingRef.current) return;
    resolvingRef.current = true;
    setMessage("");
    try {
      const token = tokenFromScan(value);
      if (!token) {
        throw new Error("Tento QR kód alebo NFC záznam nie je platnou kartou partnera.");
      }
      const response = await companyFetch("/api/scan/resolve", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token }),
      });
      const body = await response.json();
      if (!response.ok) throw new Error(body.error?.message ?? "Kartu sa nepodarilo overiť.");
      router.push(`/app/nakupy/novy?partner=${encodeURIComponent(body.partnerId)}&source=${source}&tokenId=${encodeURIComponent(body.tokenId)}`);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Skenovanie sa nepodarilo.");
      resolvingRef.current = false;
      stopCamera();
    }
  }

  async function startCamera() {
    setMessage("");
    if (!videoRef.current) return;
    try {
      const reader = new BrowserQRCodeReader();
      scannerRef.current = await reader.decodeFromVideoDevice(undefined, videoRef.current, (result) => {
        if (result) void resolveScan(result.getText(), "qr");
      });
      setCameraActive(true);
    } catch {
      setMessage("Kameru sa nepodarilo spustiť. Overte povolenie kamery a použite HTTPS.");
      stopCamera();
    }
  }

  function stopCamera() {
    scannerRef.current?.stop();
    scannerRef.current = null;
    setCameraActive(false);
  }

  async function startNfc() {
    setMessage("");
    if (!Reader) {
      setMessage("Tento prehliadač nepodporuje Web NFC. Použite QR alebo ručné vyhľadanie.");
      return;
    }
    const controller = new AbortController();
    try {
      const reader = new Reader();
      nfcAbortRef.current?.abort();
      nfcAbortRef.current = controller;
      reader.addEventListener("reading", (event) => {
        const record = event.message.records.find((item) => item.recordType === "url");
        if (record) void resolveScan(decodeNdefUrl(record.data), "nfc");
        else setMessage("NFC karta neobsahuje URL záznam.");
      });
      reader.addEventListener("readingerror", () => setMessage("NFC kartu sa nepodarilo prečítať."));
      await reader.scan({ signal: controller.signal });
      setMessage("Priložte NFC kartu k telefónu.");
    } catch {
      if (!controller.signal.aborted) setMessage("NFC skenovanie sa nepodarilo spustiť.");
    }
  }

  return (
    <section className="mx-auto max-w-6xl">
      <p className="text-sm font-semibold uppercase tracking-[0.16em] text-amber-800">Zápis nákupu</p>
      <h1 className="mt-3 text-3xl font-semibold tracking-tight text-stone-950 lg:text-4xl">Vyberte partnera</h1>
      <p className="mt-2 max-w-2xl leading-7 text-stone-600">Naskenujte QR kód alebo priložte NFC kartu partnera.</p>
      <div className="mt-6 grid gap-5 lg:grid-cols-2">
        <section className="flex flex-col rounded-2xl border border-stone-200 bg-white p-5 shadow-sm sm:p-7">
          <div className="flex items-center gap-3">
            <span className="grid size-12 place-items-center rounded-xl bg-stone-950 text-white"><QrCode aria-hidden className="size-6" /></span>
            <div>
              <h2 className="text-xl font-semibold text-stone-950">QR kód</h2>
              <p className="text-sm text-stone-500">Kamera telefónu alebo počítača</p>
            </div>
          </div>
          <video ref={videoRef} className="mt-5 aspect-[4/3] w-full rounded-xl bg-stone-950 object-cover" playsInline muted />
          <div className="mt-5">
            {!cameraActive ? (
              <button type="button" onClick={() => void startCamera()} className={`${primaryButton} w-full`}>
                Zapnúť kameru
              </button>
            ) : (
              <button type="button" onClick={stopCamera} className={`${secondaryButton} w-full`}>Zastaviť kameru</button>
            )}
          </div>
          <p className="mt-3 text-xs leading-5 text-stone-500">Skenovanie kamerou vyžaduje povolenie kamery a v produkcii HTTPS.</p>
        </section>
        <section className="flex flex-col rounded-2xl border border-stone-200 bg-white p-5 shadow-sm sm:p-7">
          <div className="flex items-center gap-3">
            <span className="grid size-12 place-items-center rounded-xl bg-amber-800 text-white"><Nfc aria-hidden className="size-6" /></span>
            <div>
              <h2 className="text-xl font-semibold text-stone-950">NFC karta</h2>
              <p className="text-sm text-stone-500">Priloženie karty k telefónu</p>
            </div>
          </div>
          <div className="mt-5 grid aspect-[4/3] w-full place-items-center rounded-xl border-2 border-dashed border-stone-200 bg-stone-50 p-6 text-center">
            <div>
              <Nfc aria-hidden className={`mx-auto size-20 ${nfcSupported ? "text-amber-800" : "text-stone-300"}`} />
              <p className="mt-4 text-sm leading-6 text-stone-600">
                {nfcSupported ? "Web NFC je dostupné. Spustite čítanie a priložte kartu." : "NFC skenovanie nie je v tomto prehliadači dostupné (funguje v Chrome na Androide)."}
              </p>
            </div>
          </div>
          <div className="mt-5">
            <button type="button" disabled={!nfcSupported} onClick={() => void startNfc()} className={`${primaryButton} w-full disabled:cursor-not-allowed disabled:bg-stone-300`}>
              Načítať NFC
            </button>
          </div>
          <p className="mt-3 text-xs leading-5 text-stone-500">Ak NFC nie je dostupné, použite QR kód alebo zápis bez karty.</p>
        </section>
      </div>
      {message ? <p role="status" className="mt-4 rounded-md bg-amber-50 p-3 text-sm text-stone-800">{message}</p> : null}
      <Link
        className="mt-5 flex min-h-16 items-center gap-4 rounded-2xl border border-stone-200 bg-white p-5 shadow-sm hover:border-amber-300 hover:bg-amber-50"
        href="/app/nakupy/manualne"
      >
        <span className="grid size-12 shrink-0 place-items-center rounded-xl bg-stone-100 text-stone-700"><UserSearch aria-hidden className="size-6" /></span>
        <span className="min-w-0 flex-1">
          <span className="block font-semibold text-stone-950">Partner nemá kartu?</span>
          <span className="block text-sm text-stone-600">Vyhľadajte ho v zozname a zapíšte nákup ručne.</span>
        </span>
        <ChevronRight aria-hidden className="size-5 shrink-0 text-stone-400" />
      </Link>
      <Link className="mt-6 inline-block text-sm font-medium text-amber-800 underline" href="/app">Späť na úvod</Link>
    </section>
  );
}

function decodeNdefUrl(data: DataView) {
  const bytes = new Uint8Array(data.buffer, data.byteOffset, data.byteLength);
  const prefixes: Record<number, string> = {
    0x00: "", 0x01: "http://www.", 0x02: "https://www.",
    0x03: "http://", 0x04: "https://",
  };
  const prefix = prefixes[bytes[0]];
  return prefix === undefined ? new TextDecoder().decode(bytes) : prefix + new TextDecoder().decode(bytes.slice(1));
}

function tokenFromScan(value: string) {
  if (/^[A-Za-z0-9_-]{43}$/.test(value)) return value;
  try {
    const url = new URL(value);
    if (url.origin !== window.location.origin || url.search || url.hash) return null;
    const match = /^\/k\/([A-Za-z0-9_-]{43})\/?$/.exec(url.pathname);
    return match?.[1] ?? null;
  } catch {
    return null;
  }
}

const primaryButton = "min-h-12 rounded-lg bg-stone-950 px-5 py-3 text-base font-semibold text-white hover:bg-stone-800";
const secondaryButton = "min-h-12 rounded-lg border border-stone-300 px-5 py-3 text-base font-semibold text-stone-700 hover:bg-stone-100";
