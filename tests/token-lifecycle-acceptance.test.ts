import assert from "node:assert/strict";
import { createHash, randomBytes, randomUUID } from "node:crypto";
import { test } from "node:test";
import { encode } from "@auth/core/jwt";
import { Prisma, type User } from "@prisma/client";

import { prisma } from "../src/server/db";
import { generatePartnerCode } from "../src/server/partners";
import { decryptToken } from "../src/server/token-crypto";

const base = "http://127.0.0.1:3017";
const origin = "https://partners.example.invalid";
const cookieName = "__Secure-authjs.session-token";
if (!process.env.DATABASE_URL?.endsWith("/europodlahy_5a_validation")) {
  throw new Error("Token lifecycle acceptance requires the dedicated europodlahy_5a_validation database.");
}

type Envelope = {
  token: { id: string; type: "qr" | "nfc"; isActive: boolean; tokenHint: string; label: string | null };
  value: string;
  url: string;
  qrSvg: string;
  qrPng: string;
};

async function clientFor(user?: User) {
  let cookie = "";
  if (user) {
    const now = Date.now();
    cookie = `${cookieName}=${await encode({
      salt: cookieName, secret: process.env.AUTH_SECRET!,
      token: {
        userId: user.id.toString(), companyId: user.companyId?.toString() ?? null,
        tenantVersion: 1, role: user.role, mustChangePassword: user.mustChangePassword,
        passwordChangedAt: user.passwordChangedAt?.getTime() ?? 0,
        loginAt: now, lastActivityAt: now, isSessionValid: true,
      },
    })}`;
  }
  return async (path: string, init: RequestInit = {}, companyId?: bigint, requestOrigin: string | null = origin) => {
    const headers = new Headers(init.headers);
    headers.set("Cookie", cookie);
    if (requestOrigin !== null) headers.set("Origin", requestOrigin);
    if (companyId !== undefined) headers.set("X-Company-Id", companyId.toString());
    if (init.body && !headers.has("Content-Type")) headers.set("Content-Type", "application/json");
    return fetch(`${base}${path}`, { ...init, headers, redirect: "manual" });
  };
}

const json = (values: unknown): RequestInit => ({ method: "POST", body: JSON.stringify(values) });
const openPath = (id: string | bigint) => `/api/tokens/${id}/open`;
const hashToken = (value: string) => createHash("sha256").update(value).digest("hex");
const serialize = (value: unknown) => JSON.stringify(value, (_key, field) => typeof field === "bigint" ? field.toString() : field);

async function status(response: Response, expected: number, code?: string) {
  assert.equal(response.status, expected, (await response.clone().text()).slice(0, 300));
  if (code) assert.equal((await response.clone().json()).error?.code, code);
}

function assertNoSecrets(value: unknown, secrets: string[]) {
  const text = serialize(value);
  for (const secret of secrets) assert.ok(!text.includes(secret), "response or audit must not contain token secrets");
  const visit = (node: unknown) => {
    if (!node || typeof node !== "object") return;
    for (const [key, field] of Object.entries(node)) {
      assert.ok(!/^(value|url|tokenHash|tokenEncrypted|ciphertext|qrSvg|qrPng|tokenValue|token_hash|token_encrypted)$/i.test(key),
        `secret field ${key} must not be exposed`);
      visit(field);
    }
  };
  visit(value);
}

function assertArtwork(envelope: Envelope) {
  assert.match(envelope.value, /^[A-Za-z0-9_-]{43}$/);
  assert.equal(envelope.url, `${origin}/k/${envelope.value}`);
  assert.match(envelope.qrSvg, /<svg\b/);
  assert.match(envelope.qrPng, /^data:image\/png;base64,/);
  const png = Buffer.from(envelope.qrPng.split(",")[1], "base64");
  assert.equal(png.subarray(0, 8).toString("hex"), "89504e470d0a1a0a");
  assert.equal(envelope.token.tokenHint, envelope.value.slice(0, 6));
  assert.equal(envelope.token.isActive, true);
}

test("reopenable QR/NFC lifecycle HTTP and database regression", async (t) => {
  assert.equal(process.env.NODE_ENV, "production");
  assert.equal(process.env.APP_BASE_URL, origin);
  assert.match(process.env.TOKEN_ENCRYPTION_KEY ?? "", /^[a-fA-F0-9]{64}$/);
  assert.ok(process.env.AUTH_SECRET && process.env.AUTH_SECRET.length >= 32);
  const unique = randomUUID();
  const company = await prisma.company.create({ data: { name: "Token lifecycle A", slug: `token-a-${unique}` } });
  const otherCompany = await prisma.company.create({ data: { name: "Token lifecycle B", slug: `token-b-${unique}` } });
  const createUser = (role: User["role"], label: string, companyId: bigint | null) =>
    prisma.user.create({ data: {
      role, companyId, email: `token-${unique}-${label}@example.test`, name: label,
      passwordHash: "unused-jwt-fixture", mustChangePassword: false,
    } });
  try {
    const [admin, seller, otherAdmin, superadmin] = await Promise.all([
      createUser("admin", "admin", company.id), createUser("seller", "seller", company.id),
      createUser("admin", "other", otherCompany.id), createUser("superadmin", "superadmin", null),
    ]);
    const createPartner = async (companyId = company.id, createdByUserId = admin.id) => {
      for (let attempt = 0; attempt < 20; attempt++) {
        try {
          return await prisma.partner.create({ data: {
            companyId, createdByUserId, code: generatePartnerCode(),
            type: "installer", displayName: `Token partner ${unique}`,
          } });
        } catch (error) {
          if (!(error instanceof Prisma.PrismaClientKnownRequestError) || error.code !== "P2002") throw error;
        }
      }
      throw new Error("Could not allocate a unique partner fixture code.");
    };
    const partner = await createPartner();
    const foreignPartner = await createPartner(otherCompany.id, otherAdmin.id);
    const [client, sellerClient, foreignClient, saClient, anonymous] = await Promise.all([
      clientFor(admin), clientFor(seller), clientFor(otherAdmin), clientFor(superadmin), clientFor(),
    ]);
    const tokensPath = `/api/partners/${partner.id}/tokens`;
    const tokensWhere = { companyId: company.id, partnerId: partner.id };
    const secrets: string[] = [];
    const remember = async (envelope: Envelope) => {
      assertArtwork(envelope);
      const stored = await prisma.partnerToken.findUniqueOrThrow({ where: { id: BigInt(envelope.token.id) } });
      assert.equal(stored.companyId, company.id);
      assert.equal(stored.partnerId, partner.id);
      assert.equal(stored.tokenHash, hashToken(envelope.value));
      assert.ok(stored.tokenEncrypted);
      assert.notEqual(stored.tokenEncrypted, envelope.value);
      assert.equal(decryptToken(stored.tokenEncrypted, stored, process.env.TOKEN_ENCRYPTION_KEY), envelope.value);
      secrets.push(envelope.value, envelope.url, stored.tokenHash, stored.tokenEncrypted);
      return envelope;
    };
    const issue = async (type: "qr" | "nfc", extra = {}) => {
      const response = await client(tokensPath, json({ type, label: `${type} lifecycle`, ...extra }));
      await status(response, 201);
      assert.match(response.headers.get("Cache-Control") ?? "", /(?:^|,)\s*no-store(?:,|$)/);
      const envelope: Envelope = await response.json();
      assert.equal(envelope.token.type, type);
      return remember(envelope);
    };
    const publicCard = async (envelope: Envelope) => {
      const response = await fetch(`${base}/api/public/card/${envelope.value}`);
      await status(response, 200);
      assert.match(response.headers.get("Cache-Control") ?? "", /(?:^|,)\s*no-store(?:,|$)/);
      return response.json();
    };
    const scan = async (envelope: Envelope, expected = 200) => {
      const response = await sellerClient("/api/scan/resolve", json({ token: envelope.value }));
      await status(response, expected, expected === 404 ? "NOT_FOUND" : undefined);
      if (expected === 200) {
        const body = await response.json();
        assert.equal(body.partnerId, partner.id.toString());
        assert.equal(body.code, partner.code);
        assert.equal(body.tokenId, envelope.token.id);
        assert.equal(body.source, envelope.token.type);
      }
    };
    const revoked = async (envelope: Envelope) => {
      await status(await client(openPath(envelope.token.id), { method: "POST" }), 404, "NOT_FOUND");
      await status(await fetch(`${base}/api/public/card/${envelope.value}`), 404, "NOT_FOUND");
      await scan(envelope, 404);
    };
    let qr = await issue("qr");
    let nfc = await issue("nfc");
    assert.notEqual(qr.value, nfc.value);
    assert.notEqual(qr.url, nfc.url);
    const purchaseResponse = await client("/api/purchases", json({
      partnerId: partner.id.toString(), amount: "123.00", partnerPresent: true,
      source: "qr", tokenId: qr.token.id, idempotencyKey: randomUUID(),
    }));
    await status(purchaseResponse, 201);
    const purchase = (await purchaseResponse.json()).purchase;
    const originalPurchases = await prisma.purchase.findMany({ where: tokensWhere, orderBy: { id: "asc" } });
    assert.equal(originalPurchases.length, 1);
    assert.equal(originalPurchases[0].tokenId?.toString(), qr.token.id);
    const initialCard = await publicCard(qr);
    assert.equal(initialCard.code, partner.code);
    assert.equal(initialCard.displayName, partner.displayName);
    assert.equal(initialCard.totalPoints, purchase.points);
    assert.equal(initialCard.totalGrossAmount, "123.00");
    assert.equal(initialCard.purchases.total, 1);
    assert.deepEqual(await publicCard(nfc), initialCard);

    await t.test("repeated reopen keeps exact value, artwork, IDs, counts and purchases unchanged", async () => {
      const count = await prisma.partnerToken.count({ where: tokensWhere });
      for (const envelope of [qr, nfc]) {
        const storedBefore = await prisma.partnerToken.findUniqueOrThrow({ where: { id: BigInt(envelope.token.id) } });
        const auditBefore = await prisma.auditLog.count({
          where: { ...tokensWhere, action: "token.open", entityId: BigInt(envelope.token.id) },
        });
        for (let repeat = 0; repeat < 3; repeat++) {
          const response = await client(openPath(envelope.token.id), { method: "POST" });
          await status(response, 200);
          assert.match(response.headers.get("Cache-Control") ?? "", /(?:^|,)\s*no-store(?:,|$)/);
          assert.equal(response.headers.get("X-Content-Type-Options"), "nosniff");
          const reopened: Envelope = await response.json();
          assertArtwork(reopened);
          for (const key of ["value", "url", "qrSvg", "qrPng"] as const) assert.equal(reopened[key], envelope[key]);
          assert.equal(reopened.token.id, envelope.token.id);
          assert.equal(reopened.token.label, envelope.token.label);
          assertNoSecrets(reopened.token, secrets);
        }
        assert.deepEqual(await prisma.partnerToken.findUniqueOrThrow({
          where: { id: BigInt(envelope.token.id) },
        }), storedBefore);
        assert.equal(await prisma.auditLog.count({
          where: { ...tokensWhere, action: "token.open", entityId: BigInt(envelope.token.id) },
        }), auditBefore + 3);
      }
      assert.equal(await prisma.partnerToken.count({ where: tokensWhere }), count);
      assert.deepEqual(await prisma.purchase.findMany({ where: tokensWhere, orderBy: { id: "asc" } }), originalPurchases);
      await scan(qr);
      await scan(nfc);
    });

    await t.test("open enforces authentication, tenant, role, valid ID and actual same-origin headers", async () => {
      const before = await prisma.auditLog.count({ where: { ...tokensWhere, action: "token.open" } });
      await status(await anonymous(openPath(qr.token.id), { method: "POST" }), 401);
      await status(await sellerClient(openPath(qr.token.id), { method: "POST" }), 403, "FORBIDDEN");
      await status(await foreignClient(openPath(qr.token.id), { method: "POST" }), 404, "NOT_FOUND");
      await status(await client(openPath(qr.token.id), { method: "POST" }, otherCompany.id), 403, "FORBIDDEN");
      await status(await saClient(openPath(qr.token.id), { method: "POST" }), 400, "COMPANY_CONTEXT_REQUIRED");
      for (const invalid of ["0", "-1", "not-an-id", "18446744073709551616"]) {
        await status(await client(openPath(invalid), { method: "POST" }), 400, "VALIDATION_ERROR");
      }
      for (const value of [null, "", "null", "https://evil.example.invalid"]) {
        await status(await client(openPath(qr.token.id), { method: "POST" }, undefined, value), 403, "INVALID_ORIGIN");
      }
      assert.equal(await prisma.auditLog.count({ where: { ...tokensWhere, action: "token.open" } }), before);
      const explicit = await saClient(openPath(qr.token.id), { method: "POST" }, company.id);
      await status(explicit, 200);
      assert.equal((await explicit.json()).value, qr.value);
      await status(await saClient(openPath(qr.token.id), { method: "POST" }, otherCompany.id), 404, "NOT_FOUND");
    });

    await t.test("same-type duplicates and invalid replacement selections never revoke the old access", async () => {
      const rowsBefore = await prisma.partnerToken.findMany({ where: tokensWhere, orderBy: { id: "asc" } });
      const auditsBefore = await prisma.auditLog.count({ where: tokensWhere });
      for (const type of ["qr", "nfc"]) {
        await status(await client(tokensPath, json({ type })), 409, "ACTIVE_TOKEN_EXISTS");
      }
      const foreignValue = randomBytes(32).toString("base64url");
      const foreignToken = await prisma.partnerToken.create({ data: {
        companyId: otherCompany.id, partnerId: foreignPartner.id, type: "qr",
        tokenHash: hashToken(foreignValue), tokenHint: foreignValue.slice(0, 6), createdByUserId: otherAdmin.id,
      } });
      const cases: Array<[unknown, number, string?]> = [
        [{ type: "qr", deactivateTokenIds: [qr.token.id] }, 400],
        [{ type: "qr", deactivateTokenIds: [qr.token.id], deactivationReason: "   " }, 400],
        [{ type: "qr", deactivateTokenIds: [qr.token.id, qr.token.id], deactivationReason: "Duplicate selection" }, 400],
        [{ type: "qr", deactivateTokenIds: [qr.token.id, foreignToken.id.toString()], deactivationReason: "Foreign selection" }, 404, "NOT_FOUND"],
        [{ type: "qr", deactivateTokenIds: [qr.token.id, "18446744073709551615"], deactivationReason: "Missing selection" }, 404, "NOT_FOUND"],
        [{ type: "qr", deactivateTokenIds: [qr.token.id, nfc.token.id], deactivationReason: "Mixed types" }, 409, "TOKEN_SELECTION_CHANGED"],
      ];
      for (const [body, expected, code] of cases) await status(await client(tokensPath, json(body)), expected, code);
      assert.deepEqual(await prisma.partnerToken.findMany({ where: tokensWhere, orderBy: { id: "asc" } }), rowsBefore);
      assert.equal(await prisma.auditLog.count({ where: tokensWhere }), auditsBefore);
      assert.deepEqual(await publicCard(qr), initialCard);
      assert.deepEqual(await publicCard(nfc), initialCard);
    });

    await t.test("atomic QR replacement retires only QR and preserves partner identity and history", async () => {
      const old = qr;
      const count = await prisma.partnerToken.count({ where: tokensWhere });
      qr = await issue("qr", { deactivateTokenIds: [old.token.id], deactivationReason: "Replace damaged QR" });
      assert.notEqual(qr.value, old.value);
      assert.notEqual(qr.token.id, old.token.id);
      assert.equal(await prisma.partnerToken.count({ where: tokensWhere }), count + 1);
      assert.equal(await prisma.partnerToken.count({ where: { ...tokensWhere, type: "qr", isActive: true } }), 1);
      const retired = await prisma.partnerToken.findUniqueOrThrow({ where: { id: BigInt(old.token.id) } });
      assert.equal(retired.isActive, false);
      assert.equal(retired.deactivationReason, "Replace damaged QR");
      assert.equal(retired.deactivatedByUserId, admin.id);
      assert.ok(retired.deactivatedAt);
      await revoked(old);
      await scan(qr);
      await scan(nfc);
      assert.deepEqual(await publicCard(qr), initialCard);
      assert.deepEqual(await publicCard(nfc), initialCard);
      await status(await client(tokensPath, json({
        type: "qr", deactivateTokenIds: [old.token.id], deactivationReason: "Stale previous QR",
      })), 409, "TOKEN_SELECTION_CHANGED");
      assert.deepEqual(await prisma.purchase.findMany({ where: tokensWhere, orderBy: { id: "asc" } }), originalPurchases);
    });

    await t.test("concurrent NFC replacements have exactly one winner and a stale-selection loser", async () => {
      const old = nfc;
      const count = await prisma.partnerToken.count({ where: tokensWhere });
      const results = await Promise.all(Array.from({ length: 2 }, () => client(tokensPath, json({
        type: "nfc", deactivateTokenIds: [old.token.id], deactivationReason: "Replace NFC concurrently",
      }))));
      assert.deepEqual(results.map((response) => response.status).sort(), [201, 409]);
      const winner = results.find((response) => response.status === 201)!;
      nfc = await remember(await winner.json());
      await status(results.find((response) => response.status === 409)!, 409, "TOKEN_SELECTION_CHANGED");
      assert.notEqual(nfc.value, old.value);
      assert.equal(await prisma.partnerToken.count({ where: tokensWhere }), count + 1);
      assert.equal(await prisma.partnerToken.count({ where: { ...tokensWhere, type: "nfc", isActive: true } }), 1);
      await revoked(old);
      await scan(nfc);
      await scan(qr);
      assert.deepEqual(await publicCard(nfc), initialCard);
      assert.deepEqual(await publicCard(qr), initialCard);
    });

    await t.test("explicit deactivation invalidates open, public card and scan, then permits fresh issuance", async () => {
      const old = qr;
      await status(await client(`/api/tokens/${old.token.id}/deactivate`, json({ reason: "Lost printed card" })), 200);
      await revoked(old);
      assert.deepEqual(await publicCard(nfc), initialCard);
      qr = await issue("qr");
      assert.notEqual(qr.value, old.value);
      assert.deepEqual(await publicCard(qr), initialCard);
      assert.deepEqual(await prisma.purchase.findMany({ where: tokensWhere, orderBy: { id: "asc" } }), originalPurchases);
    });

    await t.test("database insert/update triggers enforce one active of each type but allow multiple inactive rows", async () => {
      const before = await prisma.partnerToken.count({ where: tokensWhere });
      const direct = (type: "qr" | "nfc", isActive: boolean) => {
        const value = randomBytes(32).toString("base64url");
        return prisma.partnerToken.create({ data: {
          ...tokensWhere, type, isActive, tokenHash: hashToken(value), tokenHint: value.slice(0, 6), createdByUserId: admin.id,
        } });
      };
      for (const type of ["qr", "nfc"] as const) {
        await assert.rejects(direct(type, true), (error) =>
          error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002");
        const inactive = await Promise.all([direct(type, false), direct(type, false)]);
        assert.equal(inactive.length, 2);
        for (const row of inactive) {
          await assert.rejects(prisma.partnerToken.update({
            where: { id: row.id }, data: { isActive: true },
          }), (error) => error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002");
          assert.equal((await prisma.partnerToken.findUniqueOrThrow({ where: { id: row.id } })).isActive, false);
        }
      }
      assert.equal(await prisma.partnerToken.count({ where: tokensWhere }), before + 4);
      const derived = await prisma.$queryRaw<Array<{ id: bigint; activeType: string | null; type: string; isActive: number | boolean }>>`
        SELECT id, active_type AS activeType, type, is_active AS isActive
        FROM partner_tokens WHERE company_id = ${company.id} AND partner_id = ${partner.id}`;
      for (const row of derived) assert.equal(row.activeType, row.isActive ? row.type : null);
    });

    await t.test("inactive partner/company reject reopening and legacy hash-only tokens cannot be recovered", async () => {
      await prisma.partner.update({ where: { id: partner.id }, data: { isActive: false } });
      try {
        await status(await client(openPath(qr.token.id), { method: "POST" }), 404, "NOT_FOUND");
        await status(await client(tokensPath, json({ type: "qr" })), 404, "NOT_FOUND");
        await status(await fetch(`${base}/api/public/card/${qr.value}`), 404, "NOT_FOUND");
        await scan(qr, 404);
      } finally {
        await prisma.partner.update({ where: { id: partner.id }, data: { isActive: true } });
      }
      await prisma.company.update({ where: { id: company.id }, data: { isActive: false } });
      try {
        await status(await client(openPath(qr.token.id), { method: "POST" }), 403, "COMPANY_INACTIVE");
        await status(await saClient(openPath(qr.token.id), { method: "POST" }, company.id), 409, "COMPANY_INACTIVE");
        await status(await fetch(`${base}/api/public/card/${qr.value}`), 404, "NOT_FOUND");
      } finally {
        await prisma.company.update({ where: { id: company.id }, data: { isActive: true } });
      }
      const legacyPartner = await createPartner();
      const legacyValue = randomBytes(32).toString("base64url");
      const legacy = await prisma.partnerToken.create({ data: {
        companyId: company.id, partnerId: legacyPartner.id, type: "qr",
        tokenHash: hashToken(legacyValue), tokenHint: legacyValue.slice(0, 6), createdByUserId: admin.id,
      } });
      assert.equal(legacy.tokenEncrypted, null);
      const auditBefore = await prisma.auditLog.count({ where: { entityType: "token", entityId: legacy.id } });
      await status(await client(openPath(legacy.id), { method: "POST" }), 409, "TOKEN_NOT_RECOVERABLE");
      assert.equal(await prisma.auditLog.count({ where: { entityType: "token", entityId: legacy.id } }), auditBefore);
      assert.equal((await prisma.partnerToken.findUniqueOrThrow({ where: { id: legacy.id } })).isActive, true);
      const replacementResponse = await client(`/api/partners/${legacyPartner.id}/tokens`, json({
        type: "qr", deactivateTokenIds: [legacy.id.toString()], deactivationReason: "Replace legacy card",
      }));
      await status(replacementResponse, 201);
      const replacement: Envelope = await replacementResponse.json();
      assertArtwork(replacement);
      assert.notEqual(replacement.value, legacyValue);
      await status(await fetch(`${base}/api/public/card/${legacyValue}`), 404, "NOT_FOUND");
      const reopened = await client(openPath(replacement.token.id), { method: "POST" });
      await status(reopened, 200);
      assert.equal((await reopened.json()).value, replacement.value);
    });

    await t.test("lists and stored/HTTP audits contain metadata only, never plaintext, hashes or ciphertext", async () => {
      const response = await client(tokensPath);
      await status(response, 200);
      assert.match(response.headers.get("Cache-Control") ?? "", /(?:^|,)\s*no-store(?:,|$)/);
      const listing = await response.json();
      assert.equal(listing.tokens.length, await prisma.partnerToken.count({ where: tokensWhere }));
      assert.equal(listing.tokens.filter((token: Envelope["token"]) => token.isActive).length, 2);
      assertNoSecrets(listing, secrets);
      const logs = await prisma.auditLog.findMany({
        where: { ...tokensWhere, action: { startsWith: "token." } }, orderBy: { id: "asc" },
      });
      assert.ok(logs.some((log) => log.action === "token.create"));
      assert.ok(logs.some((log) => log.action === "token.deactivate"));
      const opens = logs.filter((log) => log.action === "token.open");
      assert.ok(opens.length >= 7);
      for (const log of opens) {
        assert.equal(log.entityType, "token");
        assert.equal(log.companyId, company.id);
        assert.equal(log.partnerId, partner.id);
        assert.ok([admin.id, superadmin.id].includes(log.userId!));
        assert.ok(log.entityId);
        const opened = await prisma.partnerToken.findUniqueOrThrow({ where: { id: log.entityId! } });
        assert.deepEqual(log.newValues, { type: opened.type, tokenHint: opened.tokenHint });
      }
      assertNoSecrets(logs, secrets);
      const auditResponse = await client(`/api/audit-logs?partnerId=${partner.id}&action=token.open`);
      await status(auditResponse, 200);
      const auditBody = await auditResponse.json();
      assert.equal(auditBody.total, opens.length);
      assertNoSecrets(auditBody, secrets);
      assert.deepEqual(await prisma.purchase.findMany({ where: tokensWhere, orderBy: { id: "asc" } }), originalPurchases);
      assert.deepEqual(await publicCard(qr), initialCard);
      assert.deepEqual(await publicCard(nfc), initialCard);
    });
  } finally {
    await prisma.$disconnect();
  }
});
