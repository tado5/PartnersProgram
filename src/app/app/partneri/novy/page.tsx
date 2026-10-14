import { redirect } from "next/navigation";

import { PartnerForm } from "@/components/partners/partner-form";
import { requireCompanyPage } from "@/server/auth/session";

export default async function NewPartnerPage() {
  const context = await requireCompanyPage(["admin"]);
  if (!context) redirect("/login");
  if (context.user.role === "seller") redirect("/app");

  return (
    <section className="mx-auto max-w-3xl">
      <p className="text-sm font-semibold uppercase tracking-[0.16em] text-amber-800">
        Administrácia
      </p>
      <h1 className="mb-6 mt-3 text-3xl font-semibold tracking-tight text-stone-950">
        Nový partner
      </h1>
      <PartnerForm />
    </section>
  );
}
