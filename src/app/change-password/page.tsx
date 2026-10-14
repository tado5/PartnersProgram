import { redirect } from "next/navigation";

import { ChangePasswordForm } from "@/components/auth/change-password-form";
import { SessionActivity } from "@/components/auth/session-activity";
import { getAuthenticatedUser } from "@/server/auth/session";

export const instant = false;

export default async function ChangePasswordPage() {
  const context = await getAuthenticatedUser();
  if (!context) {
    redirect("/login");
  }

  return (
    <main className="flex min-h-screen items-center justify-center bg-stone-50 px-5 py-12">
      <SessionActivity />
      <section className="w-full max-w-md rounded-2xl border border-stone-200 bg-white p-7 shadow-sm sm:p-9">
        <p className="text-sm font-semibold uppercase tracking-[0.16em] text-amber-800">
          Zabezpečenie účtu
        </p>
        <h1 className="mt-3 text-2xl font-semibold tracking-tight text-stone-950">
          {context.user.mustChangePassword
            ? "Zmeňte dočasné heslo"
            : "Zmeniť heslo"}
        </h1>
        <p className="mt-2 text-sm leading-6 text-stone-600">
          {context.user.mustChangePassword
            ? "Pred prvým pokračovaním si nastavte vlastné heslo. Po zmene sa budete musieť znovu prihlásiť."
            : "Po zmene hesla sa budete musieť znovu prihlásiť."}
        </p>
        <ChangePasswordForm />
      </section>
    </main>
  );
}
