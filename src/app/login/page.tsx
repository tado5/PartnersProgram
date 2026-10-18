import { ArrowLeft, ArrowUpRight, LockKeyhole, ShieldCheck } from "lucide-react";
import { headers } from "next/headers";
import Link from "next/link";

import { LoginForm } from "@/components/auth/login-form";
import { env } from "@/lib/env";

type LoginPageProps = {
  searchParams: Promise<{
    callbackUrl?: string | string[];
    passwordChanged?: string;
  }>;
};

export const instant = false;

function safeCallbackUrl(value: string | string[] | undefined) {
  if (
    typeof value === "string" &&
    value.startsWith("/") &&
    !value.startsWith("//") &&
    !value.includes("\\")
  ) {
    return value;
  }
  return undefined;
}

export default async function LoginPage({ searchParams }: LoginPageProps) {
  const [{ callbackUrl, passwordChanged }, requestHeaders] = await Promise.all([
    searchParams,
    headers(),
  ]);
  const hostname = requestHeaders.get("host")?.split(":")[0]?.toLowerCase();
  const showLocalQuickLogin =
    env.NODE_ENV === "development" &&
    env.LOCAL_QUICK_LOGIN_ENABLED &&
    (hostname === "localhost" || hostname === "127.0.0.1" || hostname === "[::1]");

  return (
    <main className="relative isolate flex min-h-[100dvh] flex-col overflow-hidden px-4 sm:px-6">
      <div aria-hidden="true" className="pointer-events-none absolute inset-0 -z-10 overflow-hidden">
        <div className="absolute -left-48 top-1/4 size-[32rem] rounded-full bg-primary/20 blur-[120px]" />
        <div className="absolute -right-48 bottom-0 size-[34rem] rounded-full bg-secondary/20 blur-[130px]" />
      </div>

      <header className="mx-auto flex w-full max-w-7xl items-center justify-between py-5 sm:py-7">
        <Link href="/" className="flex items-center gap-3">
          <span aria-hidden="true" className="flex size-10 items-center justify-center rounded-xl border border-white/20 bg-white/10 text-lg font-bold text-white">
            P
          </span>
          <span className="font-semibold tracking-tight text-white">
            Partners<span className="text-primary">Program</span>
          </span>
        </Link>
        <Link href="/" aria-label="Späť na úvod" className="inline-flex min-h-10 items-center gap-2 rounded-lg px-3 text-sm font-medium text-white/70 transition hover:bg-white/10 hover:text-white">
          <ArrowLeft aria-hidden="true" className="size-4" />
          <span className="hidden sm:inline">Späť na úvod</span>
        </Link>
      </header>

      <div className="mx-auto grid w-full max-w-7xl flex-1 items-center gap-10 py-8 lg:grid-cols-[1fr_0.85fr] lg:gap-20 lg:py-12">
        <section className="hidden max-w-xl lg:block" aria-labelledby="login-welcome">
          <p className="text-xs font-semibold tracking-[0.14em] text-white/55">BEZPEČNÝ PRÍSTUP</p>
          <h2 id="login-welcome" className="mt-4 text-4xl font-bold leading-tight tracking-tight text-white xl:text-5xl">
            Váš partnerský program. Váš prehľad.
          </h2>
          <p className="mt-5 max-w-lg text-lg leading-8 text-white/70">
            Prihláste sa do aplikácie PartnersProgram a pokračujte v správe firemného programu.
          </p>
          <div className="glass-surface mt-9 flex max-w-md items-start gap-4 rounded-2xl p-5">
            <span className="flex size-11 shrink-0 items-center justify-center rounded-xl border border-primary/35 bg-primary/10">
              <ShieldCheck aria-hidden="true" className="size-5 text-primary" />
            </span>
            <div>
              <h2 className="font-semibold text-white">Účet vytvorený správcom</h2>
              <p className="mt-1 text-sm leading-6 text-white/65">
                Prístupové údaje vám poskytne správca vašej firmy.
              </p>
            </div>
          </div>
        </section>

        <section aria-labelledby="login-title" className="data-surface mx-auto w-full max-w-lg rounded-3xl p-6 shadow-[0_24px_80px_rgba(0,0,0,0.3)] sm:p-9">
          <div className="mb-7 flex size-12 items-center justify-center rounded-2xl border border-primary/35 bg-primary/10 text-primary">
            <LockKeyhole aria-hidden="true" className="size-5" />
          </div>
          <p className="text-xs font-semibold tracking-[0.14em] text-white/85">VÍTAJTE SPÄŤ</p>
          <h1 id="login-title" className="mt-2 text-3xl font-bold tracking-tight text-white">
            Prihlásenie
          </h1>
          <p className="mt-2 text-sm leading-6 text-white/70">
            Prihláste sa účtom, ktorý vám vytvoril správca.
          </p>
          {passwordChanged === "1" ? (
            <p role="status" className="mt-5 rounded-xl border border-[color:var(--color-teal)]/40 bg-[color:var(--color-teal)]/15 p-3 text-sm text-white">
              Heslo bolo zmenené. Prihláste sa novým heslom.
            </p>
          ) : null}
          <LoginForm
            callbackUrl={safeCallbackUrl(callbackUrl)}
            showLocalQuickLogin={showLocalQuickLogin}
          />
          {showLocalQuickLogin ? (
            <section className="mt-8 border-t border-white/15 pt-6">
              <h3 className="text-sm font-semibold text-white">Rýchle prihlásenie</h3>
              <p className="mt-1 text-xs leading-5 text-white/60">
                Iba na lokálne testovanie. Vyberte testovaciu rolu.
              </p>
              <div className="mt-4 grid grid-cols-2 gap-3">
                <button
                  className="col-span-2 min-h-11 rounded-lg border border-secondary/40 bg-secondary/15 px-3 py-2.5 text-sm font-medium text-white transition hover:bg-secondary/25"
                  form="local-quick-login-superadmin"
                  type="submit"
                >
                  Superadmin test
                </button>
                <button
                  className="min-h-11 rounded-lg border border-white/20 bg-white/5 px-3 py-2.5 text-sm font-medium text-white transition hover:bg-white/10"
                  form="local-quick-login-admin"
                  type="submit"
                >
                  Admin test
                </button>
                <button
                  className="min-h-11 rounded-lg border border-white/20 bg-white/5 px-3 py-2.5 text-sm font-medium text-white transition hover:bg-white/10"
                  form="local-quick-login-seller"
                  type="submit"
                >
                  Predavač test
                </button>
              </div>
            </section>
          ) : null}
          <p className="mt-7 border-t border-white/12 pt-5 text-xs leading-5 text-white/55">
            Nemáte prístup? Požiadajte správcu programu o vytvorenie účtu.
          </p>
        </section>
      </div>

      <footer className="mx-auto flex w-full max-w-7xl flex-wrap items-center justify-between gap-3 border-t border-white/12 py-5 text-xs text-white/55">
        <span>PartnersProgram · Partnerský program</span>
        <Link href="/gdpr" className="inline-flex items-center gap-1 underline decoration-white/30 underline-offset-4 hover:text-white">
          Ochrana osobných údajov <ArrowUpRight aria-hidden="true" className="size-3.5" />
        </Link>
      </footer>
    </main>
  );
}
