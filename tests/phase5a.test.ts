import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { test } from "node:test";
import { hash } from "@node-rs/argon2";
import { encode } from "@auth/core/jwt";
import type { Company, User } from "@prisma/client";
import type { AuthContext, CompanyContext } from "../src/server/auth/session";
import { prisma } from "../src/server/db";
import { bootstrapUser } from "../prisma/bootstrap";
import { setSuperadminActivity } from "../src/server/companies";
import { record } from "../src/server/audit";
import { createPurchase, findPurchaseById, listPartnerPurchases } from "../src/server/repositories/purchases";
import { companyCookieName, readCompanySelection, signCompanySelection } from "../src/server/auth/company-cookie";
import { userCreateSchema, userUpdateSchema, partnerCreateSchema } from "../src/lib/schemas";
import { closeMonthlyBadges, previousCalendarMonth } from "../src/server/monthly-badges";

const base = "http://127.0.0.1:3017";
const origin = "https://partners.example.invalid";
const password = process.env.PHASE5A_PASSWORD!;
if (!process.env.DATABASE_URL?.endsWith("/europodlahy_5a_validation")) {
  throw new Error("Tests require the dedicated phase5a validation database.");
}

class Browser {
  cookies = new Map<string, string>();
  async request(path: string, init: RequestInit = {}, companyId?: string) {
    const headers = new Headers(init.headers);
    headers.set("Cookie", [...this.cookies].map(([key, value]) => `${key}=${value}`).join("; "));
    headers.set("Origin", origin);
    if (companyId) headers.set("X-Company-Id", companyId);
    if (init.body && !headers.has("Content-Type")) headers.set("Content-Type", "application/json");
    const response = await fetch(`${base}${path}`, { ...init, headers, redirect: "manual" });
    for (const value of response.headers.getSetCookie()) {
      const cookie = value.split(";")[0];
      const separator = cookie.indexOf("=");
      this.cookies.set(cookie.slice(0, separator), cookie.slice(separator + 1));
    }
    return response;
  }
  async login(email: string, credentialPassword = password) {
    const csrf = await (await this.request("/api/auth/csrf")).json();
    await this.request("/api/auth/callback/credentials", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded", "X-Auth-Return-Redirect": "1" },
      body: new URLSearchParams({ csrfToken: csrf.csrfToken, email, password: credentialPassword, callbackUrl: `${base}/app` }),
    });
    const session = await (await this.request("/api/auth/session")).json();
    assert.equal(session.user?.isSessionValid, true, `Login failed for test account ${email}`);
    return session;
  }
}
function context(user: User): AuthContext {
  return { user, session: {
    expires: new Date(Date.now() + 3600000).toISOString(),
    user: { id: user.id.toString(), name: user.name, email: user.email, role: user.role,
      companyId: user.companyId?.toString() ?? null, mustChangePassword: user.mustChangePassword,
      passwordChangedAt: user.passwordChangedAt?.getTime() ?? 0,
      isSessionValid: true, loginAt: Date.now(), lastActivityAt: Date.now() },
  } };
}
function companyContext(user: User, company: Company): CompanyContext {
  return { ...context(user), company, companyId: company.id, selectionId: "" };
}
const json = (method: string, values: unknown): RequestInit => ({ method, body: JSON.stringify(values) });

test("phase 5A database and HTTP isolation", async (t) => {
  try {
    const globalUser = await bootstrapUser(prisma, {
      email: "superadmin@example.test", name: "Test superadmin", role: "superadmin", password, companyId: null,
    });
    assert.equal(globalUser.mustChangePassword, true);
    const sa = new Browser();
    await sa.login(globalUser.email);
    assert.equal((await sa.request("/api/superadmin/companies")).status, 403);
    const superadminPassword = `${password}-changed`;
    assert.equal((await sa.request("/api/me/password", json("POST", {
      currentPassword: password, newPassword: superadminPassword,
    }))).status, 200);
    assert.equal((await sa.request("/api/superadmin/companies")).status, 401);
    await sa.login(globalUser.email, superadminPassword);
    const saUser = await prisma.user.findUniqueOrThrow({ where: { id: globalUser.id } });
    const saContext = context(saUser);
    const legacy = new Browser();
    await legacy.login("legacy.admin@example.test");
    const seller = new Browser();
    await seller.login("legacy.seller@example.test");

    await t.test("production rejects all local quick-login roles", async () => {
      for (const testRole of ["superadmin", "admin", "seller"]) {
        const browser = new Browser();
        const csrf = await (await browser.request("/api/auth/csrf")).json();
        await browser.request("/api/auth/callback/credentials", {
          method: "POST",
          headers: {
            "Content-Type": "application/x-www-form-urlencoded",
            "X-Auth-Return-Redirect": "1",
          },
          body: new URLSearchParams({
            csrfToken: csrf.csrfToken,
            testRole,
            callbackUrl: `${base}/app`,
          }),
        });
        const session = await (await browser.request("/api/auth/session")).json();
        assert.notEqual(session?.user?.isSessionValid, true);
      }
    });

    await t.test("bootstrap never promotes or resets existing accounts", async () => {
      await assert.rejects(bootstrapUser(prisma, {
        email: "legacy.admin@example.test", name: "Escalation", role: "superadmin", password, companyId: null,
      }));
      const again = await bootstrapUser(prisma, {
        email: saUser.email, name: "Overwrite", role: "superadmin", password: "different-password", companyId: null,
      });
      assert.equal(again.name, saUser.name);
      assert.equal(again.passwordHash, saUser.passwordHash);
      assert.equal((await prisma.user.findUniqueOrThrow({ where: { id: BigInt(1) } })).role, "admin");
    });

    const response = await sa.request("/api/superadmin/companies", json("POST", {
      name: "Second company", slug: "second-company",
      admin: { name: "Second admin", email: "second.admin@example.test", temporaryPassword: password },
    }));
    assert.equal(response.status, 201);
    const { company: secondDto } = await response.json();
    const second = await prisma.company.findUniqueOrThrow({ where: { id: BigInt(secondDto.id) } });
    const secondAdmin = await prisma.user.update({
      where: { email: "second.admin@example.test" }, data: { mustChangePassword: false },
    });
    const secondBrowser = new Browser();
    await secondBrowser.login(secondAdmin.email);
    const secondPartner = await prisma.partner.create({ data: {
      companyId: second.id, code: "EP-ABCDE", type: "installer", displayName: "Private second partner",
      createdByUserId: secondAdmin.id,
    } });
    const secondToken = await prisma.partnerToken.create({ data: {
      companyId: second.id, partnerId: secondPartner.id, type: "nfc", tokenHash: "a".repeat(64), tokenHint: "abcdef",
      createdByUserId: secondAdmin.id,
    } });

    await t.test("company+admin creation is atomic and platform guard rejects company roles", async () => {
      const duplicate = await sa.request("/api/superadmin/companies", json("POST", {
        name: "Must roll back", slug: "must-roll-back",
        admin: { name: "Duplicate", email: secondAdmin.email, temporaryPassword: password },
      }));
      assert.equal(duplicate.status, 409);
      assert.equal(await prisma.company.count({ where: { slug: "must-roll-back" } }), 0);
      assert.equal((await legacy.request("/api/superadmin/companies")).status, 403);
      assert.equal((await legacy.request("/api/superadmin/companies", json("POST", {}))).status, 403);
      assert.equal((await legacy.request("/api/superadmin/audit-logs")).status, 403);
      assert.equal((await seller.request("/api/users")).status, 403);
      assert.equal((await new Browser().request("/api/users")).status, 401);
      const audit = await prisma.auditLog.findFirstOrThrow({ where: { action: "company.create", entityId: second.id } });
      assert.equal(audit.userId, saUser.id);
      assert.equal(audit.companyId, second.id);
      const update = await sa.request(`/api/superadmin/companies/${second.id}`,
        json("PATCH", { name: "Second company updated", ico: "12345678" }));
      assert.equal(update.status, 200);
      const detail = await (await sa.request(`/api/superadmin/companies/${second.id}`)).json();
      assert.equal(detail.company.name, "Second company updated");
      assert.equal(detail.company.admins[0].id, secondAdmin.id.toString());
      assert.equal((await sa.request(`/api/superadmin/companies/${second.id}`,
        json("PATCH", { slug: "cannot-change" }))).status, 400);
      assert.equal((await sa.request(`/api/superadmin/companies/${second.id}`,
        json("PATCH", { vatRatePercent: "20.00" }))).status, 400);
      assert.equal((await sa.request("/api/company/settings", json("PATCH", {
        vatRatePercent: "20.00", purchaseConfirmAboveEur: null,
        bronzeMonthlyTurnoverEur: null, silverMonthlyTurnoverEur: null, goldMonthlyTurnoverEur: null,
      }), second.id.toString())).status, 403);
      assert.equal((await prisma.company.findUniqueOrThrow({ where: { id: second.id } })).vatRatePercent.toFixed(2), "23.00");
      assert.equal((await sa.request(`/api/superadmin/companies/${second.id}/deactivate`,
        json("POST", {}))).status, 400);
    });

    await t.test("strict payloads prohibit global roles and company reassignment", async () => {
      assert.equal(userCreateSchema.safeParse({ email: "x@example.test", name: "Test", temporaryPassword: password, role: "superadmin" }).success, false);
      assert.equal(userUpdateSchema.safeParse({ companyId: second.id.toString(), isActive: true }).success, false);
      assert.equal(partnerCreateSchema.safeParse({ type: "installer", displayName: "Test", companyId: second.id.toString() }).success, false);
      assert.equal((await legacy.request("/api/users/2", json("PATCH", { role: "superadmin" }))).status, 400);
      assert.equal((await legacy.request("/api/users/2", json("PATCH", { companyId: second.id.toString() }))).status, 400);
      assert.equal((await legacy.request("/api/partners", {}, second.id.toString())).status, 403);
      for (const companyId of ["invalid", "0", "99999999999999999999"]) {
        assert.equal((await sa.request("/api/superadmin/company-context", json("POST", { companyId }))).status, 400);
      }
      assert.equal((await legacy.request("/api/partners/3/tokens", json("POST", {
        type: "qr", deactivateTokenIds: ["invalid"], deactivationReason: "Test invalid ID",
      }))).status, 400);
    });

    await t.test("all existing foreign-ID reads and writes are neutral 404", async () => {
      for (const [path, init] of [
        [`/api/partners/${secondPartner.id}`, {}],
        [`/api/partners/${secondPartner.id}/summary`, {}],
        [`/api/partners/${secondPartner.id}/tokens`, {}],
        [`/api/partners/${secondPartner.id}`, json("PATCH", { displayName: "Forbidden" })],
        [`/api/partners/${secondPartner.id}/activate`, json("POST", {})],
        [`/api/partners/${secondPartner.id}/deactivate`, json("POST", { reason: "Forbidden" })],
        [`/api/partners/${secondPartner.id}/tokens`, json("POST", { type: "qr" })],
        [`/api/tokens/${secondToken.id}/deactivate`, json("POST", { reason: "Forbidden" })],
        [`/api/users/${secondAdmin.id}`, json("PATCH", { name: "Forbidden" })],
        [`/api/users/${secondAdmin.id}/reset-password`, json("POST", { temporaryPassword: password })],
      ] as Array<[string, RequestInit]>) {
        assert.equal((await legacy.request(path, init)).status, 404, path);
      }
      const list = await (await secondBrowser.request("/api/partners")).json();
      assert.equal((await legacy.request("/api/partners/3/tokens", json("POST", {
        type: "qr", deactivateTokenIds: [secondToken.id.toString()], deactivationReason: "Foreign selection",
      }))).status, 404);
      assert.equal(list.total, 1);
      assert.equal(list.items[0].id, secondPartner.id.toString());
      const users = await (await secondBrowser.request("/api/users")).json();
      assert.deepEqual(users.users.map((user: { id: string }) => user.id), [secondAdmin.id.toString()]);
      const summary = await (await secondBrowser.request(`/api/partners/${secondPartner.id}/summary`)).json();
      assert.equal(summary.partner.totalPoints, 0);
      assert.equal((await secondBrowser.request("/api/scan/resolve", json("POST", { token: process.env.PHASE5A_TOKEN }))).status, 404);
      assert.equal((await legacy.request("/api/scan/resolve", json("POST", { token: process.env.PHASE5A_TOKEN }))).status, 200);
      const foreignSsr = await secondBrowser.request("/app/partneri/3");
      const foreignHtml = await foreignSsr.text();
      // PPR can start the stream before notFound()/redirect() executes.
      assert.ok(foreignSsr.status === 404 || foreignHtml.includes("NEXT_HTTP_ERROR_FALLBACK;404"));
      assert.equal(foreignHtml.includes("Legacy partner"), false);
      assert.equal((await secondBrowser.request("/app/users")).status, 200);
      const ssr = await (await seller.request("/app/partneri")).text();
      assert.equal(ssr.includes("Private second partner"), false);
    });

    await t.test("compound foreign keys and scoped purchase repositories", async () => {
      const ctx = companyContext(secondAdmin, second);
      assert.equal(await findPurchaseById(ctx, BigInt(5)), null);
      assert.deepEqual(await listPartnerPurchases(ctx, BigInt(3), 0, 20), []);
      await assert.rejects(prisma.user.create({ data: {
        email: "missing.company@example.test", name: "Invalid admin", role: "admin",
        passwordHash: "invalid",
      } }));
      await assert.rejects(prisma.user.create({ data: {
        email: "invalid.superadmin@example.test", name: "Invalid superadmin", role: "superadmin",
        companyId: second.id, passwordHash: "invalid",
      } }));
      await assert.rejects(prisma.partnerToken.create({ data: {
        companyId: second.id, partnerId: BigInt(3), type: "qr", tokenHash: "b".repeat(64), tokenHint: "abcdef",
      } }));
      await assert.rejects(prisma.purchase.create({ data: {
        companyId: second.id, partnerId: secondPartner.id, tokenId: BigInt(4),
        amount: "10", netAmount: "8.13", vatRatePercent: "23.00",
        points: 8, partnerPresent: true, source: "qr", createdByUserId: secondAdmin.id,
      } }));
      await assert.rejects(prisma.$transaction((tx) => createPurchase(ctx, {
        partnerId: BigInt(3), amount: "10", netAmount: "8.13", vatRatePercent: "23.00",
        points: 8, partnerPresent: true, source: "manual",
      }, tx)));
      await assert.rejects(record({
        companyId: second.id, userId: BigInt(1), action: "invalid.actor", entityType: "company",
      }));
      await assert.rejects(prisma.auditLog.create({ data: {
        companyId: second.id, partnerId: BigInt(3), action: "invalid.partner", entityType: "partner",
      } }));
    });

    await t.test("JWT migration, company/role claims and session time limits are enforced", async () => {
      const cookie = "__Secure-authjs.session-token";
      const now = Date.now();
      const valid = { userId: "1", companyId: "1", tenantVersion: 1, role: "admin",
        mustChangePassword: false, passwordChangedAt: 0, loginAt: now, lastActivityAt: now, isSessionValid: true };
      for (const claims of [
        { ...valid, tenantVersion: undefined },
        { ...valid, companyId: second.id.toString() },
        { ...valid, role: "superadmin" },
        { ...valid, loginAt: now - 9 * 3600000 },
        { ...valid, lastActivityAt: now - 31 * 60000 },
        { ...valid, userId: saUser.id.toString(), role: "superadmin", companyId: null,
          passwordChangedAt: saUser.passwordChangedAt?.getTime() ?? 0, loginAt: now - 9 * 3600000 },
        { ...valid, userId: "2", role: "seller", lastActivityAt: now - 61 * 60000 },
      ]) {
        const browser = new Browser();
        browser.cookies.set(cookie, await encode({ token: claims, secret: process.env.AUTH_SECRET!, salt: cookie }));
        assert.equal((await browser.request("/api/partners")).status, 401);
      }
      const validSeller = new Browser();
      validSeller.cookies.set(cookie, await encode({
        token: { ...valid, userId: "2", role: "seller", loginAt: now - 9 * 3600000 },
        secret: process.env.AUTH_SECRET!, salt: cookie,
      }));
      assert.equal((await validSeller.request("/api/partners")).status, 200);
    });

    await t.test("company admin creates only its own seller; resets revoke old sessions", async () => {
      const result = await secondBrowser.request("/api/users", json("POST", {
        email: "new.seller@example.test", name: "New seller", role: "seller", temporaryPassword: password,
      }));
      assert.equal(result.status, 201);
      const sellerId = BigInt((await result.json()).user.id);
      const createdUser = await prisma.user.findUniqueOrThrow({ where: { id: sellerId } });
      assert.equal(createdUser.companyId, second.id);
      assert.equal(createdUser.mustChangePassword, true);
      const browser = new Browser();
      await browser.login(createdUser.email);
      assert.equal((await browser.request("/api/partners")).status, 403);
      await prisma.user.update({ where: { id: sellerId }, data: { mustChangePassword: false } });
      await browser.login(createdUser.email);
      assert.equal((await browser.request("/api/partners")).status, 200);
      const reset = await secondBrowser.request(`/api/users/${sellerId}/reset-password`,
        json("POST", { temporaryPassword: password }));
      assert.equal(reset.status, 200);
      assert.equal((await browser.request("/api/partners")).status, 401);
      const audit = await prisma.auditLog.findFirstOrThrow({ where: { entityId: sellerId, action: "user.password_reset" } });
      assert.deepEqual(audit.newValues, { mustChangePassword: true });
    });

    await t.test("company confirmation limit, purchase idempotency, seller date and soft delete", async () => {
      const settings = await (await secondBrowser.request("/api/company/settings")).json();
      assert.equal(settings.company.vatRatePercent, "23.00");
      assert.equal(settings.company.purchaseConfirmAboveEur, null);
      assert.equal(settings.company.bronzeMonthlyTurnoverEur, null);
      assert.equal((await (await legacy.request("/api/company/settings")).json()).company.purchaseConfirmAboveEur, null);
      assert.equal((await secondBrowser.request("/api/company/settings", json("PATCH", {
        vatRatePercent: "23.00",
        purchaseConfirmAboveEur: "100.00",
        bronzeMonthlyTurnoverEur: null,
        silverMonthlyTurnoverEur: null,
        goldMonthlyTurnoverEur: null,
      }))).status, 200);
      assert.equal((await (await legacy.request("/api/company/settings")).json()).company.purchaseConfirmAboveEur, null);

      const idempotencyKey = randomUUID();
      const highAmount = {
        partnerId: secondPartner.id.toString(), amount: "100.00", partnerPresent: true,
        source: "manual", purchasedAt: new Date().toISOString(), idempotencyKey,
      };
      const confirmation = await secondBrowser.request("/api/purchases", json("POST", highAmount));
      assert.equal(confirmation.status, 409);
      assert.equal((await confirmation.json()).error.code, "PURCHASE_CONFIRMATION_REQUIRED");
      assert.equal(await prisma.purchase.count({ where: { companyId: second.id } }), 0);

      const confirmedBody = JSON.stringify({ ...highAmount, highAmountConfirmed: true });
      const confirmedResponses = await Promise.all([
        secondBrowser.request("/api/purchases", { method: "POST", body: confirmedBody }),
        secondBrowser.request("/api/purchases", { method: "POST", body: confirmedBody }),
      ]);
      assert.deepEqual(confirmedResponses.map((response) => response.status).sort(), [200, 201]);
      const confirmed = await confirmedResponses.find((response) => response.status === 201)!.json();
      const purchaseId = confirmed.purchase.id as string;
      assert.equal(confirmed.purchase.points, 81);
      assert.equal(await prisma.purchase.count({ where: { companyId: second.id } }), 1);
      assert.equal((await secondBrowser.request(`/api/purchases/${purchaseId}`, json("PATCH", {
        amount: "1.00",
      }))).status, 400);
      const updated = await secondBrowser.request(`/api/purchases/${purchaseId}`, json("PATCH", {
        amount: "125.99", reason: "Oprava účtenky",
      }));
      assert.equal(updated.status, 200);
      assert.equal((await updated.json()).purchase.points, 102);

      const sellerEmail = "phase6.seller@example.test";
      const sellerCreated = await secondBrowser.request("/api/users", json("POST", {
        email: sellerEmail, name: "Phase 6 seller", role: "seller", temporaryPassword: password,
      }));
      assert.equal(sellerCreated.status, 201);
      await prisma.user.update({ where: { email: sellerEmail }, data: { mustChangePassword: false } });
      const purchaseSeller = new Browser();
      await purchaseSeller.login(sellerEmail, password);
      const sellerDate = new Date(Date.now() - 3_600_000);
      const sellerPurchase = await purchaseSeller.request("/api/purchases", json("POST", {
        partnerId: secondPartner.id.toString(), amount: "19.99", partnerPresent: false,
        source: "manual", purchasedAt: sellerDate.toISOString(), idempotencyKey: randomUUID(),
      }));
      assert.equal(sellerPurchase.status, 201);
      const sellerPurchaseBody = await sellerPurchase.json();
      assert.equal(sellerPurchaseBody.purchase.netAmount, "16.25");
      assert.equal(sellerPurchaseBody.purchase.points, 16);
      assert.equal(new Date(sellerPurchaseBody.purchase.purchasedAt).getTime(), sellerDate.getTime());
      assert.equal((await purchaseSeller.request("/api/purchases")).status, 200);
      assert.equal((await purchaseSeller.request(`/api/purchases/${purchaseId}`, json("PATCH", {
        amount: "1.00", reason: "Forbidden",
      }))).status, 403);
      assert.equal((await purchaseSeller.request(`/api/purchases/${purchaseId}`, json("DELETE", {
        reason: "Forbidden",
      }))).status, 403);
      const sellerList = await (await purchaseSeller.request("/api/purchases")).json();
      assert.deepEqual(sellerList.items.map((item: { id: string }) => item.id), [sellerPurchaseBody.purchase.id]);

      const deleted = await secondBrowser.request(`/api/purchases/${purchaseId}`, json("DELETE", {
        reason: "Storno test",
      }));
      assert.equal(deleted.status, 200);
      assert.equal((await deleted.json()).purchase.isDeleted, true);
      const deletedList = await (await secondBrowser.request("/api/purchases?includeDeleted=true")).json();
      assert.equal(deletedList.items.find((item: { id: string }) => item.id === purchaseId).isDeleted, true);
      assert.equal((await prisma.purchase.aggregate({
        where: { companyId: second.id, partnerId: secondPartner.id, isDeleted: false },
        _sum: { points: true },
      }))._sum.points, 16);
      const deletionAudit = await prisma.auditLog.findFirstOrThrow({
        where: { action: "purchase.delete", entityId: BigInt(purchaseId) },
      });
      assert.equal(deletionAudit.reason, "Storno test");
      assert.equal((await legacy.request(`/api/purchases/${purchaseId}`)).status, 404);
      assert.equal((await legacy.request(`/api/purchases/${purchaseId}`, json("PATCH", {
        amount: "2.00", reason: "Foreign ID",
      }))).status, 404);
      assert.equal((await legacy.request(`/api/purchases/${purchaseId}`, json("DELETE", {
        reason: "Foreign ID",
      }))).status, 404);

      assert.equal((await secondBrowser.request("/api/company/settings", json("PATCH", {
        vatRatePercent: "23.00",
        purchaseConfirmAboveEur: null,
        bronzeMonthlyTurnoverEur: null,
        silverMonthlyTurnoverEur: null,
        goldMonthlyTurnoverEur: null,
      }))).status, 200);
      const disabledLimitPurchase = await secondBrowser.request("/api/purchases", json("POST", {
        partnerId: secondPartner.id.toString(), amount: "100.00", partnerPresent: true,
        source: "manual", idempotencyKey: randomUUID(),
      }));
      assert.equal(disabledLimitPurchase.status, 201);
      const rateChangePurchase = await secondBrowser.request("/api/purchases", json("POST", {
        partnerId: secondPartner.id.toString(), amount: "123.00", partnerPresent: true,
        source: "manual", idempotencyKey: randomUUID(),
      }));
      const rateChangePurchaseBody = await rateChangePurchase.json();
      assert.equal(rateChangePurchaseBody.purchase.netAmount, "100.00");
      assert.equal(rateChangePurchaseBody.purchase.points, 100);
      assert.equal((await secondBrowser.request("/api/company/settings", json("PATCH", {
        vatRatePercent: "20.00",
        purchaseConfirmAboveEur: null,
        bronzeMonthlyTurnoverEur: null,
        silverMonthlyTurnoverEur: null,
        goldMonthlyTurnoverEur: null,
      }))).status, 200);
      const newRatePurchase = await secondBrowser.request("/api/purchases", json("POST", {
        partnerId: secondPartner.id.toString(), amount: "120.00", partnerPresent: true,
        source: "manual", idempotencyKey: randomUUID(),
      }));
      const newRatePurchaseBody = await newRatePurchase.json();
      assert.equal(newRatePurchaseBody.purchase.netAmount, "100.00");
      assert.equal(newRatePurchaseBody.purchase.vatRatePercent, "20.00");
      assert.equal((await secondBrowser.request(`/api/purchases/${rateChangePurchaseBody.purchase.id}`)).status, 200);
      const oldRateStillSaved = await (await secondBrowser.request(`/api/purchases/${rateChangePurchaseBody.purchase.id}`)).json();
      assert.equal(oldRateStillSaved.purchase.vatRatePercent, "23.00");
      assert.equal(oldRateStillSaved.purchase.netAmount, "100.00");
    });

    await t.test("monthly reports aggregate within the selected company", async () => {
      await prisma.purchase.create({ data: {
        companyId: second.id,
        partnerId: secondPartner.id,
        amount: "25.00",
        netAmount: "20.33",
        vatRatePercent: "23.00",
        points: 20,
        partnerPresent: true,
        source: "manual",
        purchasedAt: new Date("2020-01-15T12:00:00.000Z"),
        createdByUserId: secondAdmin.id,
      } });
      const reportResponse = await secondBrowser.request("/api/reports/monthly?year=2020&month=1");
      assert.equal(reportResponse.status, 200);
      const report = await reportResponse.json();
      assert.equal(report.period, "2020-01");
      assert.equal(report.summary.amount, "25.00");
      assert.equal(report.summary.netAmount, "20.33");
      assert.equal(report.summary.points, 20);
      assert.equal(report.summary.purchases, 1);
      assert.equal(report.partners.length, 1);
      assert.equal(report.partners[0].displayName, "Private second partner");

      const foreignReport = await (await legacy.request("/api/reports/monthly?month=2020-01")).json();
      assert.equal(foreignReport.partners.some((partner: { displayName: string }) =>
        partner.displayName === "Private second partner"), false);
      const dashboardResponse = await secondBrowser.request("/api/reports/dashboard?month=2020-01");
      assert.equal(dashboardResponse.status, 200);
      const dashboard = await dashboardResponse.json();
      assert.equal(dashboard.summary.amount, "25.00");
      assert.equal(dashboard.summary.netAmount, "20.33");
      assert.equal(dashboard.summary.purchases, 1);
      assert.equal((await seller.request("/api/reports/monthly?year=2020&month=1")).status, 403);
      assert.equal((await secondBrowser.request("/api/reports/dashboard?month=2020-13")).status, 400);
    });

    await t.test("public card privacy and immutable monthly badge history", async () => {
      const thresholds = {
        bronzeMonthlyTurnoverEur: "10.00",
        silverMonthlyTurnoverEur: "20.00",
        goldMonthlyTurnoverEur: null,
      };
      const savedSettings = await legacy.request("/api/company/settings", json("PATCH", {
        vatRatePercent: "23.00",
        purchaseConfirmAboveEur: null, ...thresholds,
      }));
      assert.equal(savedSettings.status, 200);
      const currentToken = process.env.PHASE5A_TOKEN!;
      const publicResponse = await fetch(`${base}/api/public/card/${currentToken}`);
      assert.equal(publicResponse.status, 200);
      assert.ok(publicResponse.headers.get("cache-control")?.includes("no-store"));
      const card = await publicResponse.json();
      assert.equal(card.displayName, "Legacy partner");
      assert.equal(card.badge.tier, "bronze");
      assert.equal(card.badgeHistory.counts.silver, 0);
      assert.equal("internalNote" in card, false);
      assert.ok((await prisma.partnerToken.findUniqueOrThrow({ where: { id: BigInt(4) } })).lastUsedAt);
      assert.equal((await fetch(`${base}/api/public/card/${"x".repeat(43)}`)).status, 404);
      assert.equal((await fetch(`${base}/api/public/card/${currentToken}`, { method: "HEAD" })).status, 405);
      assert.equal((await fetch(`${base}/k/${"x".repeat(43)}`)).status, 404);
      const cardPage = await fetch(`${base}/k/${currentToken}`);
      assert.equal(cardPage.status, 200);
      assert.ok((await cardPage.text()).includes("Legacy partner"));

      const completedMonth = previousCalendarMonth(new Date(), "Europe/Bratislava");
      const period = completedMonth.periodStart.slice(0, 7);
      const purchasedAt = new Date(completedMonth.start.getTime() + 86_400_000);
      await prisma.purchase.create({ data: {
        companyId: BigInt(1), partnerId: BigInt(3), amount: "50.00",
        netAmount: "40.65", vatRatePercent: "23.00", points: 40,
        partnerPresent: true, source: "manual", purchasedAt, createdByUserId: BigInt(1),
      } });
      await prisma.auditLog.create({ data: {
        companyId: BigInt(1), userId: BigInt(1), action: "company.update",
        entityType: "company", entityId: BigInt(1),
        newValues: { ...thresholds, purchaseConfirmAboveEur: null },
        createdAt: new Date(completedMonth.start.getTime() + 60_000),
      } });
      const closed = await closeMonthlyBadges(new Date(), period);
      assert.equal(closed.inserted, 1);
      assert.equal((await closeMonthlyBadges(new Date(), period)).inserted, 0);
      const award = await prisma.partnerBadgeAward.findUniqueOrThrow({
        where: {
          companyId_partnerId_periodStart: {
            companyId: BigInt(1), partnerId: BigInt(3), periodStart: new Date(`${period}-01T00:00:00.000Z`),
          },
        },
      });
      assert.equal(award.tier, "silver");
      assert.equal(award.monthlyTurnover.toFixed(2), "40.65");
      assert.equal(award.thresholdEur.toFixed(2), "20.00");
      assert.equal(award.calculationBasis, "net");
      assert.equal((await fetch(`${base}/api/cron/close-monthly-badges`, { method: "GET" })).status, 405);
      assert.equal((await fetch(`${base}/api/cron/close-monthly-badges`, { method: "POST" })).status, 401);
      const cronClose = await fetch(`${base}/api/cron/close-monthly-badges`, {
        method: "POST",
        headers: { Authorization: `Bearer ${process.env.PHASE7_BADGE_CRON_SECRET}` },
      });
      assert.equal(cronClose.status, 200);
      assert.equal((await cronClose.json()).inserted, 0);
      const archivedCard = await (await fetch(`${base}/api/public/card/${currentToken}`)).json();
      assert.equal(archivedCard.badgeHistory.counts.silver, 1);
      assert.equal(archivedCard.badgeHistory.awards[0].period, period);

      const invalidThresholds = await legacy.request("/api/company/settings", json("PATCH", {
        vatRatePercent: "23.00",
        purchaseConfirmAboveEur: null,
        bronzeMonthlyTurnoverEur: "20.00",
        silverMonthlyTurnoverEur: "10.00",
        goldMonthlyTurnoverEur: null,
      }));
      assert.equal(invalidThresholds.status, 400);
      assert.equal((await prisma.partnerBadgeAward.findUniqueOrThrow({
        where: {
          companyId_partnerId_periodStart: {
            companyId: BigInt(1), partnerId: BigInt(3), periodStart: new Date(`${period}-01T00:00:00.000Z`),
          },
        },
      })).thresholdEur.toFixed(2), "20.00");
    });

    await t.test("explicit superadmin context, signed cookie, switch and real audit actor", async () => {
      assert.equal((await sa.request("/api/partners")).status, 400);
      const withoutSelection = await sa.request("/app");
      assert.ok(withoutSelection.status === 307 || (await withoutSelection.text()).includes("NEXT_REDIRECT"));
      const select = await sa.request("/api/superadmin/company-context", json("POST", { companyId: second.id.toString() }));
      assert.equal(select.status, 200);
      const signedValue = sa.cookies.get(companyCookieName)!;
      const selection = readCompanySelection(signedValue)!;
      assert.equal(selection.companyId, second.id.toString());
      assert.equal(readCompanySelection(`${signedValue}x`), null);
      assert.equal((await sa.request("/api/partners")).status, 400, "API must not fall back to page cookie");
      assert.equal((await sa.request("/app/partneri")).status, 200);
      const created = await sa.request("/api/partners", json("POST", { type: "installer", displayName: "SA created partner" }), second.id.toString());
      assert.equal(created.status, 201);
      const createdId = (await created.json()).partner.id;
      const audit = await prisma.auditLog.findFirstOrThrow({ where: { entityId: BigInt(createdId), action: "partner.create" } });
      assert.equal(audit.userId, saUser.id);
      assert.equal(audit.companyId, second.id);
      await sa.request("/api/superadmin/company-context", json("POST", { companyId: "1" }));
      const stale = await sa.request("/api/partners", {
        ...json("POST", { type: "installer", displayName: "Stale submission" }),
        headers: { "X-Company-Selection": selection.selectionId },
      }, second.id.toString());
      assert.equal(stale.status, 409);
      assert.equal(await prisma.partner.count({ where: { displayName: "Stale submission" } }), 0);
      assert.equal((await sa.request("/api/superadmin/company-context", { method: "DELETE" })).status, 200);
      const cleared = await sa.request("/app");
      assert.ok(cleared.status === 307 || (await cleared.text()).includes("NEXT_REDIRECT"));
      const signed = signCompanySelection({ companyId: "1", userId: saUser.id.toString(), loginAt: 123 });
      assert.equal(readCompanySelection(signed.value)?.loginAt, 123);
    });

    await t.test("deactivation revokes sessions and scan; superadmin can manage but not issue tokens", async () => {
      assert.equal((await sa.request(`/api/superadmin/companies/${second.id}/deactivate`, json("POST", { reason: "Paused for test" }))).status, 200);
      const denied = await secondBrowser.request("/api/partners");
      assert.ok([401, 403].includes(denied.status));
      assert.equal((await sa.request("/api/partners", {}, second.id.toString())).status, 200);
      assert.equal((await sa.request(`/api/partners/${secondPartner.id}/tokens`, json("POST", { type: "qr" }), second.id.toString())).status, 409);
      assert.equal((await sa.request("/api/scan/resolve", json("POST", { token: process.env.PHASE5A_TOKEN }), second.id.toString())).status, 404);
      await assert.rejects(prisma.$transaction((tx) => createPurchase(companyContext(saUser, second), {
        partnerId: secondPartner.id, amount: "10", netAmount: "8.13", vatRatePercent: "23.00",
        points: 8, partnerPresent: true, source: "manual",
      }, tx)));
      await sa.request(`/api/users/${secondAdmin.id}`, json("PATCH", { isActive: false }), second.id.toString());
      assert.equal((await sa.request(`/api/superadmin/companies/${second.id}/activate`, json("POST", {}))).status, 409);
      await sa.request(`/api/users/${secondAdmin.id}`, json("PATCH", { isActive: true }), second.id.toString());
      assert.equal((await sa.request(`/api/superadmin/companies/${second.id}/activate`, json("POST", {}))).status, 200);
    });

    await t.test("last company admin and last superadmin survive concurrent removals", async () => {
      const created = await legacy.request("/api/users", json("POST", {
        email: "extra.admin@example.test", name: "Extra admin", role: "admin", temporaryPassword: password,
      }));
      assert.equal(created.status, 201);
      const extraId = BigInt((await created.json()).user.id);
      const results = await Promise.all([
        sa.request("/api/users/1", json("PATCH", { isActive: false }), "1"),
        sa.request(`/api/users/${extraId}`, json("PATCH", { isActive: false }), "1"),
      ]);
      assert.equal(results.filter((item) => item.status === 200).length, 1);
      assert.equal(results.filter((item) => item.status === 409).length, 1);
      assert.equal(await prisma.user.count({ where: { companyId: BigInt(1), role: "admin", isActive: true } }), 1);
      const hashValue = await hash(password);
      const another = await prisma.user.create({ data: {
        email: "other.superadmin@example.test", name: "Other superadmin", role: "superadmin",
        passwordHash: hashValue, mustChangePassword: false,
      } });
      const outcomes = await Promise.allSettled([
        setSuperadminActivity(saContext, saUser.id, false),
        setSuperadminActivity(saContext, another.id, false),
      ]);
      assert.equal(outcomes.filter((item) => item.status === "fulfilled").length, 1);
      assert.equal(await prisma.user.count({ where: { role: "superadmin", isActive: true } }), 1);
    });

    await t.test("audit remains immutable after all writes", async () => {
      await assert.rejects(prisma.auditLog.update({ where: { id: BigInt(6) }, data: { action: "tampered" } }));
      await assert.rejects(prisma.auditLog.delete({ where: { id: BigInt(6) } }));
      const legacyAudit = await prisma.auditLog.findUniqueOrThrow({ where: { id: BigInt(6) } });
      assert.equal(legacyAudit.action, "legacy.create");
      assert.equal(legacyAudit.createdAt.toISOString(), "2026-10-07T10:00:00.123Z");
    });
  } finally {
    await prisma.$disconnect();
  }
});
