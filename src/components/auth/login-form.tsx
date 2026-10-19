"use client";

import { getSession, signIn } from "next-auth/react";
import { useRouter } from "next/navigation";
import { useState, type FormEvent } from "react";
import { ValidatedForm } from "@/components/validated-form";

export function LoginForm({
  callbackUrl,
  showLocalQuickLogin = false,
}: {
  callbackUrl?: string;
  showLocalQuickLogin?: boolean;
}) {
  const router = useRouter();
  const [error, setError] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);

  async function submitCredentials(credentials: {
    email?: FormDataEntryValue | null;
    password?: FormDataEntryValue | null;
    testRole?: "superadmin" | "admin" | "seller";
  }) {
    setError("");
    setIsSubmitting(true);
    const result = await signIn("credentials", {
      ...credentials,
      redirect: false,
    });

    if (!result || result.error) {
      setError(
        credentials.testRole
          ? "Testovací účet nie je dostupný. Spustite lokálne seedovanie."
          : "Prihlásenie sa nepodarilo. Skontrolujte údaje alebo skúste neskôr.",
      );
      setIsSubmitting(false);
      return;
    }

    const session = await getSession();
    const destination = session?.user.mustChangePassword
      ? "/change-password"
      : session?.user.role === "superadmin"
        ? "/superadmin/firmy"
        : callbackUrl ?? "/app";
    router.replace(destination);
    router.refresh();
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const formData = new FormData(event.currentTarget);
    await submitCredentials({
      email: formData.get("email"),
      password: formData.get("password"),
    });
  }

  async function handleQuickLogin(
    event: FormEvent<HTMLFormElement>,
    role: "superadmin" | "admin" | "seller",
  ) {
    event.preventDefault();
    await submitCredentials({ testRole: role });
  }

  return (
    <>
      <ValidatedForm className="mt-8 space-y-5" onSubmit={handleSubmit}>
        <label className="block text-sm font-medium text-stone-700">
          E-mail
          <input
            autoComplete="username"
            className="mt-2 block w-full rounded-md border border-stone-300 px-3 py-2.5 text-stone-950 outline-none focus:border-amber-700 focus:ring-2 focus:ring-amber-100"
            name="email"
            required
            type="email"
          />
        </label>
        <label className="block text-sm font-medium text-stone-700">
          Heslo
          <input
            autoComplete="current-password"
            className="mt-2 block w-full rounded-md border border-stone-300 px-3 py-2.5 text-stone-950 outline-none focus:border-amber-700 focus:ring-2 focus:ring-amber-100"
            name="password"
            required
            type="password"
          />
        </label>
        {error ? (
          <p aria-live="polite" className="text-sm text-red-700">
            {error}
          </p>
        ) : null}
        <button
          className="w-full rounded-md bg-stone-950 px-4 py-3 text-sm font-semibold text-white transition hover:bg-stone-800 disabled:cursor-not-allowed disabled:opacity-60"
          disabled={isSubmitting}
          type="submit"
        >
          {isSubmitting ? "Prihlasujem…" : "Prihlásiť sa"}
        </button>
      </ValidatedForm>
      {showLocalQuickLogin ? (
        <>
          <form
            id="local-quick-login-superadmin"
            onSubmit={(event) => void handleQuickLogin(event, "superadmin")}
          />
          <form
            id="local-quick-login-admin"
            onSubmit={(event) => void handleQuickLogin(event, "admin")}
          />
          <form
            id="local-quick-login-seller"
            onSubmit={(event) => void handleQuickLogin(event, "seller")}
          />
        </>
      ) : null}
    </>
  );
}
