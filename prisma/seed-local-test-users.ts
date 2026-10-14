import { randomBytes } from "node:crypto";

import { hash } from "@node-rs/argon2";
import { PrismaClient } from "@prisma/client";

import { localTestUsers } from "../src/lib/local-test-users";

if (process.env.NODE_ENV !== "development") {
  throw new Error("Local test users can only be seeded in development.");
}

const prisma = new PrismaClient();
const passwordHashOptions = {
  memoryCost: 19_456,
  timeCost: 2,
  parallelism: 1,
} as const;

async function seedLocalTestUsers() {
  const company = await prisma.company.findUnique({ where: { slug: "europodlahy" } });
  if (!company) throw new Error("Migrate the database before seeding local users.");
  for (const user of Object.values(localTestUsers)) {
    const companyId = user.role === "superadmin" ? null : company.id;
    const existing = await prisma.user.findUnique({ where: { email: user.email } });
    if (existing && (existing.role !== user.role || existing.companyId !== companyId)) {
      throw new Error("Local fixture email belongs to another role or company; no account was changed.");
    }
    const passwordHash = await hash(
      randomBytes(32).toString("base64url"),
      passwordHashOptions,
    );
    const now = new Date();

    await prisma.user.upsert({
      where: { email: user.email },
      update: {
        name: user.name,
        role: user.role,
        passwordHash,
        isActive: true,
        mustChangePassword: false,
        passwordChangedAt: now,
        failedLoginCount: 0,
        lockedUntil: null,
      },
      create: {
        companyId,
        email: user.email,
        name: user.name,
        role: user.role,
        passwordHash,
        isActive: true,
        mustChangePassword: false,
        passwordChangedAt: now,
      },
    });
  }

  console.info("Seeded the local superadmin, admin and seller quick-login accounts.");
}

seedLocalTestUsers()
  .catch((error: unknown) => {
    console.error("Local test-user seed failed.", error instanceof Error ? error.name : "Unknown error");
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
