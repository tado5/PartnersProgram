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
    <main className="flex min-h-screen items-center justify-center bg-stone-50 px-5 py-12">
      <section className="w-full max-w-md rounded-2xl border border-stone-200 bg-white p-7 shadow-sm sm:p-9">
        <Link href="/" className="text-lg font-bold tracking-tight text-stone-950">
          europodlahy<span className="text-amber-700">.</span>
        </Link>
        <h1 className="mt-8 text-2xl font-semibold tracking-tight text-stone-950">
          Prihlásenie
        </h1>
        <p className="mt-2 text-sm leading-6 text-stone-600">
          Prihláste sa účtom, ktorý vám vytvoril správca.
        </p>
        {passwordChanged === "1" ? (
          <p className="mt-4 rounded-md bg-emerald-50 p-3 text-sm text-emerald-900">
            Heslo bolo zmenené. Prihláste sa novým heslom.
          </p>
        ) : null}
        <LoginForm
          callbackUrl={safeCallbackUrl(callbackUrl)}
          showLocalQuickLogin={showLocalQuickLogin}
        />
        {showLocalQuickLogin ? (
          <section className="mt-8 border-t border-stone-200 pt-6">
            <h2 className="text-sm font-semibold text-stone-800">
              Rýchle prihlásenie
            </h2>
            <p className="mt-1 text-xs leading-5 text-stone-500">
              Iba na lokálne testovanie. Vyberte testovaciu rolu.
            </p>
            <div className="mt-4 grid grid-cols-2 gap-3">
              <button
                className="col-span-2 rounded-md border border-amber-300 bg-amber-50 px-3 py-2.5 text-sm font-medium text-amber-900 transition hover:bg-amber-100"
                form="local-quick-login-superadmin"
                type="submit"
              >
                Superadmin test
              </button>
              <button
                className="rounded-md border border-stone-300 px-3 py-2.5 text-sm font-medium text-stone-700 transition hover:bg-stone-100"
                form="local-quick-login-admin"
                type="submit"
              >
                Admin test
              </button>
              <button
                className="rounded-md border border-stone-300 px-3 py-2.5 text-sm font-medium text-stone-700 transition hover:bg-stone-100"
                form="local-quick-login-seller"
                type="submit"
              >
                Predavač test
              </button>
            </div>
          </section>
        ) : null}
      </section>
    </main>
  );
}
