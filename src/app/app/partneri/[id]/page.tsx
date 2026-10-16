import { notFound, redirect } from "next/navigation";
import Link from "next/link";

import { PartnerDetails } from "@/components/partners/partner-details";
import { CsvExportForm } from "@/components/exports/csv-export-form";
import { PartnerTokenManager } from "@/components/partners/partner-token-manager";
import { AuditEntryList, type AuditEntryItem } from "@/components/audit/audit-entry-list";
import { PurchaseHistory, type PurchaseItem } from "@/components/purchases/purchase-history";
import { env } from "@/lib/env";
import { badgeLabel, getMonthlyBadge, type BadgeTier } from "@/lib/monthly-badges";
import { zonedMonthRange } from "@/lib/dates";
import { requireCompanyPage } from "@/server/auth/session";
import { parseUserId } from "@/server/auth/http";
import { prisma } from "@/server/db";
import { listPartnerAuditLogs } from "@/server/repositories/audit-logs";
import { PartnerPrivacy } from "@/components/partners/partner-privacy";
import { listPrivacyReceipts } from "@/server/privacy-receipts";

export default async function PartnerDetailPage({
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

  const currentMonth = zonedMonthRange(new Date(), env.APP_TIMEZONE);
  const [partner, tokens, purchases, purchaseCount, totals, monthTotal, awards, auditEntries] = await Promise.all([
    prisma.partner.findFirst({ where: { id: partnerId, companyId: context.companyId } }),
    prisma.partnerToken.findMany({
      where: { partnerId, companyId: context.companyId },
      select: {
        id: true,
        type: true,
        tokenHint: true,
        label: true,
        isActive: true,
        createdAt: true,
        deactivatedAt: true,
        deactivationReason: true,
        lastUsedAt: true,
      },
      orderBy: [{ createdAt: "desc" }, { id: "desc" }],
    }),
    prisma.purchase.findMany({
      where: { partnerId, companyId: context.companyId },
      include: { partner: { select: { id: true, code: true, displayName: true } }, createdBy: { select: { id: true, name: true } } },
      orderBy: [{ purchasedAt: "desc" }, { id: "desc" }],
      take: 20,
    }),
    prisma.purchase.count({ where: { partnerId, companyId: context.companyId } }),
    prisma.purchase.aggregate({
      where: { partnerId, companyId: context.companyId, isDeleted: false },
      _sum: { amount: true, netAmount: true, points: true },
    }),
    prisma.purchase.aggregate({
      where: {
        partnerId, companyId: context.companyId, isDeleted: false,
        purchasedAt: { gte: currentMonth.start, lt: currentMonth.end },
      },
      _sum: { amount: true, netAmount: true },
    }),
    prisma.partnerBadgeAward.findMany({
      where: { partnerId, companyId: context.companyId },
      select: { periodStart: true, tier: true, monthlyTurnover: true, thresholdEur: true, calculationBasis: true },
      orderBy: [{ periodStart: "desc" }, { id: "desc" }],
    }),
    listPartnerAuditLogs(context, partnerId, 0, 50),
  ]);
  if (!partner) notFound();
  const [privacyReceipts, privacyNotices] = await Promise.all([
    listPrivacyReceipts(context.companyId, partner.id),
    prisma.companyPrivacyNotice.findMany({
      where: { companyId: context.companyId }, orderBy: { version: "desc" }, select: { id: true, version: true },
    }),
  ]);
  const monthGrossAmount = monthTotal._sum.amount?.toFixed(2) ?? "0.00";
  const monthNetAmount = monthTotal._sum.netAmount?.toFixed(2) ?? "0.00";
  const currentBadge = getMonthlyBadge(monthNetAmount, {
    bronzeMonthlyTurnoverEur: context.company.bronzeMonthlyTurnoverEur?.toFixed(2) ?? null,
    silverMonthlyTurnoverEur: context.company.silverMonthlyTurnoverEur?.toFixed(2) ?? null,
    goldMonthlyTurnoverEur: context.company.goldMonthlyTurnoverEur?.toFixed(2) ?? null,
  });
  const awardCounts: Record<BadgeTier, number> = { bronze: 0, silver: 0, gold: 0 };
  for (const award of awards) {
    awardCounts[award.tier] += 1;
  }
  const auditItems: AuditEntryItem[] = auditEntries.map((entry) => ({
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
    targetHref: entry.entityType === "purchase" && entry.entityId
      ? `/app/nakupy/${entry.entityId.toString()}`
      : null,
  }));

  return (
    <div>
      <PartnerDetails
        partner={{
          code: partner.code,
          type: partner.type,
          displayName: partner.displayName,
          phone: partner.phone,
          email: partner.email,
          contactPerson: partner.contactPerson,
          ico: partner.ico,
          internalNote: partner.internalNote,
          isActive: partner.isActive,
          id: partner.id.toString(),
          deactivatedAt: partner.deactivatedAt?.toISOString() ?? null,
          createdAt: partner.createdAt.toISOString(),
          updatedAt: partner.updatedAt.toISOString(),
        }}
      />
      <PartnerPrivacy partnerId={partner.id.toString()} companySlug={context.company.slug}
        receipts={privacyReceipts} notices={privacyNotices.map((notice) => ({ ...notice, id: notice.id.toString() }))}
        readOnly={context.user.role !== "admin"} timeZone={env.APP_TIMEZONE} />
      <PartnerTokenManager
        partnerId={partner.id.toString()}
        partnerName={partner.displayName}
        partnerCode={partner.code}
        initialTokens={tokens.map((token) => ({
          ...token,
          id: token.id.toString(),
          createdAt: token.createdAt.toISOString(),
          deactivatedAt: token.deactivatedAt?.toISOString() ?? null,
          lastUsedAt: token.lastUsedAt?.toISOString() ?? null,
        }))}
      />
      <section className="glass-surface mt-8 rounded-xl p-5">
        <h2 className="text-xl font-semibold text-white">Mesačné ocenenia</h2>
        <p className="mt-2 text-stone-700">
          Tento mesiac: <strong>{currentBadge.label ?? "bez odznaku"}</strong> · obrat <strong className="financial-value">{monthNetAmount} €</strong> bez DPH
        </p>
        <p className="mt-1 text-sm text-stone-600">Tržba <span className="financial-value">{monthGrossAmount} €</span> s DPH · celkom <span className="financial-value">{totals._sum.netAmount?.toFixed(2) ?? "0.00"} €</span> bez DPH / <span className="financial-value">{totals._sum.amount?.toFixed(2) ?? "0.00"} €</span> s DPH · <strong className="financial-value text-base font-bold text-stone-950">{totals._sum.points ?? 0} bodov</strong> (body sa počítajú zo sumy bez DPH).</p>
        <div className="mt-4 flex flex-wrap gap-4 text-sm">
          <span>Bronzový: {awardCounts.bronze} mes.</span>
          <span>Strieborný: {awardCounts.silver} mes.</span>
          <span>Zlatý: {awardCounts.gold} mes.</span>
        </div>
        {awards.length ? (
          <ol className="mt-4 divide-y divide-stone-100">
            {awards.map((award) => (
              <li key={award.periodStart.toISOString()} className="flex flex-wrap justify-between gap-2 py-3">
                <span>{monthLabel(award.periodStart)} · {badgeLabel(award.tier)}</span>
                <span className="text-sm text-stone-600">
                  <span className="financial-value">{award.monthlyTurnover.toFixed(2)} €</span> {award.calculationBasis === "net" ? "bez DPH" : "s DPH (historický výpočet)"} / hranica <span className="financial-value">{award.thresholdEur.toFixed(2)} €</span>
                </span>
              </li>
            ))}
          </ol>
        ) : <p className="mt-4 text-sm text-stone-600">Zatiaľ bez uzavretých mesačných ocenení.</p>}
      </section>
      <section className="mt-8">
        <div className="mb-4 flex flex-wrap items-end justify-between gap-3">
          <h2 className="text-xl font-semibold">Audit partnera</h2>
          <CsvExportForm kind="audit-logs" query={`partnerId=${partner.id}`} />
        </div>
        <AuditEntryList items={auditItems} />
        {auditEntries.length === 50 ? (
          <Link href={`/app/audit?partnerId=${partner.id.toString()}`} className="mt-3 inline-block text-sm text-amber-800 underline">Zobraziť v audite firmy</Link>
        ) : null}
      </section>
      <section className="mt-8">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <h2 className="text-xl font-semibold">Nákupy</h2>
            <p className="mt-1 text-sm text-stone-600">História nákupov partnera vrátane zmazaných.</p>
          </div>
          <div className="flex flex-wrap items-center gap-3">
          <CsvExportForm kind="purchases" query={`partnerId=${partner.id}&includeDeleted=true`} />
          {partner.isActive && context.company.isActive ? (
            <Link className="min-h-11 rounded-lg bg-primary px-4 py-2.5 text-sm font-semibold text-primary-foreground hover:bg-primary/90"
              href={`/app/nakupy/novy?partner=${partner.id.toString()}`}>
              Pridať nákup
            </Link>
          ) : null}
          </div>
        </div>
        <PurchaseHistory
          role="admin"
          includeDeleted
          total={purchaseCount}
          items={purchases.map((purchase): PurchaseItem => ({
            id: purchase.id.toString(),
            amount: purchase.amount.toFixed(2),
            netAmount: purchase.netAmount.toFixed(2),
            vatRatePercent: purchase.vatRatePercent.toFixed(2),
            points: purchase.points,
            partnerPresent: purchase.partnerPresent,
            purchasedAt: purchase.purchasedAt.toISOString(),
            source: purchase.source,
            isDeleted: purchase.isDeleted,
            deletedAt: purchase.deletedAt?.toISOString() ?? null,
            partner: { id: purchase.partner.id.toString(), code: purchase.partner.code, displayName: purchase.partner.displayName },
            createdBy: { id: purchase.createdBy.id.toString(), name: purchase.createdBy.name },
          }))}
        />
        {purchaseCount > purchases.length ? <Link href={`/app/nakupy?partnerId=${partner.id.toString()}`} className="mt-3 inline-block text-sm text-amber-800 underline">Zobraziť ďalšie</Link> : null}
      </section>
    </div>
  );
}

function monthLabel(periodStart: Date) {
  return new Intl.DateTimeFormat("sk-SK", {
    month: "long", year: "numeric", timeZone: "UTC",
  }).format(periodStart);
}
