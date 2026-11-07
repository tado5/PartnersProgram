import assert from "node:assert/strict";
import { createHash, randomBytes } from "node:crypto";
import { after, test } from "node:test";
import { PrismaClient, type Company, type User } from "@prisma/client";

import { changeCompany } from "../src/server/companies";
import { CompanyInactiveError, type AuthContext } from "../src/server/auth/session";
import { createPurchase, deletePurchase, PurchaseError } from "../src/server/purchases";
import { prisma } from "../src/server/db";
import type { CompanyContext } from "../src/server/auth/session";
import { findActiveTokenByHash, rotatePartnerToken } from "../src/server/repositories/tokens";
import { decryptToken, encryptToken } from "../src/server/token-crypto";
import { createDatabaseAdapter } from "../src/server/db-adapter.mjs";

const databaseUrl = process.env.DATABASE_URL ?? "";
const databaseName = new URL(databaseUrl).pathname.slice(1);
if (process.env.P3_ACCEPTANCE_DATABASE !== databaseName ||
    !/^partnersprogram_p3_[a-f0-9]{12}$/.test(databaseName)) {
  throw new Error("Phase 3 DB tests require their randomly named disposable database.");
}
after(() => prisma.$disconnect());
function companyContext(user: User, company: Company): CompanyContext {
  const now = Date.now();
  return {
    user,
    session: {
      expires: new Date(now + 3_600_000).toISOString(),
      user: {
        id: user.id.toString(),
        name: user.name,
        email: user.email,
        role: user.role,
        companyId: user.companyId?.toString() ?? null,
        mustChangePassword: user.mustChangePassword,
        passwordChangedAt: user.passwordChangedAt?.getTime() ?? 0,
        isSessionValid: true,
        loginAt: now,
        lastActivityAt: now,
      },
    },
    company,
    companyId: company.id,
    selectionId: "",
  };
}

function authContext(user: User): AuthContext {
  const now = Date.now();
  return {
    user,
    session: {
      expires: new Date(now + 3_600_000).toISOString(),
      user: {
        id: user.id.toString(),
        name: user.name,
        email: user.email,
        role: user.role,
        companyId: user.companyId?.toString() ?? null,
        mustChangePassword: user.mustChangePassword,
        passwordChangedAt: user.passwordChangedAt?.getTime() ?? 0,
        isSessionValid: true,
        loginAt: now,
        lastActivityAt: now,
      },
    },
  };
}

async function waitForLockWaiters(observer: PrismaClient, expected: number) {
  const observed = new Set<number>();
  for (let attempt = 0; attempt < 500; attempt += 1) {
    // MariaDB may block a locking SELECT in Statistics before INNODB_LOCK_WAITS records it.
    const [row] = await observer.$queryRaw<Array<{ waiters: bigint }>>`
      SELECT COUNT(*) AS waiters FROM information_schema.PROCESSLIST
      WHERE USER = 'europodlahy_app'
        AND INFO LIKE 'SELECT id FROM companies WHERE id = % FOR UPDATE'
        AND TIME_MS >= 50
    `;
    const waiters = Number(row.waiters);
    observed.add(waiters);
    if (waiters === expected) return;
    await new Promise((resolve) => setTimeout(resolve, 10));
  }
  throw new Error(`Expected ${expected} transactions waiting on the company row lock; observed ${[...observed].join(",")}.`);
}

type Settled<Value> =
  | { status: "fulfilled"; value: Value }
  | { status: "rejected"; reason: unknown };

async function queueOnCompanyLock<T, U>(
  companyId: bigint,
  first: () => Promise<T>,
  second: () => Promise<U>,
): Promise<[Settled<T>, Settled<U>]> {
  const observerUrl = process.env.P3_OBSERVER_DATABASE_URL;
  assert.ok(observerUrl, "Isolated race tests require the disposable DB lock observer.");
  const observer = new PrismaClient({ adapter: createDatabaseAdapter(observerUrl), log: [] });
  let releaseLock = () => {};
  let lockAcquired = () => {};
  const acquired = new Promise<void>((resolve) => { lockAcquired = resolve; });
  const gate = new Promise<void>((resolve) => { releaseLock = resolve; });
  const lockOwner = observer.$transaction(async (tx) => {
    const [row] = await tx.$queryRaw<Array<{ isolation: string }>>`
      SELECT @@tx_isolation AS isolation
    `;
    assert.equal(row.isolation.toUpperCase().replaceAll("_", "-"), "REPEATABLE-READ");
    const locked = await tx.$queryRaw<Array<{ id: bigint }>>`SELECT id FROM companies WHERE id = ${companyId} FOR UPDATE`;
    assert.equal(locked[0]?.id, companyId);
    lockAcquired();
    await gate;
  }, { timeout: 30_000 });

  const settle = <Value>(promise: Promise<Value>) => promise.then(
    (value) => ({ status: "fulfilled" as const, value }),
    (reason: unknown) => ({ status: "rejected" as const, reason }),
  );
  const pending: Promise<unknown>[] = [];
  try {
    await acquired;
    const firstResult = settle(first());
    pending.push(firstResult);
    await waitForLockWaiters(observer, 1);
    const secondResult = settle(second());
    pending.push(secondResult);
    await new Promise((resolve) => setTimeout(resolve, 100));
    releaseLock();
    await lockOwner;
    return [await firstResult, await secondResult];
  } finally {
    releaseLock();
    await lockOwner.catch(() => {});
    await Promise.all(pending);
    await observer.$disconnect();
  }
}

test("isolated app DB permissions, idempotency concurrency, rollback, and token backup fixture", async () => {
  const suffix = randomBytes(6).toString("hex");
  const company = await prisma.company.create({
    data: { name: `P3 Test ${suffix}`, slug: `p3-test-${suffix}` },
  });
  const user = await prisma.user.create({
    data: {
      companyId: company.id,
      email: `p3-${suffix}@example.invalid`,
      name: "Synthetic Phase 3 User",
      passwordHash: "synthetic-hash",
      role: "admin",
      isActive: true,
      mustChangePassword: false,
    },
  });
  const partner = await prisma.partner.create({
    data: {
      companyId: company.id,
      code: `EP-${suffix.slice(0, 5).toUpperCase().replace(/[01]/g, "2")}`,
      type: "installer",
      displayName: "Synthetic Phase 3 Partner",
      createdByUserId: user.id,
    },
  });
  const key = process.env.TOKEN_ENCRYPTION_KEY;
  assert.match(key ?? "", /^[a-f0-9]{64}$/);
  const tokenValue = randomBytes(32).toString("base64url");
  const tokenIdentity = {
    companyId: company.id,
    partnerId: partner.id,
    type: "qr" as const,
    tokenHash: createHash("sha256").update(tokenValue).digest("hex"),
  };
  await prisma.partnerToken.create({
    data: {
      ...tokenIdentity,
      tokenHint: tokenValue.slice(0, 6),
      tokenEncrypted: encryptToken(tokenValue, tokenIdentity, key),
      createdByUserId: user.id,
    },
  });

  const context = companyContext(user, company);
  const idempotencyKey = `00000000-0000-4000-8000-${suffix}`;
  const request = {
    partnerId: partner.id,
    amount: "123.45",
    partnerPresent: true,
    source: "manual" as const,
    idempotencyKey,
    highAmountConfirmed: true,
  };
  const concurrentResults = await Promise.all(
    Array.from({ length: 12 }, () => createPurchase(context, request)),
  );
  assert.equal(concurrentResults.filter((result) => !result.replayed).length, 1);
  assert.equal(concurrentResults.filter((result) => result.replayed).length, 11);
  assert.equal(new Set(concurrentResults.map((result) => result.purchase.id.toString())).size, 1);
  assert.equal(await prisma.purchase.count({ where: { companyId: company.id, idempotencyKey } }), 1);
  assert.equal(await prisma.auditLog.count({
    where: { companyId: company.id, action: "purchase.create" },
  }), 1);

  const migrationClient = new PrismaClient({
    adapter: createDatabaseAdapter(process.env.MIGRATE_DATABASE_URL!),
    log: [],
  });
  try {
    await migrationClient.$executeRawUnsafe(`
      CREATE TRIGGER p3_fail_purchase_audit
      BEFORE INSERT ON audit_logs FOR EACH ROW
      SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'p3 injected audit failure'
    `);
    const failedCreateKey = `00000000-0000-4000-8000-${randomBytes(6).toString("hex")}`;
    await assert.rejects(createPurchase(context, {
      ...request,
      idempotencyKey: failedCreateKey,
      note: "p3-trigger-rollback",
    }));
    assert.equal(await prisma.purchase.count({
      where: { companyId: company.id, idempotencyKey: failedCreateKey },
    }), 0, "failed audit insert must roll back the purchase insert");

    const purchaseId = concurrentResults[0].purchase.id;
    await assert.rejects(deletePurchase(context, purchaseId, "p3-trigger-rollback"));
    assert.equal((await prisma.purchase.findUniqueOrThrow({ where: { id: purchaseId } })).isDeleted, false,
      "failed delete audit insert must roll back the soft delete");
  } finally {
    await migrationClient.$executeRawUnsafe("DROP TRIGGER IF EXISTS p3_fail_purchase_audit");
    await migrationClient.$disconnect();
  }

  const purchaseId = concurrentResults[0].purchase.id;
  const deleted = await deletePurchase(context, purchaseId, "synthetic successful delete");
  assert.equal(deleted.isDeleted, true);
  assert.equal(await prisma.auditLog.count({
    where: { companyId: company.id, action: "purchase.delete" },
  }), 1);
});

test("company-row locks serialize token rotation and purchases with consistent token and audit state", async () => {
  assert.ok(process.env.P3_OBSERVER_DATABASE_URL);
  const key = process.env.TOKEN_ENCRYPTION_KEY;
  assert.match(key ?? "", /^[a-f0-9]{64}$/);

  const makeFixture = async (label: string) => {
    const suffix = randomBytes(5).toString("hex");
    const company = await prisma.company.create({
      data: { name: `P3 Race ${label} ${suffix}`, slug: `p3-race-${label}-${suffix}` },
    });
    const user = await prisma.user.create({
      data: {
        companyId: company.id,
        email: `p3-race-${suffix}@example.invalid`,
        name: `Synthetic ${label}`,
        passwordHash: "synthetic-hash",
        role: "admin",
        isActive: true,
        mustChangePassword: false,
      },
    });
    const partner = await prisma.partner.create({
      data: {
        companyId: company.id,
        code: `EP-${suffix.slice(0, 5).toUpperCase().replace(/[01]/g, "2")}`,
        type: "installer",
        displayName: `Synthetic ${label} partner`,
        createdByUserId: user.id,
      },
    });
    const context = companyContext(user, company);
    const tokenValue = randomBytes(32).toString("base64url");
    const tokenHash = createHash("sha256").update(tokenValue).digest("hex");
    const token = await prisma.partnerToken.create({
      data: {
        companyId: company.id,
        partnerId: partner.id,
        type: "qr",
        tokenHash,
        tokenEncrypted: encryptToken(tokenValue, {
          companyId: company.id,
          partnerId: partner.id,
          type: "qr",
          tokenHash,
        }, key),
        tokenHint: tokenValue.slice(0, 6),
        createdByUserId: user.id,
      },
    });
    return { company, user, partner, context, token, tokenHash };
  };

  const rotate = (fixture: Awaited<ReturnType<typeof makeFixture>>) => {
    const value = randomBytes(32).toString("base64url");
    const tokenHash = createHash("sha256").update(value).digest("hex");
    const result = rotatePartnerToken(fixture.context, {
      partnerId: fixture.partner.id,
      type: "qr",
      tokenHash,
      tokenEncrypted: encryptToken(value, {
        companyId: fixture.company.id,
        partnerId: fixture.partner.id,
        type: "qr",
        tokenHash,
      }, key),
      tokenHint: value.slice(0, 6),
      label: "Synthetic concurrent replacement",
      deactivateTokenIds: [fixture.token.id],
      deactivationReason: "Isolated concurrency test",
    });
    return result.then((rotation) => ({ rotation, value, tokenHash }));
  };

  const purchase = (
    fixture: Awaited<ReturnType<typeof makeFixture>>,
    suffix: string,
  ) => createPurchase(fixture.context, {
    partnerId: fixture.partner.id,
    amount: "46.00",
    partnerPresent: true,
    source: "qr",
    tokenId: fixture.token.id,
    idempotencyKey: `00000000-0000-4000-8000-${suffix}`,
    highAmountConfirmed: true,
  });

  const rotationFirst = await makeFixture("rotation-first");
  assert.ok(await findActiveTokenByHash(rotationFirst.context, rotationFirst.tokenHash));
  const rotationFirstOutcomes = await queueOnCompanyLock(
    rotationFirst.company.id,
    () => rotate(rotationFirst),
    () => purchase(rotationFirst, randomBytes(6).toString("hex")),
  );
  assert.equal(rotationFirstOutcomes[0].status, "fulfilled");
  assert.equal(rotationFirstOutcomes[1].status, "rejected");
  assert.ok(rotationFirstOutcomes[1].status === "rejected" &&
    rotationFirstOutcomes[1].reason instanceof PurchaseError &&
    rotationFirstOutcomes[1].reason.code === "NOT_FOUND");
  const [retiredToken, replacementToken] = await prisma.partnerToken.findMany({
    where: { companyId: rotationFirst.company.id, partnerId: rotationFirst.partner.id },
    orderBy: { id: "asc" },
  });
  assert.equal(retiredToken.isActive, false);
  assert.equal(replacementToken.isActive, true);
  assert.equal(await findActiveTokenByHash(rotationFirst.context, rotationFirst.tokenHash), null);
  assert.equal(await prisma.purchase.count({ where: { companyId: rotationFirst.company.id } }), 0);
  assert.deepEqual(await prisma.auditLog.groupBy({
    by: ["action"],
    where: { companyId: rotationFirst.company.id },
    _count: { _all: true },
  }), [
    { action: "token.create", _count: { _all: 1 } },
    { action: "token.deactivate", _count: { _all: 1 } },
  ]);
  assert.equal(await prisma.auditLog.count({
    where: { companyId: rotationFirst.company.id, action: { startsWith: "purchase." } },
  }), 0);
  assert.ok(rotationFirstOutcomes[0].status === "fulfilled");
  assert.ok(!("error" in rotationFirstOutcomes[0].value.rotation));
  const recoveredReplacement = decryptToken(replacementToken.tokenEncrypted!, replacementToken, key);
  assert.equal(recoveredReplacement, rotationFirstOutcomes[0].value.value);
  assert.equal(replacementToken.tokenHash, rotationFirstOutcomes[0].value.tokenHash);
  assert.equal(
    createHash("sha256").update(recoveredReplacement).digest("hex"),
    replacementToken.tokenHash,
    "replacement token plaintext matches its persisted hash",
  );

  const purchaseFirst = await makeFixture("purchase-first");
  const purchaseKey = randomBytes(6).toString("hex");
  const purchaseFirstOutcomes = await queueOnCompanyLock(
    purchaseFirst.company.id,
    () => purchase(purchaseFirst, purchaseKey),
    () => rotate(purchaseFirst),
  );
  assert.equal(purchaseFirstOutcomes[0].status, "fulfilled");
  assert.equal(purchaseFirstOutcomes[1].status, "fulfilled");
  if (purchaseFirstOutcomes[1].status !== "fulfilled") throw new Error("Queued token rotation did not complete.");
  assert.ok(!("error" in purchaseFirstOutcomes[1].value.rotation));
  if (purchaseFirstOutcomes[0].status !== "fulfilled") throw new Error("Queued purchase did not complete.");
  const committedPurchase = await prisma.purchase.findUniqueOrThrow({
    where: { id: purchaseFirstOutcomes[0].value.purchase.id },
  });
  assert.equal(committedPurchase.tokenId, purchaseFirst.token.id);
  assert.equal(committedPurchase.companyId, purchaseFirst.company.id);
  assert.equal(committedPurchase.partnerId, purchaseFirst.partner.id);
  assert.equal(committedPurchase.amount.toFixed(2), "46.00");
  assert.equal(await findActiveTokenByHash(purchaseFirst.context, purchaseFirst.tokenHash), null);
  assert.equal(await prisma.partnerToken.count({
    where: { id: purchaseFirst.token.id, isActive: false, deactivatedAt: { not: null } },
  }), 1);
  assert.equal(await prisma.purchase.count({
    where: { companyId: purchaseFirst.company.id, idempotencyKey: `00000000-0000-4000-8000-${purchaseKey}` },
  }), 1);
  assert.equal(await prisma.auditLog.count({
    where: {
      companyId: purchaseFirst.company.id,
      action: "purchase.create",
      entityId: committedPurchase.id,
    },
  }), 1);
  assert.equal(await prisma.auditLog.count({
    where: { companyId: purchaseFirst.company.id, action: "token.deactivate", entityId: purchaseFirst.token.id },
  }), 1);
  assert.equal(await prisma.auditLog.count({
    where: { companyId: purchaseFirst.company.id, action: "token.create" },
  }), 1);

  const superadmin = await prisma.user.create({
    data: {
      email: `p3-superadmin-${randomBytes(6).toString("hex")}@example.invalid`,
      name: "Synthetic Phase 3 Superadmin",
      passwordHash: "synthetic-hash",
      role: "superadmin",
      isActive: true,
      mustChangePassword: false,
    },
  });
  const superadminContext = authContext(superadmin);
  const deactivationFirst = await makeFixture("deactivation-first");
  const deactivationFirstOutcomes = await queueOnCompanyLock(
    deactivationFirst.company.id,
    () => changeCompany(superadminContext, deactivationFirst.company.id, {
      action: "deactivate",
      reason: "Isolated concurrency test",
    }),
    () => purchase(deactivationFirst, randomBytes(6).toString("hex")),
  );
  assert.equal(deactivationFirstOutcomes[0].status, "fulfilled");
  assert.equal(deactivationFirstOutcomes[1].status, "rejected");
  assert.ok(deactivationFirstOutcomes[1].status === "rejected" &&
    deactivationFirstOutcomes[1].reason instanceof CompanyInactiveError);
  assert.equal((await prisma.company.findUniqueOrThrow({ where: { id: deactivationFirst.company.id } })).isActive, false);
  assert.equal(await prisma.purchase.count({ where: { companyId: deactivationFirst.company.id } }), 0);
  assert.equal(await findActiveTokenByHash(deactivationFirst.context, deactivationFirst.tokenHash), null);
  assert.equal(await prisma.partnerToken.count({
    where: { id: deactivationFirst.token.id, isActive: true },
  }), 1, "company deactivation must disable access without mutating token history");
  assert.equal(await prisma.auditLog.count({
    where: { companyId: deactivationFirst.company.id, action: "company.deactivate" },
  }), 1);
  assert.equal(await prisma.auditLog.count({
    where: { companyId: deactivationFirst.company.id, action: "purchase.create" },
  }), 0);

  const purchaseBeforeDeactivation = await makeFixture("purchase-before-deactivation");
  const secondPurchaseKey = randomBytes(6).toString("hex");
  const purchaseBeforeOutcomes = await queueOnCompanyLock(
    purchaseBeforeDeactivation.company.id,
    () => purchase(purchaseBeforeDeactivation, secondPurchaseKey),
    () => changeCompany(superadminContext, purchaseBeforeDeactivation.company.id, {
      action: "deactivate",
      reason: "Isolated concurrency test",
    }),
  );
  assert.equal(purchaseBeforeOutcomes[0].status, "fulfilled");
  assert.equal(purchaseBeforeOutcomes[1].status, "fulfilled");
  if (purchaseBeforeOutcomes[0].status !== "fulfilled") throw new Error("Queued purchase did not complete.");
  const purchaseBeforeRow = await prisma.purchase.findUniqueOrThrow({
    where: { id: purchaseBeforeOutcomes[0].value.purchase.id },
  });
  assert.equal(purchaseBeforeRow.tokenId, purchaseBeforeDeactivation.token.id);
  assert.equal(purchaseBeforeRow.isDeleted, false);
  assert.equal((await prisma.company.findUniqueOrThrow({
    where: { id: purchaseBeforeDeactivation.company.id },
  })).isActive, false);
  assert.equal(await prisma.partnerToken.count({
    where: { id: purchaseBeforeDeactivation.token.id, isActive: true },
  }), 1, "deactivation must not mutate historical token state");
  assert.equal(await findActiveTokenByHash(purchaseBeforeDeactivation.context, purchaseBeforeDeactivation.tokenHash), null);
  assert.equal(await prisma.auditLog.count({
    where: { companyId: purchaseBeforeDeactivation.company.id, action: "purchase.create" },
  }), 1);
  assert.equal(await prisma.auditLog.count({
    where: { companyId: purchaseBeforeDeactivation.company.id, action: "company.deactivate" },
  }), 1);
  assert.equal(await prisma.auditLog.count({
    where: { companyId: purchaseBeforeDeactivation.company.id, action: { startsWith: "purchase." } },
  }), 1);
});
