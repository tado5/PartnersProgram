import { notFound, redirect } from "next/navigation";

import { AuditEntryList, type AuditEntryItem } from "@/components/audit/audit-entry-list";
import { PurchaseAdminForm } from "@/components/purchases/purchase-admin-form";
import { parseUserId } from "@/server/auth/http";
import { requireCompanyPage } from "@/server/auth/session";
import { prisma } from "@/server/db";
import { purchaseResponse } from "@/server/purchases";

export default async function PurchaseDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const context = await requireCompanyPage(["admin"]);
  if (context.user.role === "seller") redirect("/app");
  const id = parseUserId((await params).id);
  if (!id) notFound();
  const purchase = await prisma.purchase.findFirst({
    where: { id, companyId: context.companyId },
    include: {
      partner: { select: { id: true, code: true, displayName: true } },
      createdBy: { select: { id: true, name: true } },
    },
  });
  if (!purchase) notFound();
  const audit = await prisma.auditLog.findMany({
    where: { companyId: context.companyId, entityType: "purchase", entityId: purchase.id },
    include: {
      user: { select: { id: true, name: true, role: true } },
      partner: { select: { id: true, code: true, displayName: true } },
    },
    orderBy: [{ createdAt: "desc" }, { id: "desc" }],
  });
  const auditItems: AuditEntryItem[] = audit.map((entry) => ({
    id: entry.id.toString(),
    action: entry.action,
    entityType: entry.entityType,
    entityId: entry.entityId?.toString() ?? null,
    partnerId: entry.partnerId?.toString() ?? null,
    actorName: entry.user?.name ?? null,
    reason: entry.reason,
    createdAt: entry.createdAt.toISOString(),
    oldValues: entry.oldValues,
    newValues: entry.newValues,
    partner: entry.partner ? {
      id: entry.partner.id.toString(),
      code: entry.partner.code,
      displayName: entry.partner.displayName,
    } : null,
  }));
  const inputDate = new Intl.DateTimeFormat("sv-SE", {
    timeZone: "Europe/Bratislava", year: "numeric", month: "2-digit", day: "2-digit",
    hour: "2-digit", minute: "2-digit", hourCycle: "h23",
  }).format(purchase.purchasedAt).replace(" ", "T");

  return (
    <section className="mx-auto max-w-3xl">
      <p className="text-sm font-semibold uppercase tracking-[0.16em] text-amber-800">Detail nákupu</p>
      <h1 className="mt-3 text-3xl font-semibold tracking-tight text-stone-950">{purchase.partner.displayName}</h1>
      <p className="mt-2 text-sm text-stone-600">{purchase.partner.code} · zapísal {purchase.createdBy.name} · <strong className="text-base font-bold text-stone-950">{purchase.points} bodov</strong></p>
      <div className="mt-6">
        <PurchaseAdminForm
          purchase={{
            ...purchaseResponse(purchase),
            id: purchase.id.toString(),
            partnerId: purchase.partner.id.toString(),
          }}
          partner={{
            id: purchase.partner.id.toString(), code: purchase.partner.code,
            displayName: purchase.partner.displayName,
          }}
          initialDate={inputDate}
        />
      </div>
      <section className="mt-8">
        <h2 className="text-xl font-semibold">História zmien</h2>
        <AuditEntryList items={auditItems} />
      </section>
    </section>
  );
}
