import assert from "node:assert/strict";
import { createHash, randomBytes, randomUUID } from "node:crypto";
import { readdirSync, readFileSync } from "node:fs";
import { join, relative } from "node:path";
import { test } from "node:test";
import { encode } from "@auth/core/jwt";
import { hash } from "@node-rs/argon2";
import type { User } from "@prisma/client";
import ts from "typescript";
import { prisma } from "../src/server/db";
import { generatePartnerCode } from "../src/server/partners";

const base = "http://127.0.0.1:3017";
const origin = "https://partners.example.invalid";
const cookieName = "__Secure-authjs.session-token";
type Method = "GET" | "POST" | "PUT" | "PATCH" | "DELETE";
type Access = "tenant-admin" | "tenant-staff" | "superadmin" | "account" | "auth" | "public" | "cron" | "logo" | "privacy";
type Endpoint = { route: string; method: Method; access: Access; success?: number };

// Each explicit handler export needs a role/guard case, including factory-created handlers.
const endpoints: Endpoint[] = [
  { route: "/api/auth/[...nextauth]", method: "GET", access: "auth" },
  { route: "/api/auth/[...nextauth]", method: "POST", access: "auth" },
  { route: "/api/audit-logs", method: "GET", access: "tenant-admin" },
  // Multipart uploads, missing-logo reads and read-only superadmin access use the
  // dedicated role/context matrix in logo-acceptance.test.ts (ACCEPTANCE_LOGO=1).
  { route: "/api/company/logo", method: "GET", access: "logo" },
  { route: "/api/company/logo", method: "PUT", access: "logo" },
  { route: "/api/company/logo", method: "DELETE", access: "logo" },
  // Publication concurrency, immutable evidence and the read-only superadmin
  // matrix are exercised in privacy-acceptance.test.ts (ACCEPTANCE_PRIVACY=1).
  { route: "/api/company/privacy", method: "GET", access: "privacy" },
  { route: "/api/company/privacy", method: "PUT", access: "privacy" },
  { route: "/api/company/privacy/publish", method: "POST", access: "privacy" },
  { route: "/api/company/settings", method: "GET", access: "tenant-admin" },
  { route: "/api/company/settings", method: "PATCH", access: "tenant-admin" },
  { route: "/api/cron/close-monthly-badges", method: "POST", access: "cron" },
  ...["audit-logs", "monthly", "partners", "purchases"].map((kind): Endpoint => ({
    route: `/api/exports/${kind}.csv`, method: "GET", access: "tenant-admin",
  })),
  { route: "/api/me/password", method: "POST", access: "account" },
  { route: "/api/partners", method: "GET", access: "tenant-staff" },
  { route: "/api/partners", method: "POST", access: "tenant-admin", success: 201 },
  { route: "/api/partners/[id]", method: "GET", access: "tenant-admin" },
  { route: "/api/partners/[id]", method: "PATCH", access: "tenant-admin" },
  { route: "/api/partners/[id]/activate", method: "POST", access: "tenant-admin" },
  { route: "/api/partners/[id]/deactivate", method: "POST", access: "tenant-admin" },
  { route: "/api/partners/[id]/privacy", method: "GET", access: "privacy" },
  { route: "/api/partners/[id]/privacy", method: "POST", access: "privacy" },
  { route: "/api/partners/[id]/purchases", method: "GET", access: "tenant-admin" },
  { route: "/api/partners/[id]/summary", method: "GET", access: "tenant-staff" },
  { route: "/api/partners/[id]/tokens", method: "GET", access: "tenant-admin" },
  { route: "/api/partners/[id]/tokens", method: "POST", access: "tenant-admin", success: 201 },
  { route: "/api/public/card/[token]", method: "GET", access: "public" },
  { route: "/api/purchases", method: "GET", access: "tenant-staff" },
  { route: "/api/purchases", method: "POST", access: "tenant-staff", success: 201 },
  { route: "/api/purchases/[id]", method: "GET", access: "tenant-admin" },
  { route: "/api/purchases/[id]", method: "PATCH", access: "tenant-admin" },
  { route: "/api/purchases/[id]", method: "DELETE", access: "tenant-admin" },
  { route: "/api/reports/dashboard", method: "GET", access: "tenant-staff" },
  { route: "/api/reports/monthly", method: "GET", access: "tenant-admin" },
  { route: "/api/reports/pdf", method: "GET", access: "tenant-admin" },
  { route: "/api/scan/resolve", method: "POST", access: "tenant-staff" },
  { route: "/api/superadmin/audit-logs", method: "GET", access: "superadmin" },
  { route: "/api/superadmin/companies", method: "GET", access: "superadmin" },
  { route: "/api/superadmin/companies", method: "POST", access: "superadmin", success: 201 },
  { route: "/api/superadmin/companies/[id]", method: "GET", access: "superadmin" },
  { route: "/api/superadmin/companies/[id]", method: "PATCH", access: "superadmin" },
  { route: "/api/superadmin/companies/[id]/activate", method: "POST", access: "superadmin" },
  { route: "/api/superadmin/companies/[id]/deactivate", method: "POST", access: "superadmin" },
  { route: "/api/superadmin/company-context", method: "POST", access: "superadmin" },
  { route: "/api/superadmin/company-context", method: "DELETE", access: "superadmin" },
  { route: "/api/tokens/[tokenId]/deactivate", method: "POST", access: "tenant-admin" },
  { route: "/api/users", method: "GET", access: "tenant-admin" },
  { route: "/api/users", method: "POST", access: "tenant-admin", success: 201 },
  { route: "/api/users/[id]", method: "PATCH", access: "tenant-admin" },
  { route: "/api/users/[id]/reset-password", method: "POST", access: "tenant-admin" },
];

test("phase 11 endpoint inventory covers every exported HTTP method", () => {
  const root = join(process.cwd(), "src/app/api");
  const found: string[] = [];
  function walk(directory: string) {
    for (const entry of readdirSync(directory, { withFileTypes: true })) {
      const path = join(directory, entry.name);
      if (entry.isDirectory()) walk(path);
      else if (/^route\.[cm]?[jt]sx?$/.test(entry.name)) {
        const source = ts.createSourceFile(path, readFileSync(path, "utf8"), ts.ScriptTarget.Latest, true);
        const names: string[] = [];
        for (const statement of source.statements) {
          if (ts.isExportDeclaration(statement) && statement.exportClause && ts.isNamedExports(statement.exportClause)) {
            names.push(...statement.exportClause.elements.map((element) => element.name.text));
          } else if (ts.canHaveModifiers(statement) &&
            ts.getModifiers(statement)?.some((modifier) => modifier.kind === ts.SyntaxKind.ExportKeyword)) {
            if (ts.isFunctionDeclaration(statement) && statement.name) names.push(statement.name.text);
            if (ts.isVariableStatement(statement)) {
              for (const declaration of statement.declarationList.declarations) {
                if (ts.isIdentifier(declaration.name)) names.push(declaration.name.text);
                else if (ts.isObjectBindingPattern(declaration.name)) {
                  names.push(...declaration.name.elements.map((element) => element.name.getText(source)));
                }
              }
            }
          }
        }
        const route = `/api/${relative(root, directory).split("\\").join("/")}`.replace(/\/$/, "");
        found.push(...names.filter((name) => /^(GET|HEAD|POST|PUT|PATCH|DELETE|OPTIONS)$/.test(name))
          .map((name) => `${name} ${route}`));
      }
    }
  }
  walk(root);
  const covered = endpoints.map(({ route, method }) => `${method} ${route}`);
  assert.equal(new Set(covered).size, covered.length, "Inventory must not contain duplicate cases.");
  assert.deepEqual(covered.sort(), found.sort(), "Add a role/guard case for every new handler export.");
  console.info(`Phase 11 inventory: ${new Set(endpoints.map((entry) => entry.route)).size} routes, ${endpoints.length} methods.`);
});

class Client {
  cookies = new Map<string, string>();
  async request(path: string, init: RequestInit = {}, companyId?: bigint) {
    const headers = new Headers(init.headers);
    headers.set("Origin", origin);
    headers.set("Cookie", [...this.cookies].map(([name, value]) => `${name}=${value}`).join("; "));
    // Isolate this suite's bounded public bucket from other acceptance fixtures.
    headers.set("X-Real-IP", "192.0.2.111");
    if (companyId) headers.set("X-Company-Id", companyId.toString());
    if (init.body && !headers.has("Content-Type")) headers.set("Content-Type", "application/json");
    const response = await fetch(`${base}${path}`, { ...init, headers, redirect: "manual" });
    for (const value of response.headers.getSetCookie()) {
      const pair = value.split(";")[0];
      const separator = pair.indexOf("=");
      this.cookies.set(pair.slice(0, separator), pair.slice(separator + 1));
    }
    return response;
  }
}

async function clientFor(user?: User) {
  const client = new Client();
  if (user) {
    const current = await prisma.user.findUniqueOrThrow({ where: { id: user.id } });
    const now = Date.now();
    client.cookies.set(cookieName, await encode({
      salt: cookieName, secret: process.env.AUTH_SECRET!,
      token: {
        userId: current.id.toString(), companyId: current.companyId?.toString() ?? null,
        tenantVersion: 1, role: current.role, mustChangePassword: current.mustChangePassword,
        passwordChangedAt: current.passwordChangedAt?.getTime() ?? 0,
        loginAt: now, lastActivityAt: now, isSessionValid: true,
      },
    }));
  }
  return client;
}

const json = (method: string, body: unknown): RequestInit => ({ method, body: JSON.stringify(body) });
async function expectStatus(response: Response, status: number, label: string, code?: string) {
  const text = await response.text();
  assert.equal(response.status, status, `${label}: ${text.slice(0, 500)}`);
  if (code) assert.equal(JSON.parse(text).error?.code, code, label);
  return text;
}

test("phase 11 complete endpoint role guards and tenant boundaries", async (t) => {
  assert.equal(process.env.NODE_ENV, "production", "Acceptance requires the production runtime.");
  assert.equal(process.env.APP_BASE_URL, origin);
  assert.ok(process.env.DATABASE_URL?.endsWith("/europodlahy_5a_validation"),
    "Only the disposable phase5a validation database is permitted.");
  assert.ok(process.env.AUTH_SECRET && process.env.AUTH_SECRET.length >= 32);
  const unique = randomUUID();
  const password = randomBytes(24).toString("base64url");
  const passwordHash = await hash(password, { memoryCost: 19456, timeCost: 2, parallelism: 1 });
  try {
    async function fixture(suffix: string) {
      const company = await prisma.company.create({ data: { name: `Phase11 ${suffix}`, slug: `phase11-${unique}-${suffix}` } });
      async function user(role: "admin" | "seller", label: string = role) {
        return prisma.user.create({ data: {
          companyId: company.id, email: `phase11-${unique}-${suffix}-${label}@example.test`,
          name: `Phase11 ${label}`, role, passwordHash, mustChangePassword: false,
        } });
      }
      const admin = await user("admin");
      const seller = await user("seller");
      const targetUser = await user("seller", "target");
      const notice = await prisma.companyPrivacyNotice.create({ data: {
        companyId: company.id, version: 1, publishedByUserId: admin.id,
        publishedAt: new Date(Date.now() - 60_000),
        controllerName: company.name, controllerAddress: "Acceptance 1, Bratislava",
        contactEmail: admin.email, body: "Privacy information for isolated HTTP fixtures. ".repeat(4),
      } });
      const partner = await prisma.partner.create({ data: {
        companyId: company.id, code: generatePartnerCode(),
        displayName: `Phase11 partner ${suffix}`, type: "installer", createdByUserId: admin.id,
      } });
      const value = randomBytes(32).toString("base64url");
      const token = await prisma.partnerToken.create({ data: {
        companyId: company.id, partnerId: partner.id, type: "qr",
        tokenHash: createHash("sha256").update(value).digest("hex"), tokenHint: value.slice(0, 6),
        createdByUserId: admin.id,
      } });
      const purchase = await prisma.purchase.create({ data: {
        companyId: company.id, partnerId: partner.id, amount: "12.30", netAmount: "10.00",
        vatRatePercent: "23.00", points: 10, partnerPresent: true, source: "manual",
        createdByUserId: seller.id, idempotencyKey: randomUUID(),
      } });
      return { company, admin, seller, targetUser, notice, partner, token, value, purchase };
    }
    const first = await fixture("a");
    const second = await fixture("b");
    const superadmin = await prisma.user.create({ data: {
      email: `phase11-${unique}-superadmin@example.test`, name: "Phase11 superadmin",
      role: "superadmin", passwordHash, mustChangePassword: false,
    } });
    const actors = { anonymous: undefined, seller: first.seller, admin: first.admin, superadmin };
    type Actor = keyof typeof actors;
    const tenant = (entry: Endpoint) => entry.access === "tenant-admin" || entry.access === "tenant-staff";
    function pathFor(entry: Endpoint, target = first) {
      const id = entry.route.startsWith("/api/users") ? target.targetUser.id
        : entry.route.startsWith("/api/purchases") ? target.purchase.id
          : entry.route.startsWith("/api/superadmin") ? target.company.id : target.partner.id;
      return entry.route.replace("[id]", id.toString()).replace("[tokenId]", target.token.id.toString())
        .replace("[token]", target.value)
        + (entry.route === "/api/reports/monthly" || entry.route === "/api/reports/pdf" ||
          entry.route === "/api/exports/monthly.csv" ? "?month=2026-10" : "");
    }
    function payload(entry: Endpoint, target = first): unknown {
      if (entry.method === "GET") return undefined;
      if (entry.route.endsWith("/deactivate") || entry.method === "DELETE") return { reason: "Phase11 guard probe" };
      if (entry.route.endsWith("/activate")) return undefined;
      if (entry.route === "/api/me/password") return { currentPassword: password, newPassword: `${password}-changed` };
      if (entry.route === "/api/company/settings") return {
        vatRatePercent: "23.00", purchaseConfirmAboveEur: null,
        bronzeMonthlyTurnoverEur: null, silverMonthlyTurnoverEur: null, goldMonthlyTurnoverEur: null,
      };
      if (entry.route === "/api/partners") return {
        type: "installer", displayName: `Phase11 new ${randomUUID()}`,
        privacy: { noticeId: target.notice.id.toString(), providedAt: new Date().toISOString(), method: "in_person" },
      };
      if (entry.route === "/api/partners/[id]") return { displayName: "Phase11 updated" };
      if (entry.route.endsWith("/tokens")) return { type: "qr", label: "Phase11 matrix" };
      if (entry.route === "/api/purchases") return {
        partnerId: target.partner.id.toString(), amount: "12.30", partnerPresent: true,
        source: "manual", idempotencyKey: randomUUID(),
      };
      if (entry.route === "/api/purchases/[id]") return { amount: "24.60", reason: "Phase11 guard probe" };
      if (entry.route === "/api/scan/resolve") return { token: target.value };
      if (entry.route === "/api/users") return {
        email: `phase11-${randomUUID()}@example.test`, name: "Phase11 created seller",
        role: "seller", temporaryPassword: password,
      };
      if (entry.route === "/api/users/[id]") return { name: "Phase11 updated seller" };
      if (entry.route.endsWith("/reset-password")) return { temporaryPassword: password };
      if (entry.route === "/api/superadmin/companies") return {
        name: "Phase11 created company", slug: `phase11-${randomUUID()}`,
        admin: { name: "Phase11 created admin", email: `phase11-${randomUUID()}@example.test`, temporaryPassword: password },
      };
      if (entry.route === "/api/superadmin/companies/[id]") return { name: "Phase11 updated company" };
      if (entry.route === "/api/superadmin/company-context") return { companyId: target.company.id.toString() };
      return undefined;
    }
    function initFor(entry: Endpoint, target = first) {
      const body = payload(entry, target);
      return body === undefined ? { method: entry.method } : json(entry.method, body);
    }
    async function restore() {
      await prisma.company.update({ where: { id: first.company.id }, data: { isActive: true, deactivatedAt: null } });
      await prisma.partner.update({ where: { id: first.partner.id }, data: { isActive: true, deactivatedAt: null } });
      await prisma.partnerToken.update({ where: { id: first.token.id }, data: { isActive: true, deactivatedAt: null } });
      await prisma.purchase.update({ where: { id: first.purchase.id }, data: { isDeleted: false, deletedAt: null } });
    }
    async function send(entry: Endpoint, actor: Actor, target = first, context = true) {
      const client = await clientFor(actors[actor]);
      if (entry.access === "auth") {
        if (entry.method === "GET") return client.request("/api/auth/session");
        const csrf = await (await client.request("/api/auth/csrf")).json();
        return client.request("/api/auth/signout", {
          method: "POST", headers: { "Content-Type": "application/x-www-form-urlencoded", "X-Auth-Return-Redirect": "1" },
          body: new URLSearchParams({ csrfToken: csrf.csrfToken, callbackUrl: `${base}/login` }),
        });
      }
      return client.request(pathFor(entry, target), initFor(entry, target),
        actor === "superadmin" && context && tenant(entry) ? first.company.id : undefined);
    }

    for (const entry of endpoints.filter((entry) => !["logo", "privacy"].includes(entry.access))) {
      await t.test(`${entry.method} ${entry.route}: anonymous/seller/admin/superadmin`, async () => {
        for (const actor of Object.keys(actors) as Actor[]) {
          let status = entry.success ?? 200;
          let code: string | undefined;
          if (entry.access === "cron") { status = 401; code = "UNAUTHENTICATED"; }
          else if (!["auth", "public"].includes(entry.access)) {
            if (actor === "anonymous") { status = 401; code = "UNAUTHENTICATED"; }
            else if ((entry.access === "superadmin" && actor !== "superadmin") ||
              (entry.access === "tenant-admin" && actor === "seller") ||
              (entry.route === "/api/company/settings" && entry.method === "PATCH" && actor === "superadmin")) {
              status = 403; code = "FORBIDDEN";
            }
          }
          const text = await expectStatus(await send(entry, actor), status, `${actor} ${entry.method} ${entry.route}`, code);
          if (entry.route.endsWith("/tokens") && entry.method === "POST" && status === 201) {
            const issued = JSON.parse(text);
            assert.match(issued.value, /^[A-Za-z0-9_-]{43}$/);
            const stored = await prisma.partnerToken.findUniqueOrThrow({ where: { id: BigInt(issued.token.id) } });
            assert.equal(stored.tokenHash, createHash("sha256").update(issued.value).digest("hex"));
            assert.equal(stored.tokenHint, issued.value.slice(0, 6));
            assert.equal(issued.token.tokenHash, undefined);
          }
          if (entry.route === "/api/me/password" && actor !== "anonymous") {
            await prisma.user.update({ where: { id: actors[actor]!.id }, data: { passwordHash } });
          }
          if (entry.route.includes("/deactivate") || entry.method === "DELETE") await restore();
        }
        if (tenant(entry)) {
          await expectStatus(await send(entry, "superadmin", first, false), 400,
            `superadmin missing context ${entry.method} ${entry.route}`, "COMPANY_CONTEXT_REQUIRED");
        }
      });
    }

    await t.test("foreign resource IDs stay invisible to admin and explicitly scoped superadmin", async () => {
      const scoped = endpoints.filter((entry) => tenant(entry) &&
        (entry.route.includes("[id]") || entry.route.includes("[tokenId]")));
      for (const actor of ["admin", "superadmin"] as const) {
        for (const entry of scoped) {
          await expectStatus(await send(entry, actor, second), 404, `${actor} foreign ${entry.method} ${entry.route}`, "NOT_FOUND");
        }
      }
      for (const actor of ["seller", "admin", "superadmin"] as const) {
        for (const route of ["/api/scan/resolve", "/api/purchases"]) {
          const entry = endpoints.find((entry) => entry.route === route && entry.method === "POST")!;
          await expectStatus(await send(entry, actor, second), 404, `${actor} foreign payload ${route}`, "NOT_FOUND");
        }
        const summary = endpoints.find((entry) => entry.route.endsWith("/summary"))!;
        await expectStatus(await send(summary, actor, second), 404, `${actor} foreign summary`, "NOT_FOUND");
      }
      const admin = await clientFor(first.admin);
      const purchaseBody = payload(endpoints.find((entry) => entry.route === "/api/purchases" && entry.method === "POST")!) as object;
      await expectStatus(await admin.request("/api/purchases", json("POST", {
        ...purchaseBody, source: "qr", tokenId: second.token.id.toString(),
      })), 404, "foreign token on local purchase", "NOT_FOUND");
      await expectStatus(await admin.request(`/api/purchases/${first.purchase.id}`, json("PATCH", {
        partnerId: second.partner.id.toString(), reason: "Foreign partner reassignment",
      })), 404, "foreign purchase reassignment", "NOT_FOUND");
      await expectStatus(await admin.request(`/api/partners/${first.partner.id}/tokens`, json("POST", {
        type: "qr", deactivateTokenIds: [second.token.id.toString()], deactivationReason: "Foreign token rotation",
      })), 404, "foreign token rotation", "NOT_FOUND");
      await expectStatus(await admin.request("/api/partners", {}, second.company.id), 403, "admin cannot switch company", "FORBIDDEN");
      assert.equal((await prisma.partnerToken.findUniqueOrThrow({ where: { id: second.token.id } })).isActive, true);
      assert.equal((await prisma.purchase.findUniqueOrThrow({ where: { id: second.purchase.id } })).isDeleted, false);
      assert.equal((await prisma.partner.findUniqueOrThrow({ where: { id: second.partner.id } })).displayName, second.partner.displayName);
      assert.equal((await prisma.user.findUniqueOrThrow({ where: { id: second.targetUser.id } })).passwordHash, passwordHash);
    });

    await t.test("inactive program blocks every tenant handler, public card, scan and new token/purchase writes", async () => {
      await prisma.company.update({ where: { id: first.company.id }, data: { isActive: false } });
      try {
        for (const entry of endpoints.filter(tenant)) {
          await expectStatus(await send(entry, "admin"), 403, `inactive admin ${entry.method} ${entry.route}`, "COMPANY_INACTIVE");
          if (entry.access === "tenant-staff") {
            await expectStatus(await send(entry, "seller"), 403, `inactive seller ${entry.route}`, "COMPANY_INACTIVE");
          }
        }
        for (const route of ["/api/purchases", "/api/partners/[id]/tokens"]) {
          const entry = endpoints.find((entry) => entry.route === route && entry.method === "POST")!;
          await expectStatus(await send(entry, "superadmin"), 409, `inactive superadmin ${route}`, "COMPANY_INACTIVE");
        }
        const publicCard = endpoints.find((entry) => entry.access === "public")!;
        await expectStatus(await send(publicCard, "anonymous"), 404, "inactive public card", "NOT_FOUND");
      } finally { await restore(); }
    });

    await t.test("public writes are 405 and partner/token deactivation revokes public cards and seller scan", async () => {
      const anonymous = await clientFor();
      for (const path of [`/api/public/card/${first.value}`, `/k/${first.value}`]) {
        for (const method of ["POST", "PUT", "PATCH", "DELETE", "HEAD", "OPTIONS"]) {
          const response = await anonymous.request(path, { method });
          assert.equal(response.headers.get("allow"), "GET");
          await expectStatus(response, 405, `${method} ${path}`);
        }
      }
      const scan = endpoints.find((entry) => entry.route === "/api/scan/resolve")!;
      const card = endpoints.find((entry) => entry.access === "public")!;
      for (const route of ["/api/partners/[id]/deactivate", "/api/tokens/[tokenId]/deactivate"]) {
        await expectStatus(await send(card, "anonymous"), 200, "active public card");
        await expectStatus(await send(scan, "seller"), 200, "active seller scan");
        await expectStatus(await send(endpoints.find((entry) => entry.route === route)!, "admin"), 200, route);
        await expectStatus(await send(card, "anonymous"), 404, "revoked public card", "NOT_FOUND");
        await expectStatus(await send(scan, "seller"), 404, "revoked seller scan", "NOT_FOUND");
        await restore();
      }
    });
  } finally {
    // Audit rows are append-only; the runner drops the entire disposable schema.
    await prisma.$disconnect();
  }
});
