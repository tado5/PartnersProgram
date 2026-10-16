import { notFound, redirect } from "next/navigation";

import { PartnerForm } from "@/components/partners/partner-form";
import { requireCompanyPage } from "@/server/auth/session";
import { parseUserId } from "@/server/auth/http";
import { prisma } from "@/server/db";

export default async function EditPartnerPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const context = await requireCompanyPage(["admin"]);
  if (!context) redirect("/login");
  if (context.user.role === "seller") redirect("/app");

  const { id } = await params;
  const partnerId = parseUserId(id);
  if (!partnerId) notFound();
  const partner = await prisma.partner.findFirst({ where: { id: partnerId, companyId: context.companyId } });
  if (!partner) notFound();

  return (
    <section className="mx-auto max-w-3xl">
      <p className="text-xs font-semibold tracking-[0.14em] text-white/85">
        {partner.code}
      </p>
      <h1 className="mb-6 mt-3 text-3xl font-bold tracking-tight text-white sm:text-4xl">
        Upraviť partnera
      </h1>
      <PartnerForm
        partner={{
          id: partner.id.toString(),
          code: partner.code,
          type: partner.type,
          displayName: partner.displayName,
          phone: partner.phone,
          email: partner.email,
          contactPerson: partner.contactPerson,
          ico: partner.ico,
          internalNote: partner.internalNote,
        }}
      />
    </section>
  );
}
