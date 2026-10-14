import { createHash, randomBytes } from "node:crypto";
import { Prisma, PrismaClient } from "@prisma/client";

import { env } from "../src/lib/env";
import { netAmountFromGross, pointsForAmount } from "../src/lib/purchases";
import { bootstrapUser } from "./bootstrap";

const prisma = new PrismaClient();

const partnerNames = [
  ["installer", "Ján Kováč"],
  ["company", "Podlahy Novák, s. r. o."],
  ["referrer", "Mária Horváthová"],
  ["installer", "Peter Polák"],
  ["company", "Interiér plus, s. r. o."],
  ["installer", "Milan Tóth"],
  ["referrer", "Zuzana Vargová"],
  ["company", "Stavmont SK, s. r. o."],
  ["installer", "Tomáš Baláž"],
  ["installer", "Martin Král"],
  ["company", "Domov podlahy, s. r. o."],
  ["referrer", "Eva Bieliková"],
  ["installer", "Andrej Urban"],
  ["company", "Podlahy centrum, s. r. o."],
  ["installer", "Lukáš Černý"],
  ["referrer", "Katarína Kováčová"],
  ["company", "Nové bývanie, s. r. o."],
  ["installer", "Richard Šimko"],
  ["referrer", "Jozefína Malá"],
  ["company", "Interiéry Tatry, s. r. o."],
] as const;

function makePartnerCode(index: number) {
  const alphabet = "23456789ABCDEFGHJKMNPQRSTVWXYZ";
  let value = index + 1;
  let suffix = "";

  for (let position = 0; position < 5; position += 1) {
    suffix = alphabet[value % alphabet.length] + suffix;
    value = Math.floor(value / alphabet.length);
  }

  return `EP-${suffix}`;
}

async function createSeedUser(
  companyId: bigint,
  email: string,
  name: string,
  role: "admin" | "seller",
  password: string,
) {
  return bootstrapUser(prisma, { companyId, email, name, role, password });
}

async function main() {
  const company = await prisma.company.upsert({
    where: { slug: "europodlahy" }, update: {},
    create: { name: "Europodlahy", slug: "europodlahy" },
  });
  if (env.SEED_SUPERADMIN_EMAIL && env.SEED_SUPERADMIN_PASSWORD) {
    await bootstrapUser(prisma, {
      email: env.SEED_SUPERADMIN_EMAIL, password: env.SEED_SUPERADMIN_PASSWORD,
      name: "Superadmin", role: "superadmin", companyId: null,
    });
  }
  const adminEmail = env.SEED_ADMIN_EMAIL;
  const adminPassword = env.SEED_ADMIN_PASSWORD;
  const sellerEmail = env.SEED_SELLER_EMAIL;
  const sellerPassword = env.SEED_SELLER_PASSWORD;
  const seedDevelopmentData = env.NODE_ENV === "development";

  if ((!adminEmail || !adminPassword) && !env.SEED_SUPERADMIN_EMAIL) {
    throw new Error(
      "SEED_ADMIN_EMAIL and SEED_ADMIN_PASSWORD are required to seed the first admin.",
    );
  }
  if (!adminEmail || !adminPassword) {
    console.info("Superadmin bootstrap completed; existing accounts were not modified.");
    return;
  }

  if (seedDevelopmentData && (!sellerEmail || !sellerPassword)) {
    throw new Error(
      "Set SEED_SELLER_EMAIL and SEED_SELLER_PASSWORD to create development sample data.",
    );
  }

  const admin = await createSeedUser(
    company.id,
    adminEmail,
    "Správca",
    "admin",
    adminPassword,
  );

  if (!seedDevelopmentData) {
    console.info("Seeded the initial administrator.");
    return;
  }

  if (!sellerEmail || !sellerPassword) {
    throw new Error(
      "Set SEED_SELLER_EMAIL and SEED_SELLER_PASSWORD to create development sample data.",
    );
  }

  const seller = await createSeedUser(
    company.id,
    sellerEmail,
    "Predavač",
    "seller",
    sellerPassword,
  );

  const partners = await Promise.all(
    partnerNames.map(async ([type, displayName], index) => {
      const code = makePartnerCode(index);
      return prisma.partner.upsert({
        where: { code },
        update: {},
        create: {
          companyId: company.id,
          code,
          type,
          displayName,
          phone: `+421900000${(index + 1).toString().padStart(3, "0")}`,
          createdByUserId: admin.id,
        },
      });
    }),
  );
  if (partners.some((partner) => partner.companyId !== company.id)) {
    throw new Error("Development fixture partner belongs to another company.");
  }

  const now = new Date();
  const seededPurchases = partners.flatMap((partner, partnerIndex) =>
    [0, 1, 2].map((monthOffset) => {
      const numericId = partnerIndex * 3 + monthOffset + 1;
      const amount = new Prisma.Decimal(
        `${120 + partnerIndex * 17}.${(monthOffset * 23 + partnerIndex) % 100}`,
      );
      const vatRatePercent = new Prisma.Decimal("23.00");
      const calculated = netAmountFromGross(amount.toFixed(2), vatRatePercent.toFixed(2));
      return {
        companyId: company.id,
        partnerId: partner.id,
        amount,
        netAmount: new Prisma.Decimal(calculated.netAmount),
        vatRatePercent,
        points: pointsForAmount(calculated.netAmount),
        partnerPresent: monthOffset !== 1,
        note: "Ukážkový vývojový nákup",
        purchasedAt: new Date(
          Date.UTC(
            now.getUTCFullYear(),
            now.getUTCMonth() - monthOffset,
            10 + (partnerIndex % 15),
            10,
          ),
        ),
        source: "manual" as const,
        idempotencyKey: `00000000-0000-4000-8000-${numericId
          .toString(16)
          .padStart(12, "0")}`,
        createdByUserId: seller.id,
      };
    }),
  );

  for (const purchase of seededPurchases) {
    await prisma.purchase.upsert({
      where: { companyId_idempotencyKey: { companyId: company.id, idempotencyKey: purchase.idempotencyKey } },
      update: {
        partnerId: purchase.partnerId,
        amount: purchase.amount,
        netAmount: purchase.netAmount,
        vatRatePercent: purchase.vatRatePercent,
        points: purchase.points,
        partnerPresent: purchase.partnerPresent,
        note: purchase.note,
        purchasedAt: purchase.purchasedAt,
        createdByUserId: purchase.createdByUserId,
      },
      create: purchase,
    });
  }

  const secondCompany = await prisma.company.upsert({
    where: { slug: "vyvoj-druha-firma" }, update: {},
    create: { name: "Druhá vývojová firma", slug: "vyvoj-druha-firma" },
  });
  const secondAdmin = await createSeedUser(secondCompany.id, `second.${adminEmail}`, "Druhý správca", "admin", adminPassword);
  const secondSeller = await createSeedUser(secondCompany.id, `second.${sellerEmail}`, "Druhý predavač", "seller", sellerPassword);
  const secondPartner = await prisma.partner.upsert({
    where: { code: "EP-ZZZZZ" }, update: {},
    create: { companyId: secondCompany.id, code: "EP-ZZZZZ", displayName: "Partner druhej firmy", type: "installer", createdByUserId: secondAdmin.id },
  });
  if (secondPartner.companyId !== secondCompany.id) throw new Error("Development fixture code belongs to another company.");
  for (const partner of [partners[0], secondPartner]) {
    for (const type of ["qr", "nfc"] as const) {
      const existing = await prisma.partnerToken.findFirst({ where: { companyId: partner.companyId, partnerId: partner.id, label: `Seed ${type}` } });
      if (!existing) {
        const value = randomBytes(32).toString("base64url");
        await prisma.partnerToken.create({ data: {
          companyId: partner.companyId, partnerId: partner.id, type, label: `Seed ${type}`,
          tokenHash: createHash("sha256").update(value).digest("hex"), tokenHint: value.slice(0, 6),
          createdByUserId: partner.companyId === company.id ? admin.id : secondAdmin.id,
        } });
      }
    }
  }
  await prisma.purchase.upsert({
    where: { companyId_idempotencyKey: { companyId: secondCompany.id, idempotencyKey: "00000000-0000-4000-8000-000000000001" } },
    update: {},
    create: { companyId: secondCompany.id, partnerId: secondPartner.id, amount: "19.99", netAmount: "16.25", vatRatePercent: "23.00", points: 16,
      partnerPresent: true, source: "manual", createdByUserId: secondSeller.id,
      idempotencyKey: "00000000-0000-4000-8000-000000000001" },
  });

  console.info(
    `Seeded the initial administrator, development seller, ${partners.length} partners and ${seededPurchases.length} purchases.`,
  );
}

main()
  .catch((error: unknown) => {
    console.error("Database seed failed.", error instanceof Error ? error.name : "Unknown error");
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
