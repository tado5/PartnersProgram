import { spawnSync } from "node:child_process";
import { existsSync, readFileSync, realpathSync } from "node:fs";
import { createRequire } from "node:module";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = fileURLToPath(new URL("../", import.meta.url));
const mode = process.argv[2];
if (!["status", "deploy"].includes(mode)) throw new Error("Use status (read-only) or deploy (changes the database).");
const release = realpathSync(root);
if (!/\/sub\/partners\/release_[0-9]{14}$/.test(release)) {
  throw new Error("Run migration commands only inside a HostCreators partners release.");
}
const bundle = resolve(root, ".next/standalone/.hostcreator-migrate");
const cli = resolve(bundle, "node_modules/prisma/build/index.js");
if (!existsSync(cli)) throw new Error("Migration tools are missing; prepare the new CI runtime package first.");
const require = createRequire(resolve(bundle, "package.json"));
const { parse } = require("dotenv");
const configuration = parse(readFileSync(resolve(root, "../shared/.env")));
const url = configuration.MIGRATE_DATABASE_URL;
if (!url) throw new Error("shared/.env must contain MIGRATE_DATABASE_URL for the migration account.");
if (mode === "deploy" && process.env.HOSTCREATOR_MIGRATIONS_APPROVED !== "yes") {
  throw new Error("Migration deploy requires HOSTCREATOR_MIGRATIONS_APPROVED=yes after data review and approval of the backup or explicit acceptance of proceeding without one.");
}
if (mode === "deploy" && url === configuration.DATABASE_URL) {
  if (process.env.HOSTCREATOR_SHARED_DB_ACCOUNT_APPROVED !== "yes") {
    throw new Error("Migration with the existing application account requires HOSTCREATOR_SHARED_DB_ACCOUNT_APPROVED=yes.");
  }
  console.warn("Approved migration uses the existing application DB account; database accounts and permissions are not changed by this runner.");
}
const result = spawnSync(process.execPath, [cli, "migrate", mode, "--config", "prisma.config.mjs"], {
  cwd: bundle,
  env: {
    PATH: process.env.PATH,
    HOME: process.env.HOME,
    NODE_ENV: "production",
    MIGRATE_DATABASE_URL: url,
    PRISMA_HIDE_UPDATE_MESSAGE: "1",
    CHECKPOINT_DISABLE: "1",
  },
  stdio: "inherit",
});
if (result.error) throw result.error;
if (result.signal) throw new Error(`Migration process stopped by ${result.signal}.`);
process.exitCode = result.status ?? 1;
if (mode === "deploy" && result.status === 0) {
  const maintenance = spawnSync(process.execPath, [
    resolve(root, "scripts/hostcreator-maintenance.mjs"),
    process.env.HOSTCREATOR_TEST_RESET_APPROVED === "yes" ? "reset" : "configure",
  ], {
    cwd: root,
    env: {
      PATH: process.env.PATH,
      HOME: process.env.HOME,
      HOSTCREATOR_TEST_RESET_APPROVED: process.env.HOSTCREATOR_TEST_RESET_APPROVED,
    },
    stdio: "inherit",
  });
  if (maintenance.error) throw maintenance.error;
  if (maintenance.signal) throw new Error(`Maintenance stopped by ${maintenance.signal}.`);
  process.exitCode = maintenance.status ?? 1;
}
