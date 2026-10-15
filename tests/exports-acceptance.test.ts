import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { test } from "node:test";
import { hash } from "@node-rs/argon2";
import { type Company, type User } from "@prisma/client";

import { companyCookieName, signCompanySelection } from "../src/server/auth/company-cookie";
import { prisma } from "../src/server/db";
import { record } from "../src/server/audit";

const base = "http://127.0.0.1:3017";
const origin = "https://partners.example.invalid";
const password = process.env.PHASE5A_PASSWORD;
if (!process.env.DATABASE_URL?.endsWith("/europodlahy_5a_validation")) {
  throw new Error("CSV acceptance tests require the dedicated europodlahy_5a_validation database.");
}
if (!password) throw new Error("PHASE5A_PASSWORD is required by the phase10 acceptance runner.");

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

  async login(email: string) {
    const csrf = await (await this.request("/api/auth/csrf")).json();
    await this.request("/api/auth/callback/credentials", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded", "X-Auth-Return-Redirect": "1" },
      body: new URLSearchParams({
        csrfToken: csrf.csrfToken,
        email,
        password: password!,
        callbackUrl: `${base}/app`,
      }),
    });
    const session = await (await this.request("/api/auth/session")).json();
    assert.equal(session.user?.isSessionValid, true, `Login failed for test account ${email}`);
    return session;
  }
}

type Fixture = {
  company: Company;
  otherCompany: Company;
  inactiveCompany: Company;
  admin: User;
  otherAdmin: User;
  inactiveAdmin: User;
  seller: User;
  superadmin: User;
  foreignPartnerId: bigint;
  deletedPurchaseId: bigint;
  browser: {
    admin: Browser;
    otherAdmin: Browser;
    inactiveAdmin: Browser;
    seller: Browser;
    superadmin: Browser;
  };
  superadminSession: { user: { loginAt: number } };
};

const endpoints = [
  "/api/exports/partners.csv",
  "/api/exports/purchases.csv",
  "/api/exports/monthly.csv?month=2026-02",
  "/api/exports/audit-logs.csv",
];

test("phase10 CSV database and HTTP acceptance", async (t) => {
  const fixture = await createFixture();
  const { company, browser } = fixture;

  await t.test("admin-only role and company context are enforced for all four routes", async () => {
    const anonymous = new Browser();
    for (const endpoint of endpoints) {
      assert.equal((await anonymous.request(endpoint)).status, 401, `anonymous ${endpoint}`);
      assert.equal((await browser.seller.request(endpoint, {}, company.id.toString())).status, 403, `seller ${endpoint}`);
      assert.equal((await browser.admin.request(endpoint)).status, 200, `admin ${endpoint}`);
      const otherTenant = await browser.otherAdmin.request(endpoint);
      assert.equal(otherTenant.status, 200, `other tenant ${endpoint}`);
      assert.equal(await otherTenant.text().then((text) => text.includes("CSV unpaginated")), false);
      assert.equal((await browser.superadmin.request(endpoint)).status, 400, `superadmin requires explicit company ${endpoint}`);
      assert.equal((await browser.superadmin.request(endpoint, {}, company.id.toString())).status, 200, `superadmin selected company ${endpoint}`);
    }

    const isolated = await browser.otherAdmin.request("/api/exports/partners.csv");
    assert.equal(isolated.status, 200);
    assert.equal(await isolated.text().then((text) => text.includes("=SUM(1;1)")), false);

    const selection = signCompanySelection({
      companyId: company.id.toString(),
      userId: fixture.superadmin.id.toString(),
      loginAt: fixture.superadminSession.user.loginAt,
    });
    browser.superadmin.cookies.set(companyCookieName, selection.value);
    const staleSelection = await browser.superadmin.request(
      "/api/exports/partners.csv",
      { headers: { "X-Company-Selection": selection.selection.selectionId } },
      fixture.otherAdmin.companyId!.toString(),
    );
    assert.equal(staleSelection.status, 409);
  });

  await t.test("partner filters export every matching row and private admin fields safely", async () => {
    const response = await browser.admin.request("/api/exports/partners.csv");
    assert.equal(response.status, 200);
    assertCsvHeaders(response, "partners.csv");
    const bytes = new Uint8Array(await response.arrayBuffer());
    assert.deepEqual([...bytes.slice(0, 3)], [0xef, 0xbb, 0xbf]);
    const csv = new TextDecoder().decode(bytes.slice(3));
    assert.ok(csv.includes("\r\n"));
    assert.ok(csv.includes("'=SUM(1;1)"));
    assert.ok(csv.includes("admin-private@example.test"));
    assert.equal(csv.includes("tokenHash"), false);
    assert.ok(csv.split("\r\n").length > 54, "must export more than one API page");

    const filtered = await browser.admin.request(
      "/api/exports/partners.csv?q=SUM&active=true&type=installer",
    );
    assert.equal(filtered.status, 200);
    const filteredCsv = await filtered.text();
    assert.ok(filteredCsv.includes("'=SUM(1;1)"));
    assert.equal(filteredCsv.split("\r\n").length, 3, "header plus one matching partner");
    assert.equal((await browser.admin.request("/api/exports/partners.csv?active=yes")).status, 400);
    assert.equal((await browser.admin.request(
      "/api/exports/partners.csv?q=&type=&active=",
    )).status, 200);

    const privateQuery = await browser.admin.request(
      "/api/exports/partners.csv?q=admin-private%40example.test",
    );
    assert.equal(privateQuery.status, 200);
    const privateQueryAudit = await prisma.auditLog.findFirstOrThrow({
      where: { companyId: company.id, userId: fixture.admin.id, action: "export.csv" },
      orderBy: { id: "desc" },
    });
    assert.equal(JSON.stringify(privateQueryAudit.newValues).includes("admin-private@example.test"), false);
    const newValues = privateQueryAudit.newValues;
    const auditedFilters = newValues && typeof newValues === "object" && !Array.isArray(newValues)
      ? newValues.filters
      : null;
    assert.ok(auditedFilters && typeof auditedFilters === "object" && !Array.isArray(auditedFilters));
    assert.equal(auditedFilters.q, "Skryté");
  });

  await t.test("partner export retrieves every row across the 1,000-row internal batch boundary", async () => {
    const batchSize = 1_001;
    await prisma.partner.createMany({
      data: Array.from({ length: batchSize }, (_, index) => ({
        companyId: company.id,
        code: fixturePartnerCode("Y", index),
        type: "referrer" as const,
        displayName: `CSV batch marker ${index.toString().padStart(4, "0")}`,
        createdByUserId: fixture.admin.id,
      })),
    });

    const response = await browser.admin.request("/api/exports/partners.csv?q=CSV%20batch%20marker");
    assert.equal(response.status, 200);
    const csv = await response.text();
    const rows = csv.trimEnd().split("\r\n");
    assert.equal(rows.length - 1, batchSize, "header excluded, all fixture rows included");
    assert.ok(rows[1].includes("CSV batch marker 0000"));
    assert.ok(rows.at(-1)?.includes("CSV batch marker 1000"));
  });

  await t.test("purchase filters use inclusive Bratislava calendar days and include deleted only on request", async () => {
    const boundary = await browser.admin.request(
      "/api/exports/purchases.csv?from=2026-02-01&to=2026-02-01",
    );
    assert.equal(boundary.status, 200);
    assertCsvHeaders(boundary, "purchases.csv");
    const boundaryCsv = await boundary.text();
    assert.ok(boundaryCsv.includes("100,00"), "local midnight boundary purchase is included");
    assert.equal(boundaryCsv.includes("before-boundary"), false);

    const fromOnly = await browser.admin.request("/api/exports/purchases.csv?from=2026-02-01");
    assert.equal(fromOnly.status, 200);
    assert.ok((await fromOnly.text()).includes("19,99"));

    const toOnly = await browser.admin.request("/api/exports/purchases.csv?to=2026-01-31");
    assert.equal(toOnly.status, 200);
    const toOnlyCsv = await toOnly.text();
    assert.ok(toOnlyCsv.includes("before-boundary"));
    assert.equal(toOnlyCsv.includes("100,00"), false);

    const normal = await browser.admin.request("/api/exports/purchases.csv?from=2026-02-01&to=2026-02-28");
    const normalCsv = await normal.text();
    assert.equal(normalCsv.split("\r\n").some((row) => row.startsWith(`${fixture.deletedPurchaseId};`)), false);
    assert.equal(normalCsv.includes("=SUM(1;1)"), false);
    assert.equal((await browser.admin.request(
      "/api/exports/purchases.csv?from=&to=&partnerId=&includeDeleted=",
    )).status, 200);
    const deleted = await browser.admin.request(
      "/api/exports/purchases.csv?from=2026-02-01&to=2026-02-28&includeDeleted=true",
    );
    const deletedCsv = await deleted.text();
    assert.ok(deletedCsv.split("\r\n").some((row) => row.startsWith(`${fixture.deletedPurchaseId};`)));
    assert.ok(deletedCsv.includes(";Áno;"));

    const foreign = await browser.admin.request(
      `/api/exports/purchases.csv?partnerId=${fixture.foreignPartnerId}`,
    );
    assert.equal(foreign.status, 404);
    assert.equal((await browser.admin.request(
      `/api/exports/audit-logs.csv?entityType=partner&entityId=${fixture.foreignPartnerId}`,
    )).status, 404);
    assert.equal((await browser.admin.request(
      `/api/exports/audit-logs.csv?userId=${fixture.otherAdmin.id}`,
    )).status, 404);
    assert.equal((await browser.admin.request(
      "/api/exports/purchases.csv?from=2026-02-01&to=2026-01-31",
    )).status, 400);
    assert.equal((await browser.admin.request(
      "/api/exports/purchases.csv?from=2025-01-01&to=2026-02-01",
    )).status, 200, "purchase export accepts ranges longer than 366 days");
    assert.equal((await browser.admin.request(
      "/api/exports/purchases.csv?from=2026-02-30",
    )).status, 400);
  });

  await t.test("monthly export matches shared report sums for current and legacy month syntax", async () => {
    const response = await browser.admin.request(
      "/api/exports/monthly.csv?month=2026-02&type=installer",
    );
    assert.equal(response.status, 200);
    assertCsvHeaders(response, "monthly.csv");
    const csv = await response.text();
    assert.ok(csv.includes(";119,99;97,55;97;2\r\n"));

    const report = await browser.admin.request("/api/reports/monthly?month=2026-02&type=installer");
    assert.equal(report.status, 200);
    const reportBody = await report.json();
    assert.equal(reportBody.summary.grossAmount, "119.99");
    assert.equal(reportBody.summary.netAmount, "97.55");

    const legacy = await browser.admin.request("/api/exports/monthly.csv?year=2026&month=2&type=installer");
    assert.equal(legacy.status, 200);
    assert.equal(await legacy.text(), csv);
    assert.equal((await browser.admin.request(
      "/api/exports/monthly.csv?month=2026-02&year=&type=&from=&to=",
    )).status, 200);
    assert.equal((await browser.admin.request(
      "/api/exports/monthly.csv?from=2025-01-01&to=2026-02-01",
    )).status, 400);
  });

  await t.test("audit CSV is unpaginated, safely redacted and successful downloads are audited", async () => {
    const response = await browser.admin.request("/api/exports/audit-logs.csv?from=2026-01-01&to=2026-12-31");
    assert.equal(response.status, 200);
    assertCsvHeaders(response, "audit-logs.csv");
    const csv = await response.text();
    assert.ok(csv.split("\r\n").length > 24, "all matching logs must exceed the 20-row UI page");
    assert.ok(csv.includes("Private audit actor"));
    assert.ok(csv.includes("Skryté"));
    assert.equal(csv.includes("198.51.100."), false);
    assert.equal(csv.includes("private-user-agent"), false);
    assert.equal(csv.includes("raw-token-secret"), false);

    const audit = await prisma.auditLog.findFirstOrThrow({
      where: { companyId: company.id, userId: fixture.admin.id, action: "export.csv" },
      orderBy: { id: "desc" },
    });
    assert.equal(audit.entityType, "export");
    assert.equal(audit.companyId, company.id);
    assert.equal(audit.userId, fixture.admin.id);
    assert.equal(audit.newValues && typeof audit.newValues === "object" && !Array.isArray(audit.newValues)
      ? audit.newValues.type : null, "audit-logs");
    assert.equal(audit.newValues && typeof audit.newValues === "object" && !Array.isArray(audit.newValues)
      ? audit.newValues.rowCount : null, csv.split("\r\n").length - 2);
    assert.equal(JSON.stringify(audit.newValues).includes("raw-token-secret"), false);
    assert.equal((await browser.admin.request(
      "/api/exports/audit-logs.csv?from=&to=&userId=&action=&entityType=&entityId=&partnerId=",
    )).status, 200);
  });

  await t.test("inactive company admins are blocked while superadmins may export its history", async () => {
    await prisma.company.update({ where: { id: fixture.inactiveCompany.id }, data: { isActive: false } });
    for (const endpoint of endpoints) {
      assert.equal((await browser.inactiveAdmin.request(endpoint)).status, 403, endpoint);
      assert.equal((await browser.superadmin.request(
        endpoint,
        {},
        fixture.inactiveCompany.id.toString(),
      )).status, 200, endpoint);
    }
  });
});

async function createFixture(): Promise<Fixture> {
  const suffix = randomUUID().replace(/-/g, "");
  const passwordHash = await hash(password!, { memoryCost: 19_456, timeCost: 2, parallelism: 1 });
  const company = await prisma.company.create({
    data: { name: `CSV export ${suffix}`, slug: `csv-${suffix.slice(0, 20)}` },
  });
  const otherCompany = await prisma.company.create({
    data: { name: `CSV foreign ${suffix}`, slug: `csv-f-${suffix.slice(0, 20)}` },
  });
  const inactiveCompany = await prisma.company.create({
    data: { name: `CSV inactive ${suffix}`, slug: `csv-i-${suffix.slice(0, 20)}` },
  });
  const createUser = (name: string, role: "admin" | "seller", companyId: bigint) =>
    prisma.user.create({
      data: {
        companyId,
        email: `${name}.${suffix}@example.test`,
        name,
        passwordHash,
        passwordChangedAt: new Date(),
        mustChangePassword: false,
        role,
      },
    });
  const [admin, otherAdmin, inactiveAdmin, seller, superadmin] = await Promise.all([
    createUser("csv-admin", "admin", company.id),
    createUser("csv-other-admin", "admin", otherCompany.id),
    createUser("csv-inactive-admin", "admin", inactiveCompany.id),
    createUser("csv-seller", "seller", company.id),
    prisma.user.create({
      data: {
        email: `csv-superadmin.${suffix}@example.test`,
        name: "CSV superadmin",
        passwordHash,
        passwordChangedAt: new Date(),
        mustChangePassword: false,
        role: "superadmin",
      },
    }),
  ]);

  const formulaPartner = await prisma.partner.create({
    data: {
      companyId: company.id,
      code: fixturePartnerCode("A", 0),
      type: "installer",
      displayName: "=SUM(1;1)",
      phone: "+421900111222",
      email: "admin-private@example.test",
      internalNote: "Private admin note",
      createdByUserId: admin.id,
    },
  });
  const monthlyPartner = await prisma.partner.create({
    data: {
      companyId: company.id,
      code: fixturePartnerCode("B", 0),
      type: "installer",
      displayName: "Monthly partner",
      createdByUserId: admin.id,
    },
  });
  const foreignPartner = await prisma.partner.create({
    data: {
      companyId: otherCompany.id,
      code: fixturePartnerCode("C", 0),
      type: "company",
      displayName: "Foreign tenant partner",
      createdByUserId: otherAdmin.id,
    },
  });
  await prisma.partner.create({
    data: {
      companyId: inactiveCompany.id,
      code: fixturePartnerCode("D", 0),
      type: "installer",
      displayName: "Inactive tenant partner",
      createdByUserId: inactiveAdmin.id,
    },
  });
  await prisma.partner.createMany({
    data: Array.from({ length: 53 }, (_, index) => ({
      companyId: company.id,
      code: fixturePartnerCode("Z", index + 1),
      type: "referrer" as const,
      displayName: `CSV unpaginated ${index}`,
      createdByUserId: admin.id,
    })),
  });

  await prisma.purchase.createMany({
    data: [
      {
        companyId: company.id,
        partnerId: monthlyPartner.id,
        amount: "100.00",
        netAmount: "81.30",
        vatRatePercent: "23.00",
        points: 81,
        partnerPresent: true,
        source: "manual",
        purchasedAt: new Date("2026-01-31T23:00:00.000Z"),
        createdByUserId: admin.id,
      },
      {
        companyId: company.id,
        partnerId: monthlyPartner.id,
        amount: "19.99",
        netAmount: "16.25",
        vatRatePercent: "23.00",
        points: 16,
        partnerPresent: true,
        source: "manual",
        purchasedAt: new Date("2026-02-28T12:00:00.000Z"),
        createdByUserId: admin.id,
      },
      {
        companyId: company.id,
        partnerId: monthlyPartner.id,
        amount: "8.00",
        netAmount: "6.50",
        vatRatePercent: "23.00",
        points: 6,
        partnerPresent: true,
        note: "before-boundary",
        source: "manual",
        purchasedAt: new Date("2026-01-31T22:59:59.000Z"),
        createdByUserId: admin.id,
      },
      {
        companyId: company.id,
        partnerId: formulaPartner.id,
        amount: "50.00",
        netAmount: "40.65",
        vatRatePercent: "23.00",
        points: 40,
        partnerPresent: false,
        note: "deleted fixture",
        source: "manual",
        purchasedAt: new Date("2026-02-15T12:00:00.000Z"),
        isDeleted: true,
        deletedAt: new Date("2026-02-16T12:00:00.000Z"),
        deletedByUserId: admin.id,
        createdByUserId: admin.id,
      },
    ],
  });
  const deletedPurchase = await prisma.purchase.findFirstOrThrow({
    where: { companyId: company.id, note: "deleted fixture" },
  });

  for (let index = 0; index < 25; index += 1) {
    await record({
      companyId: company.id,
      userId: admin.id,
      action: "partner.update",
      entityType: "partner",
      entityId: monthlyPartner.id,
      partnerId: monthlyPartner.id,
      oldValues: { displayName: "Old", email: "old.private@example.test" },
      newValues: {
        displayName: "Monthly partner",
        email: "private.audit@example.test",
        token: "raw-token-secret",
      },
      ipAddress: "198.51.100.25",
      userAgent: "private-user-agent",
      reason: `Private audit actor ${index}`,
    });
  }

  const browsers = {
    admin: new Browser(),
    otherAdmin: new Browser(),
    inactiveAdmin: new Browser(),
    seller: new Browser(),
    superadmin: new Browser(),
  };
  const [adminSession, otherAdminSession, inactiveAdminSession, sellerSession, superadminSession] = await Promise.all([
    browsers.admin.login(admin.email),
    browsers.otherAdmin.login(otherAdmin.email),
    browsers.inactiveAdmin.login(inactiveAdmin.email),
    browsers.seller.login(seller.email),
    browsers.superadmin.login(superadmin.email),
  ]);
  void adminSession;
  void otherAdminSession;
  void inactiveAdminSession;
  void sellerSession;

  return {
    company,
    otherCompany,
    inactiveCompany,
    admin,
    otherAdmin,
    inactiveAdmin,
    seller,
    superadmin,
    foreignPartnerId: foreignPartner.id,
    deletedPurchaseId: deletedPurchase.id,
    browser: browsers,
    superadminSession,
  };
}

function fixturePartnerCode(prefix: "A" | "B" | "C" | "D" | "Y" | "Z", value: number) {
  const alphabet = "23456789ABCDEFGHJKMNPQRSTVWXYZ";
  let number = value;
  let suffix = "";
  do {
    suffix = alphabet[number % alphabet.length] + suffix;
    number = Math.floor(number / alphabet.length);
  } while (number > 0);
  return `EP-${prefix}${suffix.padStart(4, alphabet[0])}`;
}

function assertCsvHeaders(response: Response, filename: string) {
  assert.match(response.headers.get("content-type") ?? "", /^text\/csv;\s*charset=utf-8$/i);
  assert.equal(response.headers.get("cache-control"), "no-store");
  assert.equal(response.headers.get("x-content-type-options"), "nosniff");
  assert.equal(response.headers.get("content-disposition"), `attachment; filename="${filename}"`);
}
