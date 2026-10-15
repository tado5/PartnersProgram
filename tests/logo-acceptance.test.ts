import assert from "node:assert/strict";
import { createHash, randomUUID } from "node:crypto";
import { test } from "node:test";
import { encode } from "@auth/core/jwt";
import type { User } from "@prisma/client";
import sharp from "sharp";

import { COMPANY_LOGO_MAX_BYTES, normalizeCompanyLogo } from "../src/server/company-logo";
import { prisma } from "../src/server/db";

const base = "http://127.0.0.1:3017";
const origin = "https://partners.example.invalid";
const endpoint = "/api/company/logo";
const cookieName = "__Secure-authjs.session-token";

if (!process.env.DATABASE_URL?.endsWith("/europodlahy_5a_validation")) {
  throw new Error("Logo acceptance requires the dedicated europodlahy_5a_validation database.");
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
  return async (init: RequestInit = {}, companyId?: bigint) => {
    const headers = new Headers(init.headers);
    if (!headers.has("Origin")) headers.set("Origin", origin);
    headers.set("Cookie", cookie);
    if (companyId) headers.set("X-Company-Id", companyId.toString());
    return fetch(`${base}${endpoint}`, { ...init, headers, redirect: "manual" });
  };
}

function upload(bytes: Uint8Array, type = "image/png"): RequestInit {
  const body = new FormData();
  body.append("file", new Blob([new Uint8Array(bytes)], { type }), "logo");
  return { method: "PUT", body };
}

async function status(response: Response, expected: number, code?: string) {
  assert.equal(response.status, expected, await response.clone().text().then((text) => text.slice(0, 300)));
  if (code) assert.equal((await response.json()).error?.code, code);
}

test("company logo HTTP and database acceptance", async (t) => {
  assert.equal(process.env.NODE_ENV, "production");
  assert.equal(process.env.APP_BASE_URL, origin);
  assert.ok(process.env.AUTH_SECRET && process.env.AUTH_SECRET.length >= 32);
  const unique = randomUUID();
  const company = await prisma.company.create({ data: { name: "Logo acceptance A", slug: `logo-a-${unique}` } });
  const otherCompany = await prisma.company.create({ data: { name: "Logo acceptance B", slug: `logo-b-${unique}` } });
  const inactiveCompany = await prisma.company.create({
    data: { name: "Logo acceptance inactive", slug: `logo-inactive-${unique}`, isActive: false },
  });
  const createUser = (role: User["role"], label: string, companyId: bigint | null, extra = {}) =>
    prisma.user.create({ data: {
      role, companyId, email: `logo-${unique}-${label}@example.test`,
      name: label, passwordHash: "unused-jwt-fixture", mustChangePassword: false, ...extra,
    } });
  try {
    const [admin, seller, otherAdmin, inactiveAdmin, superadmin, forced, disabled] = await Promise.all([
      createUser("admin", "admin", company.id), createUser("seller", "seller", company.id),
      createUser("admin", "other", otherCompany.id), createUser("admin", "inactive-company", inactiveCompany.id),
      createUser("superadmin", "superadmin", null),
      createUser("admin", "password-change", company.id, { mustChangePassword: true }),
      createUser("admin", "disabled", company.id, { isActive: false }),
    ]);
    const clients = {
      anonymous: await clientFor(), admin: await clientFor(admin), seller: await clientFor(seller),
      other: await clientFor(otherAdmin), inactive: await clientFor(inactiveAdmin),
      superadmin: await clientFor(superadmin), forced: await clientFor(forced), disabled: await clientFor(disabled),
    };
    const png = await sharp({
      create: { width: 1200, height: 600, channels: 4, background: "#24827480" },
    }).png().withMetadata().toBuffer();
    let version: string;
    let normalizedBytes: Buffer;

    await t.test("role, active company, explicit superadmin and tenant context guards cover every method", async () => {
      for (const method of ["GET", "PUT", "DELETE"]) {
        const init = () => method === "PUT" ? upload(png) : { method };
        await status(await clients.anonymous(init()), 401);
        await status(await clients.disabled(init()), 401);
        await status(await clients.forced(init()), 403, "PASSWORD_CHANGE_REQUIRED");
        await status(await clients.inactive(init()), 403, "COMPANY_INACTIVE");
        await status(await clients.admin(init(), otherCompany.id), 403, "FORBIDDEN");
        await status(await clients.seller(init(), otherCompany.id), 403, "FORBIDDEN");
        await status(await clients.superadmin(init()), 400, "COMPANY_CONTEXT_REQUIRED");
        await status(await clients.superadmin(init(), BigInt(9_000_000_000)), 404, "NOT_FOUND");
        if (method !== "GET") {
          await status(await clients.seller(init()), 403, "FORBIDDEN");
          await status(await clients.superadmin(init(), company.id), 403, "FORBIDDEN");
          await status(await clients.superadmin(init(), inactiveCompany.id), 403, "FORBIDDEN");
        }
      }
      const missing = await clients.admin();
      await status(missing, 404, "NOT_FOUND");
      assert.equal(missing.headers.get("Cache-Control"), "no-store");
      assert.equal(missing.headers.get("X-Content-Type-Options"), "nosniff");
      await status(await clients.seller(), 404, "NOT_FOUND");
      await status(await clients.superadmin({}, inactiveCompany.id), 404, "NOT_FOUND");
      assert.equal(await prisma.auditLog.count({
        where: { companyId: company.id, action: { startsWith: "company.logo_" } },
      }), 0);
    });

    await t.test("mutations reject foreign and missing origins without an audit or stored image", async () => {
      for (const method of ["PUT", "DELETE"]) {
        for (const value of ["https://evil.example.invalid", "null", ""]) {
          const init = method === "PUT" ? upload(png) : { method };
          await status(await clients.admin({ ...init, headers: { Origin: value } }), 403, "INVALID_ORIGIN");
        }
      }
      assert.equal((await prisma.company.findUniqueOrThrow({ where: { id: company.id } })).logoData, null);
      assert.equal(await prisma.auditLog.count({
        where: { companyId: company.id, action: { startsWith: "company.logo_" } },
      }), 0);
    });

    await t.test("upload stores normalized bytes and hash atomically, exposes only own image, and audits hash only", async () => {
      const response = await clients.admin(upload(png));
      await status(response, 200);
      version = (await response.json()).logoVersion;
      const stored = await prisma.company.findUniqueOrThrow({ where: { id: company.id } });
      assert.ok(stored.logoData);
      normalizedBytes = Buffer.from(stored.logoData);
      assert.equal(version, stored.logoVersion);
      assert.equal(version, createHash("sha256").update(normalizedBytes).digest("hex"));
      const metadata = await sharp(normalizedBytes).metadata();
      assert.equal(metadata.format, "png");
      assert.equal(metadata.width, 512);
      assert.equal(metadata.height, 256);
      assert.equal(metadata.exif, undefined);
      assert.equal(metadata.icc, undefined);
      assert.equal(metadata.xmp, undefined);
      for (const [client, context] of [
        [clients.admin, undefined], [clients.seller, undefined], [clients.superadmin, company.id],
      ] as const) {
        const image = await client({}, context);
        assert.equal(image.status, 200);
        assert.equal(image.headers.get("Content-Type"), "image/png");
        assert.equal(image.headers.get("Cache-Control"), "no-store");
        assert.equal(image.headers.get("X-Content-Type-Options"), "nosniff");
        assert.deepEqual(Buffer.from(await image.arrayBuffer()), normalizedBytes);
      }
      await status(await clients.other(), 404, "NOT_FOUND");
      await status(await clients.other({}, company.id), 403, "FORBIDDEN");
      const log = await prisma.auditLog.findFirstOrThrow({
        where: { companyId: company.id, action: "company.logo_update" }, orderBy: { id: "desc" },
      });
      assert.equal(log.userId, admin.id);
      assert.equal(log.entityId, company.id);
      assert.equal(log.entityType, "company");
      assert.deepEqual(log.oldValues, { logoVersion: null });
      assert.deepEqual(log.newValues, { logoVersion: version });
      await prisma.company.update({ where: { id: company.id }, data: { isActive: false } });
      try {
        await status(await clients.admin(), 403, "COMPANY_INACTIVE");
        const image = await clients.superadmin({}, company.id);
        assert.equal(image.status, 200);
        assert.deepEqual(Buffer.from(await image.arrayBuffer()), normalizedBytes);
      } finally {
        await prisma.company.update({ where: { id: company.id }, data: { isActive: true } });
      }
    });

    await t.test("invalid, spoofed, animated, oversized and pixel-bomb uploads never succeed or alter stored bytes/audit", async () => {
      const gif = await sharp({ create: { width: 2, height: 2, channels: 3, background: "red" } }).gif().toBuffer();
      const pixelBomb = await sharp({
        create: { width: 4001, height: 4000, channels: 3, background: "white" },
      }).png().toBuffer();
      const animatedWebp = await sharp(Buffer.from([255, 0, 0, 0, 255, 0]), {
        raw: { width: 1, height: 2, channels: 3, pageHeight: 1 },
      }).webp({ loop: 0, delay: [100, 100] }).toBuffer();
      const count = await prisma.auditLog.count({ where: { companyId: company.id } });
      const cases: Array<[Uint8Array, string, number]> = [
        [Buffer.from("<svg xmlns='http://www.w3.org/2000/svg'/>"), "image/svg+xml", 400],
        [gif, "image/gif", 400], [gif, "image/png", 400], [png, "image/jpeg", 400],
        [Buffer.from("not an image"), "image/png", 400],
        [png.subarray(0, 40), "image/png", 400],
        [animatedWebp, "image/webp", 400],
        [pixelBomb, "image/png", 400],
        [Buffer.alloc(COMPANY_LOGO_MAX_BYTES + 1), "image/png", 413],
      ];
      for (const [bytes, type, expected] of cases) {
        await status(await clients.admin(upload(bytes, type)), expected);
      }
      await status(await clients.admin({ method: "PUT", body: "broken", headers: {
        "Content-Type": "multipart/form-data; boundary=x",
      } }), 400);
      await status(await clients.admin({ method: "PUT", body: "{}", headers: { "Content-Type": "application/json" } }), 400);
      const stored = await prisma.company.findUniqueOrThrow({ where: { id: company.id } });
      assert.equal(stored.logoVersion, version);
      assert.deepEqual(Buffer.from(stored.logoData!), normalizedBytes);
      assert.equal(await prisma.auditLog.count({ where: { companyId: company.id } }), count);
    });

    await t.test("JPEG/WebP replacement changes the hash and delete clears both fields with hash-only audit", async () => {
      for (const format of ["jpeg", "webp"] as const) {
        const oldVersion = version;
        const input = await sharp({
          create: { width: 80, height: 40, channels: 3, background: format === "jpeg" ? "red" : "blue" },
        }).toFormat(format).withMetadata({ orientation: 6 }).toBuffer();
        const response = await clients.admin(upload(input, `image/${format}`));
        await status(response, 200);
        version = (await response.json()).logoVersion;
        assert.notEqual(version, oldVersion);
        const normalized = await normalizeCompanyLogo(input, `image/${format}`);
        const stored = await prisma.company.findUniqueOrThrow({ where: { id: company.id } });
        assert.deepEqual(Buffer.from(stored.logoData!), normalized.logoData);
        const audit = await prisma.auditLog.findFirstOrThrow({
          where: { companyId: company.id, action: "company.logo_update" }, orderBy: { id: "desc" },
        });
        assert.deepEqual(audit.oldValues, { logoVersion: oldVersion });
        assert.deepEqual(audit.newValues, { logoVersion: version });
      }
      const response = await clients.admin({ method: "DELETE" });
      await status(response, 200);
      assert.deepEqual(await response.json(), { logoVersion: null });
      const stored = await prisma.company.findUniqueOrThrow({ where: { id: company.id } });
      assert.equal(stored.logoData, null);
      assert.equal(stored.logoVersion, null);
      const audit = await prisma.auditLog.findFirstOrThrow({
        where: { companyId: company.id, action: "company.logo_delete" }, orderBy: { id: "desc" },
      });
      assert.deepEqual(audit.oldValues, { logoVersion: version });
      assert.deepEqual(audit.newValues, { logoVersion: null });
      for (const client of [clients.admin, clients.seller]) await status(await client(), 404, "NOT_FOUND");
      assert.equal((await prisma.company.findUniqueOrThrow({ where: { id: otherCompany.id } })).logoData, null);
    });
  } finally {
    // The acceptance runner drops this dedicated database; audit events remain append-only.
    await prisma.$disconnect();
  }
});
