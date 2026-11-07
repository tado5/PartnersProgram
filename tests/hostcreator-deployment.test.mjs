import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { mkdir, mkdtemp, readFile, readlink, rm, symlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";

const sha = execFileSync("git", ["rev-parse", "HEAD"], { encoding: "utf8" }).trim();

async function download({ conclusion = "success", expired = false, artifactSha = sha, status = 200 } = {}) {
  const directory = await mkdtemp(join(tmpdir(), "partners-artifact-test-"));
  const destination = join(directory, "artifact.zip");
  const originalFetch = globalThis.fetch;
  const originalArgv = process.argv;
  const originalToken = process.env.HOSTCREATOR_GITHUB_TOKEN;
  const requests = [];
  process.env.HOSTCREATOR_GITHUB_TOKEN = "synthetic-test-token";
  process.argv = [process.execPath, "download-hostcreator-artifact.mjs", destination];
  globalThis.fetch = async (url, options) => {
    requests.push({ url: String(url), options });
    if (status !== 200) return new Response(null, { status });
    if (String(url).includes("/workflows/")) {
      return Response.json({
        workflow_runs: [{ id: 123, head_sha: sha, head_branch: "main", event: "push", status: "completed", conclusion }],
      });
    }
    if (String(url).includes("/runs/123/artifacts")) {
      return Response.json({
        artifacts: [{ id: 456, name: `hostcreator-standalone-${artifactSha}`, expired }],
      });
    }
    if (String(url).endsWith("/456/zip")) {
      return new Response(null, { status: 302, headers: { location: "https://storage.example.invalid/runtime.zip" } });
    }
    assert.equal(String(url), "https://storage.example.invalid/runtime.zip");
    assert.equal(options.headers, undefined, "Repository token must not be forwarded to storage");
    return new Response("synthetic-artifact");
  };
  try {
    await import(`../scripts/download-hostcreator-artifact.mjs?test=${crypto.randomUUID()}`);
    return { contents: await readFile(destination, "utf8"), requests };
  } finally {
    globalThis.fetch = originalFetch;
    process.argv = originalArgv;
    if (originalToken === undefined) delete process.env.HOSTCREATOR_GITHUB_TOKEN;
    else process.env.HOSTCREATOR_GITHUB_TOKEN = originalToken;
    await rm(directory, { recursive: true, force: true });
  }
}

test("downloads only an artifact from successful push CI for the deployment commit", async () => {
  const result = await download();
  assert.equal(result.contents, "synthetic-artifact");
  assert.equal(result.requests.length, 4);
  assert.match(result.requests[0].url, new RegExp(`head_sha=${sha}&branch=main&event=push`));
  assert.equal(result.requests[2].options.redirect, "manual");
});

test("failed or cancelled CI stops deployment", async () => {
  for (const conclusion of ["failure", "cancelled"]) {
    await assert.rejects(download({ conclusion }), /deployment stopped/);
  }
});

test("expired and wrong-commit artifacts are rejected", async () => {
  await assert.rejects(download({ expired: true }), /missing or expired/);
  await assert.rejects(download({ artifactSha: "0".repeat(40) }), /missing or expired/);
});

test("GitHub authorization errors are explicit", async () => {
  await assert.rejects(download({ status: 403 }), /HTTP 403/);
});

test("standalone preparation supports a clean checkout without optional public assets", async () => {
  const directory = await mkdtemp(join(tmpdir(), "partners-static-test-"));
  try {
    for (const path of ["scripts", ".next/standalone", ".next/static"]) {
      await mkdir(join(directory, path), { recursive: true });
    }
    await writeFile(join(directory, ".next/standalone/server.js"), "// Test fixture\n");
    await writeFile(join(directory, ".next/static/test.js"), "static-asset");
    const source = await readFile(new URL("../scripts/prepare-standalone.mjs", import.meta.url));
    const script = join(directory, "scripts/prepare-standalone.mjs");
    await writeFile(script, source);
    execFileSync(process.execPath, [script]);
    assert.equal(await readFile(join(directory, ".next/standalone/.next/static/test.js"), "utf8"), "static-asset");
    await mkdir(join(directory, "public"));
    await writeFile(join(directory, "public/test.txt"), "public-asset");
    execFileSync(process.execPath, [script]);
    assert.equal(await readFile(join(directory, ".next/standalone/public/test.txt"), "utf8"), "public-asset");
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});

test("Bash prepares a verified runtime without modifying the active release", async () => {
  const directory = await mkdtemp(join(tmpdir(), "partners-prepare-test-"));
  const release = join(directory, "sub/partners/release_20261107080507");
  const shared = join(directory, "sub/partners/shared");
  const bin = join(directory, "bin");
  const runtime = join(directory, "runtime");
  const artifact = join(directory, "artifact");
  const script = new URL("../scripts/hostcreator-prepare.sh", import.meta.url);
  try {
    for (const path of [release, shared, bin, artifact, join(runtime, "node_modules"),
      join(runtime, ".next/static"), join(runtime, "public")]) {
      await mkdir(path, { recursive: true });
    }
    await symlink("release_20261019102821", join(directory, "sub/partners/current"));
    await mkdir(join(directory, "sub/partners/release_20261019102821"));
    await writeFile(join(shared, ".env"), "SYNTHETIC_ENV=test-only\n");
    await writeFile(join(runtime, "server.js"), "// Synthetic runtime fixture\n");
    // Stand in for the Linux preflight and network download; extraction uses real tools.
    await writeFile(join(bin, "node"), '#!/bin/bash\nif [[ "$1" == "-e" ]]; then exit 0; fi\ncp "$HOSTCREATOR_TEST_ZIP" "$2"\n', { mode: 0o700 });
    await writeFile(join(bin, "sha256sum"), `#!${process.execPath}
const fs = require("node:fs");
const crypto = require("node:crypto");
const expected = fs.readFileSync("SHA256SUMS", "utf8").split(" ")[0];
const actual = crypto.createHash("sha256").update(fs.readFileSync("runtime.tar.gz")).digest("hex");
if (expected !== actual) process.exit(1);
`, { mode: 0o700 });
    execFileSync("tar", ["-czf", join(artifact, "runtime.tar.gz"), "-C", runtime, "."]);
    const checksum = createHash("sha256").update(await readFile(join(artifact, "runtime.tar.gz"))).digest("hex");
    await writeFile(join(artifact, "SHA256SUMS"), `${checksum}  runtime.tar.gz\n`);
    await writeFile(join(artifact, "commit.txt"), `${sha}\n`);
    const zip = join(directory, "artifact.zip");
    execFileSync("zip", ["-q", zip, "runtime.tar.gz", "SHA256SUMS", "commit.txt"], { cwd: artifact });
    const env = {
      ...process.env,
      PATH: `${bin}:${process.env.PATH}`,
      HOSTCREATOR_TEST_ZIP: zip,
      GIT_DIR: execFileSync("git", ["rev-parse", "--absolute-git-dir"], { encoding: "utf8" }).trim(),
    };
    execFileSync("bash", [script.pathname], { cwd: release, env });
    assert.equal(await readFile(join(release, ".next/standalone/.env"), "utf8"), "SYNTHETIC_ENV=test-only\n");
    assert.equal(await readFile(join(release, ".env"), "utf8"), "SYNTHETIC_ENV=test-only\n");
    assert.equal(await readlink(join(directory, "sub/partners/current")), "release_20261019102821");
    assert.throws(() => execFileSync("bash", [script.pathname], { cwd: release, env, stdio: "pipe" }), /already contains .next/);

    await rm(join(release, ".next"), { recursive: true });
    await writeFile(join(runtime, ".env.production"), "SYNTHETIC_FORBIDDEN_ENV=1\n");
    execFileSync("tar", ["-czf", join(artifact, "runtime.tar.gz"), "-C", runtime, "."]);
    const unsafeChecksum = createHash("sha256").update(await readFile(join(artifact, "runtime.tar.gz"))).digest("hex");
    await writeFile(join(artifact, "SHA256SUMS"), `${unsafeChecksum}  runtime.tar.gz\n`);
    execFileSync("zip", ["-q", zip, "runtime.tar.gz", "SHA256SUMS", "commit.txt"], { cwd: artifact });
    assert.throws(() => execFileSync("bash", [script.pathname], { cwd: release, env, stdio: "pipe" }), /forbidden paths/);
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});
