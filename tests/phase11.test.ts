import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { test } from "node:test";
import { NextRequest } from "next/server";

// Import only after supplying an isolated, non-connecting environment.
process.env.DATABASE_URL ??= "mysql://unit:unit@127.0.0.1:3308/europodlahy_5a_validation";
process.env.RATE_LIMIT_LOGIN_PER_MIN = "2";
process.env.RATE_LIMIT_PUBLIC_PER_MIN = "3";
const limiter = import("../src/server/auth/rate-limit");

test("login and public limits are independent, bounded per IP and reset exactly at window expiry", async () => {
  const { allowLoginAttempt, allowPublicRequest } = await limiter;
  const ip = randomUUID();
  const now = 100_000;
  assert.equal(allowLoginAttempt(ip, now), true);
  assert.equal(allowLoginAttempt(ip, now + 1), true);
  assert.equal(allowLoginAttempt(ip, now + 2), false);
  assert.equal(allowLoginAttempt(ip, now + 59_999), false);
  assert.equal(allowLoginAttempt(`${ip}-other`, now), true);
  assert.equal(allowPublicRequest(ip, now), true);
  assert.equal(allowPublicRequest(ip, now + 1), true);
  assert.equal(allowPublicRequest(ip, now + 2), true);
  assert.equal(allowPublicRequest(ip, now + 3), false);
  assert.equal(allowPublicRequest(ip, now + 59_999), false);
  assert.equal(allowPublicRequest(ip, now + 60_000), true);
  assert.equal(allowLoginAttempt(ip, now + 60_000), true);
});

test("missing client IP shares a bounded unknown bucket, with separate login/public quotas", async () => {
  const { allowLoginAttempt, allowPublicRequest } = await limiter;
  const now = 1_000_000;
  assert.deepEqual(Array.from({ length: 3 }, () => allowLoginAttempt(undefined, now)), [true, true, false]);
  assert.deepEqual(Array.from({ length: 4 }, () => allowPublicRequest(undefined, now)), [true, true, true, false]);
});

test("IP extraction gives real-IP precedence, takes the first forwarded IP and caps header length", async () => {
  const { getClientIp } = await limiter;
  assert.equal(getClientIp(new Headers()), undefined);
  assert.equal(getClientIp(new Headers({ "x-real-ip": " 192.0.2.1 ", "x-forwarded-for": "192.0.2.2, 192.0.2.3" })), "192.0.2.1");
  assert.equal(getClientIp(new Headers({ "x-forwarded-for": " 192.0.2.2, 192.0.2.3" })), "192.0.2.2");
  assert.equal(getClientIp(new Headers({ "x-real-ip": "x".repeat(100) }))?.length, 45);
});

test("bucket pruning removes expired entries and retains a bounded live working set", async () => {
  const { allowPublicRequest } = await limiter;
  const key = randomUUID();
  const now = 10_000_000;
  for (let index = 0; index < 10_001; index++) {
    assert.equal(allowPublicRequest(`${key}-${index}`, now + index), true);
  }
  const last = `${key}-10000`;
  assert.equal(allowPublicRequest(last, now + 10_002), true);
  assert.equal(allowPublicRequest(last, now + 10_003), true);
  assert.equal(allowPublicRequest(last, now + 10_004), false);
  assert.equal(allowPublicRequest(`${key}-0`, now + 10_004), true, "oldest live bucket was evicted");
  assert.equal(allowPublicRequest(last, now + 70_001), true, "expired bucket starts a new window");
});

test("public proxy returns 429 at the helper boundary and 405 for writes without consuming quota", async () => {
  await limiter;
  const { proxy } = await import("../src/proxy");
  for (const path of ["/api/public/card/" + "a".repeat(43), "/k/" + "a".repeat(43)]) {
    const headers = { "x-real-ip": randomUUID() };
    for (const method of ["POST", "PUT", "PATCH", "DELETE", "HEAD", "OPTIONS"]) {
      const response = proxy(new NextRequest(`https://partners.example.invalid${path}`, { method, headers }));
      assert.equal(response.status, 405);
      assert.equal(response.headers.get("allow"), "GET");
    }
    for (let attempt = 0; attempt < 3; attempt++) {
      assert.equal(proxy(new NextRequest(`https://partners.example.invalid${path}`, { headers })).status, 200);
    }
    const limited = proxy(new NextRequest(`https://partners.example.invalid${path}`, { headers }));
    assert.equal(limited.status, 429);
    assert.match(limited.headers.get("cache-control")!, /no-store/);
    assert.equal(limited.headers.get("x-content-type-options"), "nosniff");
    assert.match(await limited.text(), /Príliš veľa/);
  }
});
