"use client";

import { useEffect, useRef, useState } from "react";

interface InstallPromptEvent extends Event {
  prompt(): Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
}

function isInstallPrompt(event: Event): event is InstallPromptEvent {
  return "prompt" in event && typeof event.prompt === "function" && "userChoice" in event;
}

export function PwaInstall() {
  const prompt = useRef<InstallPromptEvent | null>(null);
  const [installed, setInstalled] = useState(false);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");

  useEffect(() => {
    const display = window.matchMedia("(display-mode: standalone)");
    const updateInstalled = () => {
      const standalone = "standalone" in navigator && navigator.standalone === true;
      setInstalled(display.matches || standalone);
    };
    const onPrompt = (event: Event) => {
      if (isInstallPrompt(event)) {
        event.preventDefault();
        prompt.current = event;
      }
    };
    const onInstalled = () => {
      prompt.current = null;
      setInstalled(true);
      setMessage("Aplikácia bola nainštalovaná. Otvorte ju ikonou na ploche.");
    };
    updateInstalled();
    window.addEventListener("beforeinstallprompt", onPrompt);
    window.addEventListener("appinstalled", onInstalled);
    display.addEventListener("change", updateInstalled);
    if ("serviceWorker" in navigator && window.isSecureContext) {
      navigator.serviceWorker.register("/sw.js", { scope: "/", updateViaCache: "none" })
        .catch(() => {
          console.error("PWA service worker registration failed.");
          setMessage("Príprava inštalácie zlyhala. Obnovte stránku a skúste znova.");
        });
    }
    return () => {
      window.removeEventListener("beforeinstallprompt", onPrompt);
      window.removeEventListener("appinstalled", onInstalled);
      display.removeEventListener("change", updateInstalled);
    };
  }, []);

  async function installAndroid() {
    const event = prompt.current;
    if (!event) {
      setMessage("Android: otvorte stránku v Chrome. V ponuke ⋮ vyberte „Nainštalovať aplikáciu“ alebo „Pridať na plochu“. Ak možnosť chýba, chvíľu počkajte alebo obnovte stránku. Aplikácia potrebuje internet.");
      return;
    }
    prompt.current = null;
    setBusy(true);
    try {
      await event.prompt();
      const choice = await event.userChoice;
      setMessage(choice.outcome === "accepted"
        ? "Inštalácia bola potvrdená. Po dokončení otvorte aplikáciu ikonou na ploche."
        : "Inštalácia bola zrušená. Môžete ju zopakovať cez ponuku prehliadača.");
    } catch {
      console.error("PWA install prompt failed.");
      setMessage("Inštaláciu sa nepodarilo otvoriť. Skúste ponuku Chrome → Nainštalovať aplikáciu.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="w-full">
      {installed ? (
        <p role="status" className="text-white/70">PartnersProgram je otvorený ako aplikácia.</p>
      ) : (
        <div className="flex flex-wrap items-center gap-x-5 gap-y-2">
          <span className="text-white/60">Aplikácia do telefónu:</span>
          <button type="button" disabled={busy} onClick={installAndroid}
            className="min-h-11 text-white/80 underline underline-offset-4 hover:text-white disabled:opacity-50">
            {busy ? "Otváram inštaláciu…" : "Nainštalovať pre Android"}
          </button>
          <button type="button"
            onClick={() => setMessage("iPhone / iPad: otvorte túto stránku v Safari, klepnite na Zdieľať → Pridať na plochu → Pridať. Ak sa zobrazí „Otvoriť ako webovú aplikáciu“, nechajte túto možnosť zapnutú. Potom otvorte PartnersProgram ikonou na ploche. Aplikácia potrebuje internet.")}
            className="min-h-11 text-white/80 underline underline-offset-4 hover:text-white">
            Nainštalovať pre iOS
          </button>
        </div>
      )}
      <p role="status" aria-live="polite" className={message ? "mt-2 max-w-2xl text-sm leading-6 text-white/70" : "sr-only"}>{message}</p>
    </div>
  );
}
