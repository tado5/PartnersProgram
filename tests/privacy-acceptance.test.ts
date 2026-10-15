import assert from "node:assert/strict";
import { createHash, randomBytes, randomUUID } from "node:crypto";
import { test } from "node:test";
import { encode } from "@auth/core/jwt";
import type { User } from "@prisma/client";

import { prisma } from "../src/server/db";
import { privacyTemplateBody } from "../src/lib/privacy-template";

const base = "http://127.0.0.1:3017";
const origin = "https://partners.example.invalid";
const cookieName = "__Secure-authjs.session-token";
const settingsPath = "/api/company/privacy";
const publishPath = `${settingsPath}/publish`;

if (!process.env.DATABASE_URL?.endsWith("/europodlahy_5a_validation")) {
  throw new Error("Privacy acceptance requires the dedicated europodlahy_5a_validation database.");
}

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
  return async (path: string, init: RequestInit = {}, companyId?: bigint) => {
    const headers = new Headers(init.headers);
    if (!headers.has("Origin")) headers.set("Origin", origin);
    headers.set("Cookie", cookie);
    headers.set("X-Real-IP", "192.0.2.113");
    if (init.body && !headers.has("Content-Type")) headers.set("Content-Type", "application/json");
    if (companyId) headers.set("X-Company-Id", companyId.toString());
    return fetch(`${base}${path}`, { ...init, headers, redirect: "manual" });
  };
}

const json = (method: string, body: unknown): RequestInit => ({ method, body: JSON.stringify(body) });
async function status(response: Response, expected: number, code?: string) {
  assert.equal(response.status, expected, (await response.clone().text()).slice(0, 600));
  if (code) assert.equal((await response.clone().json()).error?.code, code);
  return response;
}

test("privacy publication and partner informing HTTP acceptance", { timeout: 120_000 }, async (t) => {
  assert.equal(process.env.NODE_ENV, "production");
  assert.equal(process.env.APP_BASE_URL, origin);
  assert.ok(process.env.AUTH_SECRET && process.env.AUTH_SECRET.length >= 32);
  const unique = randomUUID();
  const company = await prisma.company.create({ data: { name: "Privacy Alpha", slug: `privacy-a-${unique}` } });
  const otherCompany = await prisma.company.create({ data: { name: "Privacy Beta", slug: `privacy-b-${unique}` } });
  const inactiveCompany = await prisma.company.create({
    data: { name: "Privacy inactive", slug: `privacy-inactive-${unique}`, isActive: false },
  });
  const createUser = (role: User["role"], label: string, companyId: bigint | null, extra = {}) =>
    prisma.user.create({ data: {
      role, companyId, email: `privacy-${unique}-${label}@example.test`,
      name: label, passwordHash: "unused-jwt-fixture", mustChangePassword: false, ...extra,
    } });
  try {
    const [admin, seller, otherAdmin, superadmin, forced, disabled, inactiveAdmin] = await Promise.all([
      createUser("admin", "alpha-admin", company.id), createUser("seller", "seller", company.id),
      createUser("admin", "beta-admin", otherCompany.id), createUser("superadmin", "global", null),
      createUser("admin", "forced", company.id, { mustChangePassword: true }),
      createUser("admin", "disabled", company.id, { isActive: false }),
      createUser("admin", "inactive", inactiveCompany.id),
    ]);
    const clients = {
      anonymous: await clientFor(), admin: await clientFor(admin), seller: await clientFor(seller),
      other: await clientFor(otherAdmin), superadmin: await clientFor(superadmin),
      forced: await clientFor(forced), disabled: await clientFor(disabled),
      inactive: await clientFor(inactiveAdmin),
    };
    const legacy = await prisma.partner.create({ data: {
      companyId: company.id, code: "EP-PRV23", displayName: "Private legacy Alpha",
      type: "installer", createdByUserId: admin.id, internalNote: "PRIVATE_PRIVACY_NOTE",
    } });
    const foreignPartner = await prisma.partner.create({ data: {
      companyId: otherCompany.id, code: "EP-PRV24", displayName: "Private Beta partner",
      type: "company", createdByUserId: otherAdmin.id,
    } });
    const cardValue = randomBytes(32).toString("base64url");
    await prisma.partnerToken.create({ data: {
      companyId: company.id, partnerId: legacy.id, type: "qr", createdByUserId: admin.id,
      tokenHash: createHash("sha256").update(cardValue).digest("hex"), tokenHint: cardValue.slice(0, 6),
    } });
    const card = async () => (await (await status(await clients.anonymous(`/api/public/card/${cardValue}`), 200)).json());
    const receiptPath = `/api/partners/${legacy.id}/privacy`;
    const draft = {
      controllerName: "Privacy Alpha controller", controllerAddress: "Testovacia 1, Bratislava",
      controllerIco: "12345678", contactEmail: "privacy-alpha@example.test", dpoContact: null,
      body: "Informácie o spracúvaní osobných údajov partnerov. ".repeat(5)
        + '<script>window.privacyXss=true</script>',
    };
    let firstNotice: { id: string; version: number; publishedAt: string; body: string };
    let secondNotice: typeof firstNotice;

    async function publish(client: typeof clients.admin, body = draft, context?: bigint) {
      await status(await client(settingsPath, json("PUT", body), context), 200);
      const state = await (await status(await client(settingsPath, {}, context), 200)).json();
      assert.ok(state.draft.updatedAt);
      const response = await status(await client(publishPath,
        json("POST", { expectedUpdatedAt: state.draft.updatedAt }), context), 200);
      return (await response.json()).notice as typeof firstNotice;
    }
    const evidence = <T extends object>(notice: typeof firstNotice, extra = {} as T) => ({
      noticeId: notice.id, providedAt: new Date().toISOString(), method: "in_person", ...extra,
    });
    const registration = (privacy?: unknown) => ({
      type: "installer", displayName: `Privacy registered ${randomUUID()}`, ...(privacy === undefined ? {} : { privacy }),
    });

    await t.test("all five handlers enforce authentication, role, tenant and password guards", async () => {
      const cases = [
        [settingsPath, "GET"], [settingsPath, "PUT"], [publishPath, "POST"],
        [receiptPath, "GET"], [receiptPath, "POST"],
      ] as const;
      for (const [path, method] of cases) {
        const init = method === "GET" ? {} : json(method, {});
        await status(await clients.anonymous(path, init), 401);
        await status(await clients.disabled(path, init), 401);
        await status(await clients.forced(path, init), 403, "PASSWORD_CHANGE_REQUIRED");
        await status(await clients.seller(path, init), 403, "FORBIDDEN");
        await status(await clients.inactive(path, init), 403, "COMPANY_INACTIVE");
        await status(await clients.admin(path, init, otherCompany.id), 403, "FORBIDDEN");
        await status(await clients.superadmin(path, init), 400, "COMPANY_CONTEXT_REQUIRED");
        await status(await clients.superadmin(path, init, BigInt(9_000_000_000)), 404);
        if (method !== "GET") {
          await status(await clients.superadmin(path, init, company.id), 403, "FORBIDDEN");
        } else {
          await status(await clients.superadmin(path, init, company.id), 200);
        }
      }
      await status(await clients.other(receiptPath), 404);
      await status(await clients.admin(`/api/partners/${foreignPartner.id}/privacy`), 404);
      const initial = await (await status(await clients.admin(settingsPath), 200)).json();
      assert.equal(initial.current, null);
      assert.equal((await card()).privacyUrl, null);
      assert.equal(await prisma.companyPrivacyReceipt.count({ where: { companyId: company.id } }), 0);
    });

    await t.test("registration gate precedes missing/invalid receipt schema and never backfills legacy partners", async () => {
      for (const body of [registration(), registration({}), {}, null]) {
        await status(await clients.admin("/api/partners", json("POST", body)), 409, "PRIVACY_NOTICE_REQUIRED");
      }
      await status(await clients.superadmin("/api/partners", json("POST", registration()), company.id),
        409, "PRIVACY_NOTICE_REQUIRED");
      assert.equal(await prisma.partner.count({ where: { companyId: company.id } }), 1);
      assert.equal(await prisma.companyPrivacyReceipt.count({ where: { partnerId: legacy.id } }), 0);
    });

    await t.test("incomplete drafts save but cannot publish, and invalid origins never write", async () => {
      await status(await clients.admin(settingsPath, json("PUT", {
        ...draft, controllerName: "", controllerAddress: "", contactEmail: "", body: "",
      })), 200);
      const state = await (await clients.admin(settingsPath)).json();
      await status(await clients.admin(publishPath, json("POST", { expectedUpdatedAt: state.draft.updatedAt })), 400);
      const templateState = await (await status(await clients.admin(settingsPath,
        json("PUT", { ...draft, body: `${privacyTemplateBody}\n[DOPLNIŤ: starší návrh]` })), 200)).json();
      await status(await clients.admin(publishPath, json("POST", {
        expectedUpdatedAt: templateState.draft.updatedAt,
      })), 400, "VALIDATION_ERROR");
      await status(await clients.admin(publishPath, json("POST", {})), 400, "VALIDATION_ERROR");
      for (const path of [settingsPath, publishPath, receiptPath]) {
        const method = path === settingsPath ? "PUT" : "POST";
        for (const value of ["https://evil.example.invalid", "null", ""]) {
          await status(await clients.admin(path, {
            ...json(method, draft), headers: { Origin: value },
          }), 403, "INVALID_ORIGIN");
        }
      }
      assert.equal(await prisma.companyPrivacyNotice.count({ where: { companyId: company.id } }), 0);
      assert.equal(await prisma.companyPrivacyReceipt.count({ where: { companyId: company.id } }), 0);
    });

    await t.test("publication freezes a versioned snapshot; stale and concurrent publishes cannot both win", async () => {
      firstNotice = await publish(clients.admin);
      assert.equal(firstNotice.version, 1);
      assert.equal(firstNotice.body, draft.body);
      const original = await prisma.companyPrivacyNotice.findUniqueOrThrow({ where: { id: BigInt(firstNotice.id) } });
      assert.equal(original.publishedByUserId, admin.id);
      assert.equal(original.companyId, company.id);
      const previous = await (await clients.admin(settingsPath)).json();
      await status(await clients.admin(settingsPath, json("PUT", { ...draft, body: `${draft.body}\nSecond version.` })), 200);
      await status(await clients.admin(publishPath, json("POST", { expectedUpdatedAt: previous.draft.updatedAt })),
        409, "PRIVACY_DRAFT_CHANGED");
      const state = await (await clients.admin(settingsPath)).json();
      const results = await Promise.all([0, 1].map(() => clients.admin(publishPath,
        json("POST", { expectedUpdatedAt: state.draft.updatedAt }))));
      assert.deepEqual(results.map((result) => result.status).sort(), [200, 409]);
      await status(results.find((result) => result.status === 409)!, 409, "PRIVACY_DRAFT_CHANGED");
      secondNotice = (await results.find((result) => result.status === 200)!.json()).notice;
      assert.equal(await prisma.companyPrivacyNotice.count({ where: { companyId: company.id } }), 2);
      assert.equal(secondNotice.version, 2);
      assert.notEqual(secondNotice.id, firstNotice.id);
      assert.deepEqual(await prisma.companyPrivacyNotice.findUniqueOrThrow({ where: { id: original.id } }), original);
      assert.equal(await prisma.companyPrivacyReceipt.count({ where: { partnerId: legacy.id } }), 0);
    });

    await t.test("registration requires current tenant notice and actual past delivery, with no partial partners", async () => {
      const foreignNotice = await publish(clients.other, {
        ...draft, controllerName: "Privacy Beta controller", body: privacyTemplateBody,
      });
      assert.equal(foreignNotice.body, privacyTemplateBody.trim());
      const betaHtml = await (await status(await clients.anonymous(`/ochrana-udajov/${otherCompany.slug}`), 200)).text();
      assert.match(betaHtml, /Privacy Beta controller/);
      assert.match(betaHtml, /3 roky/);
      assert.doesNotMatch(betaHtml, /DOPLNIŤ|VZOR NA DOPLNENIE/);
      const before = await prisma.partner.count({ where: { companyId: company.id } });
      for (const privacy of [
        undefined, {}, evidence(secondNotice, { method: "automatic" }),
        evidence(secondNotice, { providedAt: "not-a-date" }),
      ]) {
        await status(await clients.admin("/api/partners", json("POST", registration(privacy))), 400);
      }
      for (const providedAt of [
        new Date(Date.now() + 3_600_000).toISOString(),
        new Date(new Date(secondNotice.publishedAt).getTime() - 1).toISOString(),
      ]) {
        await status(await clients.admin("/api/partners",
          json("POST", registration(evidence(secondNotice, { providedAt })))), 400, "INVALID_PRIVACY_DATE");
      }
      await status(await clients.admin("/api/partners", json("POST", registration(evidence(foreignNotice)))),
        404, "PRIVACY_NOTICE_NOT_FOUND");
      await status(await clients.admin("/api/partners", json("POST", registration(evidence(secondNotice, {
        noticeId: "18446744073709551615",
      })))), 404, "PRIVACY_NOTICE_NOT_FOUND");
      await status(await clients.admin("/api/partners", json("POST", registration(evidence(firstNotice)))),
        409, "PRIVACY_NOTICE_CHANGED");
      assert.equal(await prisma.partner.count({ where: { companyId: company.id } }), before);
      for (const [client, companyId, actor] of [
        [clients.admin, undefined, admin], [clients.superadmin, company.id, superadmin],
      ] as const) {
        const input = evidence(secondNotice);
        const response = await status(await client("/api/partners", json("POST", registration(input)), companyId), 201);
        const created = (await response.json()).partner;
        const receipt = await prisma.companyPrivacyReceipt.findFirstOrThrow({ where: { partnerId: BigInt(created.id) } });
        assert.equal(receipt.noticeId.toString(), secondNotice.id);
        assert.equal(receipt.recordedByUserId, actor.id);
        assert.equal(receipt.companyId, company.id);
        assert.equal(receipt.providedAt.toISOString(), input.providedAt);
        assert.equal(receipt.method, "in_person");
        assert.equal(receipt.reason, null);
      }
    });

    await t.test("legacy informing appends immutable history and corrections require a reason", async () => {
      const first = evidence(firstNotice, { method: "printed" });
      await status(await clients.admin(receiptPath, json("POST", first)), 201);
      const original = await prisma.companyPrivacyReceipt.findFirstOrThrow({ where: { partnerId: legacy.id } });
      await status(await clients.admin(receiptPath, json("POST", evidence(secondNotice))), 400, "PRIVACY_REASON_REQUIRED");
      await status(await clients.admin(receiptPath, json("POST", evidence(secondNotice, { reason: " " }))),
        400, "PRIVACY_REASON_REQUIRED");
      await status(await clients.admin(`/api/partners/${foreignPartner.id}/privacy`,
        json("POST", evidence(secondNotice))), 404);
      await status(await clients.admin(receiptPath, json("POST", evidence(secondNotice, { reason: "x".repeat(256) }))), 400);
      assert.equal(await prisma.companyPrivacyReceipt.count({ where: { partnerId: legacy.id } }), 1);
      const correction = evidence(secondNotice, { method: "email", reason: "Dodatočné informovanie e-mailom" });
      await status(await clients.admin(receiptPath, json("POST", correction)), 201);
      const stored = await prisma.companyPrivacyReceipt.findMany({ where: { partnerId: legacy.id }, orderBy: { id: "asc" } });
      assert.equal(stored.length, 2);
      assert.deepEqual(stored[0], original);
      assert.equal(stored[1].reason, correction.reason);
      assert.equal(stored[1].recordedByUserId, admin.id);
      const adminHistory = await (await status(await clients.admin(receiptPath), 200)).json();
      const globalHistory = await (await status(await clients.superadmin(receiptPath, {}, company.id), 200)).json();
      assert.deepEqual(globalHistory, adminHistory);
      assert.deepEqual(adminHistory.items.map((item: { id: string }) => item.id), stored.map((item) => item.id.toString()).reverse());
      assert.equal(adminHistory.items[1].recordedBy, admin.name);
      assert.equal(adminHistory.items[1].providedAt, original.providedAt.toISOString());
      assert.equal(adminHistory.items[1].version, firstNotice.version);
      for (const [privacy, includesLegacy] of [["missing", false], ["recorded", true]] as const) {
        const list = await (await status(await clients.admin(`/api/partners?privacy=${privacy}`), 200)).json();
        assert.equal(list.items.some((item: { id: string }) => item.id === legacy.id.toString()), includesLegacy);
        assert.ok(list.items.every((item: { id: string }) => item.id !== foreignPartner.id.toString()));
      }
      await status(await clients.seller("/api/partners?privacy=missing"), 403, "FORBIDDEN");
      const sellerList = await (await status(await clients.seller("/api/partners"), 200)).json();
      assert.ok(sellerList.items.every((item: object) => !("privacyRecorded" in item)));
      const adminList = await (await status(await clients.admin("/api/partners"), 200)).json();
      assert.equal(adminList.items.find((item: { id: string }) => item.id === legacy.id.toString()).privacyRecorded, true);
      await status(await clients.admin("/api/partners?privacy=unknown"), 400);
      for (const [privacy, includesLegacy] of [["missing", false], ["recorded", true]] as const) {
        const csv = await (await status(await clients.admin(`/api/exports/partners.csv?privacy=${privacy}`), 200)).text();
        assert.equal(csv.includes("Private legacy Alpha"), includesLegacy);
        assert.equal(csv.includes("Private Beta partner"), false);
        const audit = await prisma.auditLog.findFirstOrThrow({
          where: { companyId: company.id, userId: admin.id, action: "export.csv" }, orderBy: { id: "desc" },
        });
        assert.match(JSON.stringify(audit.newValues), new RegExp(`"privacy":"${privacy}"`));
      }
      await status(await clients.admin("/api/exports/partners.csv?privacy=unknown"), 400);
      const serialized = JSON.stringify(adminHistory);
      assert.match(serialized, new RegExp(original.id.toString()));
      assert.match(serialized, /Dodatočné informovanie e-mailom/);
      assert.doesNotMatch(serialized, /PRIVATE_PRIVACY_NOTE|Private Beta partner|passwordHash|tokenHash/);
      assert.equal(await prisma.companyPrivacyReceipt.count({ where: { partnerId: foreignPartner.id } }), 0);
    });

    await t.test("database enforces immutable notices, receipt history and company-linked evidence", async () => {
      const notice = await prisma.companyPrivacyNotice.findUniqueOrThrow({ where: { id: BigInt(firstNotice.id) } });
      const receipt = await prisma.companyPrivacyReceipt.findFirstOrThrow({ where: { partnerId: legacy.id } });
      for (const operation of [
        () => prisma.companyPrivacyNotice.update({ where: { id: notice.id }, data: { body: "Changed ".repeat(30) } }),
        () => prisma.companyPrivacyNotice.delete({ where: { id: notice.id } }),
        () => prisma.companyPrivacyReceipt.update({ where: { id: receipt.id }, data: { method: "email" } }),
        () => prisma.companyPrivacyReceipt.delete({ where: { id: receipt.id } }),
        () => prisma.companyPrivacyReceipt.create({ data: {
          companyId: company.id, partnerId: foreignPartner.id, noticeId: notice.id,
          providedAt: new Date(), method: "printed", recordedByUserId: admin.id,
        } }),
      ]) await assert.rejects(operation);
      assert.deepEqual(await prisma.companyPrivacyNotice.findUniqueOrThrow({ where: { id: notice.id } }), notice);
      assert.deepEqual(await prisma.companyPrivacyReceipt.findUniqueOrThrow({ where: { id: receipt.id } }), receipt);
      await status(await clients.admin("/api/partners/18446744073709551615/privacy"), 404);
      await status(await clients.admin("/api/partners/18446744073709551615/privacy",
        json("POST", evidence(secondNotice))), 404);
      await status(await clients.admin(receiptPath, json("POST", evidence(secondNotice, { reason: "x".repeat(255) }))), 201);
    });

    await t.test("anonymous token-free notices expose only the requested company's escaped published version", async () => {
      const template = await status(await clients.anonymous("/gdpr"), 200);
      const generalHtml = await template.text();
      assert.match(generalHtml, /Spoločný dokument partnerského programu/);
      assert.doesNotMatch(generalHtml, /DOPLNIŤ|VZOR NA DOPLNENIE/);
      assert.equal((await clients.anonymous("/gdpr-vzor")).status, 404);
      const templatePdf = await status(await clients.anonymous("/gdpr?format=pdf"), 200);
      assert.equal(templatePdf.headers.get("content-type"), "application/pdf");
      assert.match(templatePdf.headers.get("content-disposition")!, /attachment; filename="gdpr.pdf"/);
      assert.equal(Buffer.from(await templatePdf.arrayBuffer()).subarray(0, 5).toString(), "%PDF-");
      for (const [suffix, expectedBody] of [["", secondNotice.body], ["?version=1", firstNotice.body]] as const) {
        const response = await status(await clients.anonymous(`/ochrana-udajov/${company.slug}${suffix}`), 200);
        const html = await response.text();
        assert.match(html, /Privacy Alpha controller/);
        assert.ok(html.includes("&lt;script&gt;"), "Notice body must be rendered as escaped text.");
        assert.doesNotMatch(html, /<script>window\.privacyXss/);
        assert.ok(expectedBody.includes("Informácie"));
        if (suffix) assert.doesNotMatch(html, /Second version\./);
        else assert.match(html, /Second version\./);
        const expectedVersion = suffix ? 1 : 2;
        assert.ok(html.includes(`version=${expectedVersion}&amp;format=pdf`));
        const pdf = await status(await clients.anonymous(`/ochrana-udajov/${company.slug}?version=${expectedVersion}&format=pdf`), 200);
        assert.equal(pdf.headers.get("content-type"), "application/pdf");
        assert.match(pdf.headers.get("content-disposition")!, new RegExp(`-v${expectedVersion}\\.pdf"`));
        assert.match(pdf.headers.get("cache-control")!, /\bno-store\b/);
        assert.equal(Buffer.from(await pdf.arrayBuffer()).subarray(0, 5).toString(), "%PDF-");
        assert.doesNotMatch(html, /Private legacy Alpha|PRIVATE_PRIVACY_NOTE|Private Beta partner|Privacy Beta controller/);
      }
      const publicCard = await card();
      assert.equal(publicCard.privacyUrl, `/ochrana-udajov/${company.slug}`);
      assert.ok(!JSON.stringify(publicCard).includes(cardValue));
      for (const version of ["999", "0", "-1", "1.5", "abc", "1234567890"]) {
        await status(await clients.anonymous(`/ochrana-udajov/${company.slug}?version=${version}`), 404);
      }
      for (const method of ["POST", "PUT", "PATCH", "DELETE"]) {
        await status(await clients.anonymous(`/ochrana-udajov/${company.slug}`, { method }), 405);
        await status(await clients.anonymous("/gdpr?format=pdf", { method }), 405);
      }
      await status(await clients.anonymous(`/ochrana-udajov/missing-${unique}`), 404);
      await prisma.company.update({ where: { id: company.id }, data: { isActive: false } });
      try {
        await status(await clients.anonymous(`/ochrana-udajov/${company.slug}`), 404);
        await status(await clients.anonymous(`/ochrana-udajov/${company.slug}?format=pdf`), 404);
      } finally {
        await prisma.company.update({ where: { id: company.id }, data: { isActive: true } });
      }
    });
  } finally {
    // Immutable audit, publication and receipt rows are dropped by the isolated runner.
    await prisma.$disconnect();
  }
});
