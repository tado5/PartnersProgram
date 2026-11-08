import { createRequire } from "node:module";
import { existsSync, readFileSync, realpathSync } from "node:fs";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { configureEncryption, resetTestData } from "./hostcreator-maintenance-lib.mjs";

const root = realpathSync(fileURLToPath(new URL("../", import.meta.url)));
if (!/\/sub\/partners\/release_[0-9]{14}$/.test(root)) throw new Error("Run maintenance only in a HostCreators release.");
const mode = process.argv[2];
if (!["configure", "reset"].includes(mode)) throw new Error("Use configure or reset.");
const require = createRequire(resolve(root, ".next/standalone/.hostcreator-migrate/package.json"));
const { parse } = require("dotenv");
const { createConnection } = require("mariadb");
const configuration = parse(readFileSync(resolve(root, "../shared/.env"), "utf8"));
let url;
let applicationUrl;
try {
  url = new URL(configuration.MIGRATE_DATABASE_URL);
  applicationUrl = new URL(configuration.DATABASE_URL);
} catch {
  throw new Error("Invalid migration URL in shared configuration; its value is not logged.");
}
if (url.protocol !== "mysql:") throw new Error("Maintenance requires a mysql:// migration URL.");
if (applicationUrl.protocol !== "mysql:" || url.hostname !== applicationUrl.hostname ||
    (url.port || "3306") !== (applicationUrl.port || "3306") || url.pathname !== applicationUrl.pathname) {
  throw new Error("Migration and application URLs must point to the same database. No maintenance performed.");
}
let connection;
try {
  connection = await createConnection({
    host: url.hostname, port: Number(url.port || 3306),
    user: decodeURIComponent(url.username), password: decodeURIComponent(url.password),
    database: decodeURIComponent(url.pathname.slice(1)), connectTimeout: 10000,
  });
  if (mode === "reset") {
    const active = realpathSync(resolve(root, "../current"));
    const activeConfiguration = parse(readFileSync(resolve(active, ".next/standalone/.env"), "utf8"));
    await resetTestData(connection, resolve(root, "../shared"), {
      approved: process.env.HOSTCREATOR_TEST_RESET_APPROVED === "yes",
      activeCapable: existsSync(resolve(active, ".next/standalone/.hostcreator-maintenance-capable")) &&
        activeConfiguration.HOSTCREATOR_MAINTENANCE_FILE === resolve(root, "../shared/.partners-maintenance"),
      async verifyMaintenance() {
        const endpoint = new URL("/api/health", configuration.APP_BASE_URL);
        if (endpoint.protocol !== "https:") throw new Error("Maintenance requires the production HTTPS application URL.");
        let confirmed = false;
        try {
          const response = await fetch(endpoint, { redirect: "error", cache: "no-store", signal: AbortSignal.timeout(15000) });
          confirmed = response.status === 503 && (await response.text()).includes("Prebieha údržba aplikácie");
        } catch {
          throw new Error("Could not confirm active application maintenance mode. No deletion started.");
        }
        if (!confirmed) throw new Error("Active application did not confirm maintenance mode. No deletion started.");
      },
    });
  }
  const [keyLock] = await connection.query("SELECT GET_LOCK('partners-token-encryption-config', 10) AS acquired");
  if (Number(keyLock.acquired) !== 1) throw new Error("Another encryption configuration operation is running.");
  try {
    await configureEncryption(connection, root, parse);
  } finally {
    await connection.query("SELECT RELEASE_LOCK('partners-token-encryption-config')");
  }
} catch (error) {
  // Connector messages can include connection details; only report a safe code.
  console.error(error.code || error.sql || error.sqlMessage
    ? `Maintenance database operation failed (${error.code ?? "database-error"}).`
    : error.message);
  process.exitCode = 1;
} finally {
  if (connection) await connection.end();
}
