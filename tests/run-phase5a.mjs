import { execFileSync, spawn, spawnSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { randomBytes, createHash } from "node:crypto";
import { hash } from "@node-rs/argon2";
import dotenv from "dotenv";
import assert from "node:assert/strict";

// Isolated Docker DB only: never uses or resets existing development/test databases.
const database = "europodlahy_5a_validation";
const shadowDatabase = "europodlahy_5a_validation_shadow";
const defaults = dotenv.parse(readFileSync(".env.example"));
const containerEnv = execFileSync("docker", ["compose", "exec", "-T", "db", "printenv"], { encoding: "utf8" });
const values = Object.fromEntries(containerEnv.split("\n").filter((line) => line.includes("="))
  .map((line) => [line.slice(0, line.indexOf("=")), line.slice(line.indexOf("=") + 1)]));
function sql(input, useDatabase = true) {
  try {
    return execFileSync("docker", ["compose", "exec", "-T", "db", "bash", "-c",
    `MYSQL_PWD="$MARIADB_ROOT_PASSWORD" mariadb -uroot --batch --skip-column-names ${useDatabase ? database : ""}`],
    { input, encoding: "utf8", stdio: ["pipe", "pipe", "pipe"] });
  } catch {
    throw new Error("Isolated validation SQL failed (statement details suppressed).");
  }
}
assert.equal(sql(`SELECT COUNT(*) FROM information_schema.SCHEMATA
  WHERE SCHEMA_NAME IN ('${database}', '${shadowDatabase}');`, false).trim(), "0",
  "Validation database already exists; refuse to overwrite it.");
let server;
let created = false;
let shadowCreated = false;
try {
  sql(`CREATE DATABASE ${database} CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;`, false);
  created = true;
  sql(`CREATE DATABASE ${shadowDatabase} CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;`, false);
  shadowCreated = true;
  sql(`GRANT ALL PRIVILEGES ON ${database}.* TO 'europodlahy_migrate'@'%';
    GRANT ALL PRIVILEGES ON ${shadowDatabase}.* TO 'europodlahy_migrate'@'%';`, false);
  sql(readFileSync("prisma/migrations/20261007083557_init/migration.sql", "utf8"));
  sql(readFileSync("prisma/migrations/20261007100000_partner_code_case_check/migration.sql", "utf8"));
  const password = randomBytes(24).toString("base64url");
  const passwordHash = await hash(password, { memoryCost: 19456, timeCost: 2, parallelism: 1 });
  const tokenValue = randomBytes(32).toString("base64url");
  const tokenHash = createHash("sha256").update(tokenValue).digest("hex");
  sql(`INSERT INTO users (id,email,name,password_hash,role,must_change_password,updated_at)
    VALUES (1,'legacy.admin@example.test','Legacy admin','${passwordHash}','admin',0,NOW(3)),
           (2,'legacy.seller@example.test','Legacy seller','${passwordHash}','seller',0,NOW(3));
    INSERT INTO partners (id,code,type,display_name,created_by_user_id,updated_at)
      VALUES (3,'EP-23456','installer','Legacy partner',1,NOW(3));
    INSERT INTO partner_tokens (id,partner_id,type,token_hash,token_hint,created_by_user_id)
      VALUES (4,3,'qr','${tokenHash}','${tokenValue.slice(0, 6)}',1);
    INSERT INTO purchases (id,partner_id,amount,points,partner_present,source,token_id,created_by_user_id,updated_at)
      VALUES (5,3,19.99,19,1,'qr',4,2,NOW(3));
    INSERT INTO audit_logs (id,user_id,action,entity_type,entity_id,partner_id,old_values,new_values,reason,ip_address,user_agent,created_at)
      VALUES (6,1,'legacy.create','partner',3,3,'{"original":true}','{"note":"unchanged"}','original reason','127.0.0.1','original agent','2026-10-07 10:00:00.123');`);
  const originalAudit = sql("SELECT id,user_id,action,entity_type,entity_id,partner_id,old_values,new_values,reason,ip_address,user_agent,created_at FROM audit_logs;");
  sql(readFileSync("prisma/migrations/20261008130000_companies/migration.sql", "utf8"));
  assert.equal(sql("SELECT id,user_id,action,entity_type,entity_id,partner_id,old_values,new_values,reason,ip_address,user_agent,created_at FROM audit_logs;"), originalAudit);
  assert.equal(sql("SELECT company_id FROM audit_logs WHERE id=6;").trim(), "1");
  assert.equal(sql("SELECT id,token_hash FROM partner_tokens WHERE id=4;").trim(), `4\t${tokenHash}`);
  assert.equal(sql("SELECT id,company_id,role FROM users ORDER BY id;").trim(), "1\t1\tadmin\n2\t1\tseller");
  sql(readFileSync("prisma/migrations/20261013110000_company_purchase_confirmation/migration.sql", "utf8"));
  sql(readFileSync("prisma/migrations/20261013120000_monthly_partner_badges/migration.sql", "utf8"));
  sql(readFileSync("prisma/migrations/20261013130000_purchase_vat/migration.sql", "utf8"));
  sql(readFileSync("prisma/migrations/20261014090000_purchase_vat_drop_default/migration.sql", "utf8"));
  sql(readFileSync("prisma/migrations/20261014100000_audit_company_created_index/migration.sql", "utf8"));
  sql(readFileSync("prisma/migrations/20261015110000_company_logo/migration.sql", "utf8"));
  sql(readFileSync("prisma/migrations/20261015120000_privacy_notices/migration.sql", "utf8"));
  sql(readFileSync("prisma/migrations/20261020090000_reopenable_partner_tokens/migration.sql", "utf8"));
  assert.equal(sql("SELECT amount,net_amount,vat_rate_percent,points FROM purchases WHERE id=5;").trim(), "19.99\t16.25\t23.00\t16");
  assert.equal(sql("SELECT COLUMN_DEFAULT IS NULL FROM information_schema.COLUMNS WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='purchases' AND COLUMN_NAME='vat_rate_percent';").trim(), "1");
  assert.equal(sql("SELECT COUNT(DISTINCT INDEX_NAME) FROM information_schema.STATISTICS WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='audit_logs' AND INDEX_NAME='audit_logs_company_created_idx';").trim(), "1");
  assert.equal(sql("SELECT id,user_id,action,entity_type,entity_id,partner_id,old_values,new_values,reason,ip_address,user_agent,created_at FROM audit_logs;"), originalAudit);
  for (const forbidden of ["UPDATE audit_logs SET action='changed' WHERE id=6;", "DELETE FROM audit_logs WHERE id=6;"]) {
    assert.throws(() => sql(forbidden));
  }
  sql(`GRANT SELECT, INSERT, UPDATE ON ${database}.companies TO 'europodlahy_app'@'%';
    GRANT SELECT, INSERT, UPDATE ON ${database}.users TO 'europodlahy_app'@'%';
    GRANT SELECT, INSERT, UPDATE ON ${database}.partners TO 'europodlahy_app'@'%';
    GRANT SELECT, INSERT, UPDATE ON ${database}.partner_tokens TO 'europodlahy_app'@'%';
    GRANT SELECT, INSERT, UPDATE ON ${database}.purchases TO 'europodlahy_app'@'%';
    GRANT SELECT, INSERT ON ${database}.partner_badge_awards TO 'europodlahy_app'@'%';
    GRANT SELECT, INSERT ON ${database}.audit_logs TO 'europodlahy_app'@'%';
    GRANT SELECT, INSERT, UPDATE ON ${database}.company_privacy_drafts TO 'europodlahy_app'@'%';
    GRANT SELECT, INSERT ON ${database}.company_privacy_notices TO 'europodlahy_app'@'%';
    GRANT SELECT, INSERT ON ${database}.company_privacy_receipts TO 'europodlahy_app'@'%';`);
  assert.equal(sql(`SELECT GROUP_CONCAT(PRIVILEGE_TYPE ORDER BY PRIVILEGE_TYPE)
    FROM information_schema.TABLE_PRIVILEGES
    WHERE TABLE_SCHEMA='${database}' AND TABLE_NAME='audit_logs'
      AND GRANTEE=CONCAT(QUOTE('europodlahy_app'),'@',QUOTE('%'));`).trim(), "INSERT,SELECT");
  assert.throws(() => execFileSync("docker", ["compose", "exec", "-T", "db", "bash", "-c",
    `MYSQL_PWD="$DB_APP_PASSWORD" mariadb -ueuropodlahy_app ${database}`],
  { input: "DELETE FROM purchases WHERE id=5;", stdio: ["pipe", "pipe", "pipe"] }));
  const url = (user, password, schema = database) =>
    `mysql://${user}:${encodeURIComponent(password)}@127.0.0.1:3308/${schema}`;
  const badgeCronSecret = randomBytes(32).toString("base64url");
  const env = {
    ...process.env, ...defaults, NODE_ENV: "production", LOCAL_QUICK_LOGIN_ENABLED: "false",
    APP_BASE_URL: "https://partners.example.invalid", AUTH_URL: "http://127.0.0.1:3017",
    AUTH_SECRET: randomBytes(48).toString("base64url"), AUTH_TRUST_HOST: "true",
    TOKEN_ENCRYPTION_KEY: randomBytes(32).toString("hex"),
    DATABASE_URL: url("europodlahy_app", values.DB_APP_PASSWORD),
    MIGRATE_DATABASE_URL: url("europodlahy_migrate", values.DB_MIGRATE_PASSWORD),
    SHADOW_DATABASE_URL: url("europodlahy_migrate", values.DB_MIGRATE_PASSWORD, shadowDatabase),
    TEST_DATABASE_URL: url("europodlahy_migrate", values.DB_MIGRATE_PASSWORD),
    PHASE5A_PASSWORD: password, PHASE5A_TOKEN: tokenValue,
    BADGE_CRON_SECRET: badgeCronSecret, PHASE7_BADGE_CRON_SECRET: badgeCronSecret,
    RATE_LIMIT_LOGIN_PER_MIN: "1000", RATE_LIMIT_PUBLIC_PER_MIN: "1000",
  };
  server = spawn("node", ["node_modules/next/dist/bin/next", "start", "-p", "3017"], { env, stdio: "inherit" });
  for (let attempt = 0; attempt < 60; attempt++) {
    if (server.exitCode !== null) throw new Error("Validation server failed to start.");
    try { if ((await fetch("http://127.0.0.1:3017/login")).ok) break; } catch {}
    if (attempt === 59) throw new Error("Validation server did not respond.");
    await new Promise((resolve) => setTimeout(resolve, 500));
  }
  const child = spawn("node", ["--import", "tsx", "--test", "tests/phase5a.test.ts"], {
    env: { ...env, DATABASE_URL: env.TEST_DATABASE_URL }, stdio: "inherit",
  });
  const result = await new Promise((resolve) => child.once("exit", resolve));
  assert.equal(result, 0, "Phase 5A regression tests failed.");
  const tokenLifecycle = spawn("node", ["--import", "tsx", "--test", "tests/token-lifecycle-acceptance.test.ts"], {
    env: { ...env, DATABASE_URL: env.TEST_DATABASE_URL }, stdio: "inherit",
  });
  const tokenLifecycleResult = await new Promise((resolve) => tokenLifecycle.once("exit", resolve));
  assert.equal(tokenLifecycleResult, 0, "QR/NFC lifecycle acceptance tests failed.");
  if (process.env.ACCEPTANCE_PRIVACY === "1") {
    const privacy = spawn("node", ["--import", "tsx", "--test", "tests/privacy-acceptance.test.ts"], {
      env: { ...env, DATABASE_URL: env.TEST_DATABASE_URL }, stdio: "inherit",
    });
    const privacyResult = await new Promise((resolve) => privacy.once("exit", resolve));
    assert.equal(privacyResult, 0, "Privacy notice and receipt acceptance tests failed.");
  }
  if (process.env.ACCEPTANCE_LOGO === "1") {
    const logo = spawn("node", ["--import", "tsx", "--test", "tests/logo-acceptance.test.ts"], {
      env: { ...env, DATABASE_URL: env.TEST_DATABASE_URL }, stdio: "inherit",
    });
    const logoResult = await new Promise((resolve) => logo.once("exit", resolve));
    assert.equal(logoResult, 0, "Company logo acceptance tests failed.");
  }
  if (process.env.ACCEPTANCE_PHASE11 === "1") {
    const phase11 = spawn("node", ["--import", "tsx", "--test", "tests/phase11-http.test.ts"], {
      env: { ...env, DATABASE_URL: env.TEST_DATABASE_URL }, stdio: "inherit",
    });
    const phase11Result = await new Promise((resolve) => phase11.once("exit", resolve));
    assert.equal(phase11Result, 0, "Phase 11 HTTP/DB acceptance tests failed.");
  }
  if (process.env.ACCEPTANCE_EXPORTS === "1") {
    const exports = spawn("node", ["--import", "tsx", "--test", "tests/exports-acceptance.test.ts"], {
      env: { ...env, DATABASE_URL: env.TEST_DATABASE_URL }, stdio: "inherit",
    });
    const exportResult = await new Promise((resolve) => exports.once("exit", resolve));
    assert.equal(exportResult, 0, "CSV export acceptance tests failed.");
  }
  if (process.env.ACCEPTANCE_BROWSER === "1") {
    const browser = spawn("node", ["--import", "tsx", "--test", "tests/browser-acceptance.test.ts"], {
      env: { ...env, DATABASE_URL: env.TEST_DATABASE_URL }, stdio: "inherit",
    });
    const browserResult = await new Promise((resolve) => browser.once("exit", resolve));
    assert.equal(browserResult, 0, "Browser acceptance tests failed.");
  }
  server.kill("SIGTERM");
  await new Promise((resolve) => server.once("exit", resolve));
  sql(`DROP DATABASE ${database}; CREATE DATABASE ${database} CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;`, false);
  const deploy = spawnSync("npm", ["run", "db:deploy"], {
    env: { ...env, DATABASE_URL: env.TEST_DATABASE_URL }, encoding: "utf8",
  });
  if (deploy.status !== 0) console.error(deploy.stdout, deploy.stderr);
  assert.equal(deploy.status, 0, "Prisma migrate deploy must succeed on a fresh isolated database.");
  const diff = spawnSync("node", ["node_modules/prisma/build/index.js", "migrate", "diff",
    "--from-schema-datasource", "prisma/schema.prisma", "--to-schema-datamodel", "prisma/schema.prisma",
    "--exit-code"], { env: { ...env, DATABASE_URL: env.TEST_DATABASE_URL }, encoding: "utf8" });
  if (diff.status !== 0 && diff.stdout) console.info(diff.stdout);
  assert.equal(diff.status, 0, "Deployed migration must match the Prisma schema.");
  const seedEnv = { ...env, DATABASE_URL: env.TEST_DATABASE_URL, NODE_ENV: "development",
    SEED_ADMIN_EMAIL: "seed.admin@example.test", SEED_ADMIN_PASSWORD: password,
    SEED_SELLER_EMAIL: "seed.seller@example.test", SEED_SELLER_PASSWORD: password,
    SEED_SUPERADMIN_EMAIL: "seed.superadmin@example.test", SEED_SUPERADMIN_PASSWORD: password,
  };
  for (let repeat = 0; repeat < 2; repeat++) {
    const seed = spawnSync("npm", ["run", "db:seed"], { env: seedEnv, encoding: "utf8" });
    assert.equal(seed.status, 0, "Safe two-company development seed must succeed and be repeatable.");
  }
  assert.equal(sql("SELECT COUNT(*) FROM companies;").trim(), "2");
  assert.equal(sql("SELECT COUNT(*) FROM users WHERE role='superadmin' AND company_id IS NULL;").trim(), "1");
  assert.equal(sql("SELECT COUNT(*) FROM partner_tokens;").trim(), "4");
  console.info("Repeatable two-company seed and separate superadmin bootstrap passed.");
  console.info("Fresh Prisma migrate deploy and schema drift check passed.");
  console.info("MariaDB migration preservation, immutable audit and phase 5A regressions passed.");
} finally {
  if (server && server.exitCode === null) {
    server.kill("SIGTERM");
    await new Promise((resolve) => server.once("exit", resolve));
  }
  if (created) {
    const tables = sql(`SELECT DISTINCT TABLE_NAME FROM information_schema.TABLE_PRIVILEGES
      WHERE TABLE_SCHEMA='${database}' AND GRANTEE=CONCAT(QUOTE('europodlahy_app'),'@',QUOTE('%'));`, false)
      .trim().split("\n").filter(Boolean);
    for (const table of tables) {
      assert.ok(["companies", "users", "partners", "partner_tokens", "purchases", "partner_badge_awards", "audit_logs",
        "company_privacy_drafts", "company_privacy_notices", "company_privacy_receipts"].includes(table));
      sql(`REVOKE ALL PRIVILEGES ON ${database}.${table} FROM 'europodlahy_app'@'%';`, false);
    }
    sql(`REVOKE ALL PRIVILEGES ON ${database}.* FROM 'europodlahy_migrate'@'%'; DROP DATABASE ${database};`, false);
    if (shadowCreated) {
      sql(`REVOKE ALL PRIVILEGES ON ${shadowDatabase}.* FROM 'europodlahy_migrate'@'%'; DROP DATABASE ${shadowDatabase};`, false);
    }
    console.info("Isolated validation database removed; development/test databases untouched.");
  }
}
