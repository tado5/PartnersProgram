import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { cp, mkdir, mkdtemp, readFile, readlink, rm, symlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { createSourceManifest, verifySourceManifest } from "../scripts/hostcreator-source-manifest.mjs";
import { dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { runInNewContext } from "node:vm";

const sha = execFileSync("git", ["rev-parse", "HEAD"], { encoding: "utf8" }).trim();

test("online PWA worker does not intercept API or cache data and preserves HTTP errors", async () => {
  const handlers = new Map();
  let online = true;
  const options = [];
  runInNewContext(await readFile(new URL("../public/sw.js", import.meta.url), "utf8"), {
    self: { addEventListener: (type, handler) => handlers.set(type, handler) },
    Response,
    fetch: async (_request, init) => {
      options.push(init);
      if (!online) throw new Error("Offline");
      return new Response("Original server error", { status: 500 });
    },
  });
  let response;
  const respondWith = promise => { response = promise; };
  handlers.get("fetch")({ request: { mode: "cors", method: "POST" }, respondWith });
  assert.equal(response, undefined, "API writes must not be intercepted");
  handlers.get("fetch")({ request: { mode: "navigate", method: "GET" }, respondWith });
  assert.equal((await response).status, 500, "HTTP server errors must not become offline successes");
  assert.equal(options[0].cache, "no-store");
  online = false;
  handlers.get("fetch")({ request: { mode: "navigate", method: "GET" }, respondWith });
  const offline = await response;
  assert.equal(offline.status, 503);
  assert.equal(offline.headers.get("cache-control"), "no-store");
  assert.match(await offline.text(), /Nie ste pripojení na internet/);
});

test("Alpine native packaging includes locked binaries and rejects mismatched versions", async () => {
  const root = await mkdtemp(join(tmpdir(), "partners-native-test-"));
  try {
    await mkdir(join(root, "scripts"), { recursive: true });
    await cp(new URL("../scripts/prepare-hostcreator-native.mjs", import.meta.url),
      join(root, "scripts/prepare-hostcreator-native.mjs"));
    const runtime = join(root, ".next/standalone");
    await mkdir(runtime, { recursive: true });
    await writeFile(join(runtime, "server.js"), "");
    for (const [parent, native, version] of [
      ["@node-rs/argon2", "@node-rs/argon2-linux-x64-musl", "2.0.2"],
      ["sharp", "@img/sharp-linuxmusl-x64", "0.35.5"],
      ["sharp", "@img/sharp-libvips-linuxmusl-x64", "1.3.4"],
    ]) {
      const parentDirectory = join(runtime, "node_modules", parent);
      const binaryDirectory = join(root, "scripts/hostcreator-native/node_modules", native);
      await mkdir(parentDirectory, { recursive: true });
      await mkdir(binaryDirectory, { recursive: true });
      const path = join(parentDirectory, "package.json");
      let metadata = { optionalDependencies: {} };
      if (parent === "sharp" && native.includes("libvips")) metadata = JSON.parse(await readFile(path, "utf8"));
      metadata.optionalDependencies[native] = version;
      await writeFile(path, JSON.stringify(metadata));
      await writeFile(join(binaryDirectory, "package.json"), JSON.stringify({ version }));
      await writeFile(join(binaryDirectory, "binding.node"), "synthetic-binary");
    }
    const script = join(root, "scripts/prepare-hostcreator-native.mjs");
    execFileSync(process.execPath, [script]);
    assert.equal(await readFile(join(runtime, "node_modules/@node-rs/argon2-linux-x64-musl/binding.node"), "utf8"), "synthetic-binary");
    await writeFile(join(root, "scripts/hostcreator-native/node_modules/@node-rs/argon2-linux-x64-musl/package.json"),
      JSON.stringify({ version: "0.0.0" }));
    assert.throws(() => execFileSync(process.execPath, [script], { stdio: "pipe" }), /version mismatch/);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

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
  assert.match(result.requests[0].url, /branch=main&event=push/);
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

test("migration wrapper uses shared configuration, requires approval and propagates CLI failure", async () => {
  const directory = await mkdtemp(join(tmpdir(), "partners-migration-test-"));
  const release = join(directory, "sub/partners/release_20261107080507");
  const bundle = join(release, ".next/standalone/.hostcreator-migrate");
  const shared = join(directory, "sub/partners/shared");
  const evidence = join(bundle, "cli-evidence.json");
  try {
    await mkdir(join(release, "scripts"), { recursive: true });
    await mkdir(join(bundle, "node_modules/prisma/build"), { recursive: true });
    await mkdir(shared);
    await cp(new URL("../node_modules/dotenv", import.meta.url), join(bundle, "node_modules/dotenv"), { recursive: true });
    await writeFile(join(bundle, "package.json"), '{"private":true}');
    await writeFile(join(release, "scripts/hostcreator-migrate.mjs"), await readFile(new URL("../scripts/hostcreator-migrate.mjs", import.meta.url)));
    await writeFile(join(shared, ".env"), "DATABASE_URL=mysql://app:synthetic@localhost/db\nMIGRATE_DATABASE_URL=mysql://migrate:synthetic@localhost/db\n");
    await writeFile(join(bundle, "node_modules/prisma/build/index.js"), `
const fs = require("node:fs");
fs.writeFileSync("cli-evidence.json", JSON.stringify({
  args: process.argv.slice(2),
  url: process.env.MIGRATE_DATABASE_URL,
  token: process.env.HOSTCREATOR_GITHUB_TOKEN,
  shadow: process.env.SHADOW_DATABASE_URL,
  environment: process.env.NODE_ENV
}));
process.exit(process.argv[3] === "status" ? 1 : 0);
`);
    const runner = join(release, "scripts/hostcreator-migrate.mjs");
    const env = { ...process.env, HOSTCREATOR_GITHUB_TOKEN: "synthetic-token", MIGRATE_DATABASE_URL: "synthetic-build-url" };
    assert.throws(() => execFileSync(process.execPath, [runner, "deploy"], { env, stdio: "pipe" }), /requires HOSTCREATOR_MIGRATIONS_APPROVED/);
    await assert.rejects(readFile(evidence), /ENOENT/);
    assert.throws(() => execFileSync(process.execPath, [runner, "status"], { env, stdio: "pipe" }), (error) => error.status === 1);
    const recorded = JSON.parse(await readFile(evidence, "utf8"));
    assert.equal(recorded.url, "mysql://migrate:synthetic@localhost/db");
    assert.equal(recorded.token, undefined);
    assert.equal(recorded.shadow, undefined);
    assert.equal(recorded.environment, "production");
    assert.deepEqual(recorded.args, ["migrate", "status", "--config", "prisma.config.mjs"]);
    execFileSync(process.execPath, [runner, "deploy"], { env: { ...env, HOSTCREATOR_MIGRATIONS_APPROVED: "yes" }, stdio: "pipe" });
    assert.equal(JSON.parse(await readFile(evidence, "utf8")).args[1], "deploy");
    await writeFile(join(shared, ".env"), "DATABASE_URL=mysql://app:synthetic@localhost/db\nMIGRATE_DATABASE_URL=mysql://app:synthetic@localhost/db\n");
    assert.throws(() => execFileSync(process.execPath, [runner, "status"], { env, stdio: "pipe" }), (error) => error.status === 1);
    assert.equal(JSON.parse(await readFile(evidence, "utf8")).args[1], "status");
    assert.equal(JSON.parse(await readFile(evidence, "utf8")).url, "mysql://app:synthetic@localhost/db");
    await rm(evidence);
    assert.throws(() => execFileSync(process.execPath, [runner, "deploy"], {
      env: { ...env, HOSTCREATOR_MIGRATIONS_APPROVED: "yes" }, stdio: "pipe",
    }), /requires HOSTCREATOR_SHARED_DB_ACCOUNT_APPROVED/);
    await assert.rejects(readFile(evidence), /ENOENT/);
    execFileSync(process.execPath, [runner, "deploy"], {
      env: { ...env, HOSTCREATOR_MIGRATIONS_APPROVED: "yes", HOSTCREATOR_SHARED_DB_ACCOUNT_APPROVED: "yes" },
      stdio: "pipe",
    });
    assert.equal(JSON.parse(await readFile(evidence, "utf8")).args[1], "deploy");
    assert.equal(JSON.parse(await readFile(evidence, "utf8")).url, recorded.url.replace("migrate:", "app:"));
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});

test("source verification without Git metadata rejects changed, extra, missing and symlinked sources", async () => {
  const root = await mkdtemp(join(tmpdir(), "partners-source-test-"));
  const content = "synthetic-source\n";
  const manifest = { commit: sha, files: [{ path: "src/app.ts", sha256: createHash("sha256").update(content).digest("hex") }] };
  try {
    await mkdir(join(root, "src"));
    await writeFile(join(root, "src/app.ts"), content);
    await writeFile(join(root, ".env"), "SYNTHETIC_RUNTIME_ONLY=1\n");
    verifySourceManifest(root, manifest, sha);
    assert.throws(() => verifySourceManifest(root, manifest, "0".repeat(40)), /mismatched commit/);
    await writeFile(join(root, "src/app.ts"), "changed");
    assert.throws(() => verifySourceManifest(root, manifest, sha), /source mismatch/);
    await writeFile(join(root, "src/app.ts"), content);
    await writeFile(join(root, "src/extra.ts"), "extra");
    assert.throws(() => verifySourceManifest(root, manifest, sha), /Unexpected deployment source/);
    await rm(join(root, "src/extra.ts"));
    await rm(join(root, "src/app.ts"));
    assert.throws(() => verifySourceManifest(root, manifest, sha), /ENOENT/);
    await writeFile(join(root, "target.ts"), content);
    await symlink(join(root, "target.ts"), join(root, "src/app.ts"));
    assert.throws(() => verifySourceManifest(root, manifest, sha), /symlink/);
    assert.throws(() => verifySourceManifest(root, { commit: sha, files: [{ path: "../outside", sha256: "0".repeat(64) }] }, sha), /manifest path/);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("CI manifest verifies a complete exported checkout with no .git directory", async () => {
  const root = fileURLToPath(new URL("../", import.meta.url));
  const exported = await mkdtemp(join(tmpdir(), "partners-exported-source-"));
  try {
    const manifest = createSourceManifest(root, sha);
    assert.ok(manifest.files.some((file) => file.path === ".env.example"));
    assert.ok(!manifest.files.some((file) => file.path === ".env" || file.path === ".env.production"));
    for (const file of manifest.files) {
      const path = join(exported, file.path);
      await mkdir(dirname(path), { recursive: true });
      await writeFile(path, await readFile(join(root, file.path)));
    }
    verifySourceManifest(exported, manifest, sha);
  } finally {
    await rm(exported, { recursive: true, force: true });
  }
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

test("Node ZIP extraction accepts stored and compressed files and rejects corruption and extra entries", async () => {
  const directory = await mkdtemp(join(tmpdir(), "partners-zip-test-"));
  const extractor = new URL("../scripts/extract-hostcreator-artifact.mjs", import.meta.url).pathname;
  try {
    const source = join(directory, "source");
    await mkdir(source);
    for (const name of ["runtime.tar.gz", "commit.txt", "SHA256SUMS", "source-manifest.json"]) {
      await writeFile(join(source, name), `${name}\n`.repeat(name === "runtime.tar.gz" ? 100 : 1));
    }
    for (const compression of ["0", "9"]) {
      const archive = join(directory, `archive-${compression}.zip`);
      const output = join(directory, `output-${compression}`);
      await mkdir(output);
      execFileSync("zip", ["-q", `-${compression}`, archive, "runtime.tar.gz", "commit.txt", "SHA256SUMS", "source-manifest.json"], { cwd: source });
      execFileSync(process.execPath, [extractor, archive, output]);
      assert.deepEqual(await readFile(join(output, "runtime.tar.gz")), await readFile(join(source, "runtime.tar.gz")));
    }
    const broken = await readFile(join(directory, "archive-0.zip"));
    const payload = 30 + broken.readUInt16LE(26) + broken.readUInt16LE(28);
    broken[payload] ^= 1;
    const archive = join(directory, "broken.zip");
    await writeFile(archive, broken);
    const output = join(directory, "rejected");
    await mkdir(output);
    assert.throws(() => execFileSync(process.execPath, [extractor, archive, output], { stdio: "pipe" }), /checksum mismatch/);
    await writeFile(join(source, "unexpected.txt"), "unexpected");
    const extra = join(directory, "extra.zip");
    execFileSync("zip", ["-q", extra, "runtime.tar.gz", "commit.txt", "SHA256SUMS", "source-manifest.json", "unexpected.txt"], { cwd: source });
    assert.throws(() => execFileSync(process.execPath, [extractor, extra, output], { stdio: "pipe" }), /exactly four/);
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
    await writeFile(join(release, "package.json"), '{"name":"synthetic-source"}\n');
    await writeFile(join(runtime, "server.js"), "// Synthetic runtime fixture\n");
    // Stand in for the Linux preflight and network download; extraction uses real tools.
    await writeFile(join(bin, "node"), `#!/bin/bash
if [[ "$1" == "-e" ]]; then exit 0; fi
if [[ "$1" == "scripts/download-hostcreator-artifact.mjs" ]]; then
  cp "$HOSTCREATOR_TEST_ZIP" "$2"
  printf '%s\\n' "$HOSTCREATOR_TEST_SHA" > "$(dirname "$2")/selected-commit.txt"
elif [[ "$1" == "scripts/hostcreator-source-manifest.mjs" ]]; then
  exec "$HOSTCREATOR_TEST_NODE" "$HOSTCREATOR_TEST_MANIFEST" "$2" "$3" "$4"
else
  exec "$HOSTCREATOR_TEST_NODE" "$HOSTCREATOR_TEST_EXTRACTOR" "$2" "$3"
fi
`, { mode: 0o700 });
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
    await writeFile(join(artifact, "source-manifest.json"), JSON.stringify({
      commit: sha,
      files: [{ path: "package.json", sha256: createHash("sha256").update(await readFile(join(release, "package.json"))).digest("hex") }],
    }));
    const zip = join(directory, "artifact.zip");
    execFileSync("zip", ["-q", zip, "runtime.tar.gz", "SHA256SUMS", "commit.txt", "source-manifest.json"], { cwd: artifact });
    const env = {
      ...process.env,
      PATH: `${bin}:${process.env.PATH}`,
      HOSTCREATOR_TEST_ZIP: zip,
      HOSTCREATOR_TEST_NODE: process.execPath,
      HOSTCREATOR_TEST_SHA: sha,
      HOSTCREATOR_TEST_MANIFEST: new URL("../scripts/hostcreator-source-manifest.mjs", import.meta.url).pathname,
      HOSTCREATOR_TEST_EXTRACTOR: new URL("../scripts/extract-hostcreator-artifact.mjs", import.meta.url).pathname,
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
    execFileSync("zip", ["-q", zip, "runtime.tar.gz", "SHA256SUMS", "commit.txt", "source-manifest.json"], { cwd: artifact });
    assert.throws(() => execFileSync("bash", [script.pathname], { cwd: release, env, stdio: "pipe" }), /forbidden paths/);
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});
