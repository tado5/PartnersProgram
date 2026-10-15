import { redirect } from "next/navigation";

import { PartnerList } from "@/components/partners/partner-list";
import { requireCompanyPage } from "@/server/auth/session";
import { maskPhone } from "@/server/partners";
import { prisma } from "@/server/db";

export const instant = false;

export default async function PartnersPage() {
  const context = await requireCompanyPage();
  if (!context) redirect("/login");

  const where = { companyId: context.companyId, ...(context.user.role === "seller" ? { isActive: true } : {}) };
  const [partners, total] = await Promise.all([
    prisma.partner.findMany({
      where,
      orderBy: [{ displayName: "asc" }, { id: "asc" }],
      take: 20,
      include: { _count: { select: { privacyReceipts: true } } },
    }),
    prisma.partner.count({ where }),
  ]);

  return (
    <section>
      <p className="text-sm font-semibold uppercase tracking-[0.16em] text-amber-800">
        {context.user.role === "admin" ? "Administrácia" : "Vyhľadanie"}
      </p>
      <PartnerList
        initialTotal={total}
        role={context.user.role === "seller" ? "seller" : "admin"}
        initialItems={partners.map((partner) => ({
          id: partner.id.toString(),
          code: partner.code,
          type: partner.type,
          displayName: partner.displayName,
          phone: context.user.role === "seller" ? maskPhone(partner.phone) : partner.phone,
          isActive: partner.isActive,
          ...(context.user.role !== "seller" ? { privacyRecorded: partner._count.privacyReceipts > 0 } : {}),
        }))}
      />
    </section>
  );
}
