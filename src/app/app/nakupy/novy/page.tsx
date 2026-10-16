import { notFound, redirect } from "next/navigation";
import { Prisma } from "@prisma/client";

import { PurchaseForm } from "@/components/purchases/purchase-form";
import { parseUserId } from "@/server/auth/http";
import { requireCompanyPage } from "@/server/auth/session";
import { prisma } from "@/server/db";

export default async function NewPurchasePage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const context = await requireCompanyPage(["admin", "seller"]);
  if (!["admin", "seller", "superadmin"].includes(context.user.role)) redirect("/app");
  const params = await searchParams;
  const partnerId = typeof params.partner === "string" ? parseUserId(params.partner) : null;
  const source = params.source === "qr" || params.source === "nfc" ? params.source : "manual";
  const tokenId = typeof params.tokenId === "string" ? parseUserId(params.tokenId) : null;
  if (!partnerId || (source === "manual" ? tokenId !== null : tokenId === null)) notFound();

  const partner = await prisma.partner.findFirst({
    where: { id: partnerId, companyId: context.companyId, isActive: true },
    select: { id: true, code: true, displayName: true },
  });
  if (!partner) notFound();
  if (tokenId) {
    if (source === "manual") notFound();
    const token = await prisma.partnerToken.findFirst({
      where: { id: tokenId, partnerId, companyId: context.companyId, type: source, isActive: true },
      select: { id: true },
    });
    if (!token) notFound();
  }
  const totals = await prisma.purchase.aggregate({
    where: { companyId: context.companyId, partnerId, isDeleted: false },
    _sum: { points: true, amount: true, netAmount: true },
  });
  const inputDate = new Intl.DateTimeFormat("sv-SE", {
    timeZone: "Europe/Bratislava", year: "numeric", month: "2-digit", day: "2-digit",
    hour: "2-digit", minute: "2-digit", hourCycle: "h23",
  }).format(new Date()).replace(" ", "T");

  return (
    <section className="mx-auto max-w-3xl">
      <p className="text-xs font-semibold tracking-[0.14em] text-white/85">NOVÝ NÁKUP</p>
      <h1 className="mt-3 text-3xl font-bold tracking-tight text-white sm:text-4xl">{partner.displayName}</h1>
      <p className="mt-2 text-sm text-white/70">
        {partner.code} · <strong className="financial-value text-base font-bold text-white">{totals._sum.points ?? 0} bodov</strong> · obrat <span className="financial-value">{formatAmount(totals._sum.netAmount)} €</span> bez DPH · <span className="financial-value">{formatAmount(totals._sum.amount)} €</span> s DPH
      </p>
      <div className="mt-6">
        <PurchaseForm
          partner={{
            id: partner.id.toString(), code: partner.code, displayName: partner.displayName,
            totalPoints: totals._sum.points ?? 0,
            totalGrossAmount: formatAmount(totals._sum.amount),
            totalNetAmount: formatAmount(totals._sum.netAmount),
          }}
          source={source}
          tokenId={tokenId?.toString() ?? null}
          initialDate={inputDate}
          confirmationLimit={context.company.purchaseConfirmAboveEur?.toFixed(2) ?? null}
          vatRatePercent={context.company.vatRatePercent.toFixed(2)}
        />
      </div>
    </section>
  );
}

function formatAmount(amount: Prisma.Decimal | null) {
  return amount?.toFixed(2) ?? "0.00";
}
