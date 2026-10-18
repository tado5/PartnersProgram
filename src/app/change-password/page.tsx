import { KeyRound, ShieldCheck } from "lucide-react";
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
    <main className="relative isolate flex min-h-[100dvh] items-center justify-center overflow-hidden px-4 py-8 sm:px-6 sm:py-12">
      <SessionActivity />
      <div aria-hidden="true" className="pointer-events-none absolute -right-28 top-1/4 -z-10 size-[28rem] rounded-full bg-secondary/20 blur-[120px]" />
      <section aria-labelledby="change-password-title" className="data-surface w-full max-w-lg rounded-3xl p-6 shadow-[0_24px_80px_rgba(0,0,0,0.3)] sm:p-9">
        <div className="inline-flex items-center gap-3">
          <span aria-hidden="true" className="flex size-10 items-center justify-center rounded-xl border border-white/20 bg-white/10 font-bold text-white">P</span>
          <span className="font-semibold tracking-tight text-white">Partners<span className="text-primary">Program</span></span>
        </div>
        <div className="mt-8 flex size-12 items-center justify-center rounded-2xl border border-primary/35 bg-primary/10 text-primary">
          <KeyRound aria-hidden="true" className="size-5" />
        </div>
        <p className="mt-6 text-xs font-semibold tracking-[0.14em] text-white/85">ZABEZPEČENIE ÚČTU</p>
        <h1 id="change-password-title" className="mt-2 text-3xl font-bold tracking-tight text-white">
          {context.user.mustChangePassword ? "Zmeňte dočasné heslo" : "Zmeniť heslo"}
        </h1>
        <p className="mt-3 text-sm leading-6 text-white/70">
          {context.user.mustChangePassword
            ? "Pred prvým pokračovaním si nastavte vlastné heslo. Po zmene sa budete musieť znovu prihlásiť."
            : "Po zmene hesla sa budete musieť znovu prihlásiť."}
        </p>
        <div className="mt-5 flex items-start gap-3 rounded-xl border border-white/12 bg-white/5 p-3.5">
          <ShieldCheck aria-hidden="true" className="mt-0.5 size-4 shrink-0 text-[color:var(--color-teal)]" />
          <p className="text-xs leading-5 text-white/65">Použite heslo s aspoň 10 znakmi, ktoré nikde inde nepoužívate.</p>
        </div>
        <ChangePasswordForm />
      </section>
    </main>
  );
}
