import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { createRequire } from "node:module";
import { once } from "node:events";

const require = createRequire("/app/package.json");
const { hash, verify } = require("@node-rs/argon2");
assert.equal(await verify(await hash("synthetic-alpine-check"), "synthetic-alpine-check"), true);
const sharp = require("sharp");
const png = await sharp({ create: { width: 2, height: 2, channels: 3, background: "#ffffff" } }).png().toBuffer();
assert.equal((await sharp(png).metadata()).width, 2);

const server = spawn(process.execPath, ["server.js"], {
  cwd: "/app", env: { ...process.env, HOSTNAME: "127.0.0.1", PORT: "3017" }, stdio: "inherit",
});
const exited = once(server, "exit");
const base = "http://127.0.0.1:3017";
const cookies = new Map();
async function request(path, options = {}) {
  const response = await fetch(`${base}${path}`, {
    ...options, redirect: "manual", signal: AbortSignal.timeout(10000),
    headers: { cookie: [...cookies].map(([key, value]) => `${key}=${value}`).join("; "), ...options.headers },
  });
  for (const cookie of response.headers.getSetCookie()) {
    const pair = cookie.split(";")[0];
    const index = pair.indexOf("=");
    cookies.set(pair.slice(0, index), pair.slice(index + 1));
  }
  assert.ok(response.status < 500, `${path} returned ${response.status}`);
  return response;
}
try {
  for (let attempt = 0; ; attempt++) {
    assert.equal(server.exitCode, null, "Alpine server exited before readiness.");
    try {
      const response = await fetch(`${base}/api/health`, { signal: AbortSignal.timeout(10000) });
      assert.equal(response.status, 200);
      assert.deepEqual(await response.json(), { status: "ok" });
      break;
    } catch (error) {
      if (attempt === 59) throw error;
      await new Promise(resolve => setTimeout(resolve, 500));
    }
  }
  assert.equal((await request("/api/auth/providers")).status, 200);
  const csrf = await (await request("/api/auth/csrf")).json();
  assert.ok(csrf.csrfToken);
  await request("/api/auth/callback/credentials", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded", "X-Auth-Return-Redirect": "1" },
    body: new URLSearchParams({
      csrfToken: csrf.csrfToken, email: "legacy.admin@example.test",
      password: process.env.PHASE5A_PASSWORD, callbackUrl: `${base}/app`,
    }),
  });
  const session = await (await request("/api/auth/session")).json();
  assert.equal(session.user?.isSessionValid, true, "Alpine credential login must create a valid session.");
  assert.equal(session.user.role, "admin");
  console.info("Alpine x64: Argon2, sharp, DB readiness and credential login passed.");
} finally {
  server.kill("SIGTERM");
  await exited;
}
