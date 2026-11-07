"use client";

import { signOut } from "next-auth/react";
import { useState, type FormEvent } from "react";
import { ValidatedForm } from "@/components/validated-form";
import { ActionLabel } from "@/components/action-label";
import { formatApiError } from "@/lib/validation-errors";

export function ChangePasswordForm() {
  const [error, setError] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (isSubmitting) return;
    setError("");
    setIsSubmitting(true);

    const formData = new FormData(event.currentTarget);
    try {
      const response = await fetch("/api/me/password", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          currentPassword: formData.get("currentPassword"),
          newPassword: formData.get("newPassword"),
        }),
      });

      if (!response.ok) {
        const result = (await response.json()) as {
          error?: { message?: string };
        };
        setError(formatApiError(result.error, "Heslo sa nepodarilo zmeniť."));
        setIsSubmitting(false);
        return;
      }

      await signOut({ redirectTo: "/login?passwordChanged=1" });
    } catch {
      setError("Požiadavku sa nepodarilo dokončiť. Skontrolujte pripojenie.");
      setIsSubmitting(false);
    }
  }

  return (
    <ValidatedForm aria-busy={isSubmitting} className="mt-8 space-y-5" onSubmit={handleSubmit}>
      <label className="block text-sm font-medium text-stone-700">
        Súčasné heslo
        <input
          autoComplete="current-password"
          className="mt-2 block w-full rounded-md border border-stone-300 px-3 py-2.5 outline-none focus:border-amber-700 focus:ring-2 focus:ring-amber-100"
          name="currentPassword"
          maxLength={128}
          required
          type="password"
        />
      </label>
      <label className="block text-sm font-medium text-stone-700">
        Nové heslo (minimálne 10 znakov)
        <input
          autoComplete="new-password"
          className="mt-2 block w-full rounded-md border border-stone-300 px-3 py-2.5 outline-none focus:border-amber-700 focus:ring-2 focus:ring-amber-100"
          minLength={10}
          maxLength={128}
          name="newPassword"
          required
          type="password"
        />
      </label>
      {error ? (
        <p role="alert" className="text-sm text-red-700">
          {error}
        </p>
      ) : null}
      <button
        aria-busy={isSubmitting}
        className="w-full rounded-lg bg-primary px-4 py-3 text-sm font-semibold text-primary-foreground transition hover:bg-primary/90 disabled:cursor-not-allowed disabled:opacity-60"
        disabled={isSubmitting}
        type="submit"
      >
        <ActionLabel busy={isSubmitting} pending="Mením heslo…">Zmeniť heslo</ActionLabel>
      </button>
    </ValidatedForm>
  );
}
