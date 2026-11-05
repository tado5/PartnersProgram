import assert from "node:assert/strict";
import { execFileSync, spawnSync } from "node:child_process";
import { copyFileSync, cpSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, statSync, writeFileSync, chmodSync } from "node:fs";
import { randomBytes } from "node:crypto";
import { createServer } from "node:net";
import { tmpdir } from "node:os";
import { performance } from "node:perf_hooks";
import { join, resolve } from "node:path";
import dotenv from "dotenv";

const root = process.cwd();
const suffix = randomBytes(6).toString("hex");
const project = `partnersprogram-p3-${suffix}`;
const database = `partnersprogram_p3_${suffix}`;
const container = `${project}-db`;
const network = `${project}-internal`;
const workDir = mkdtempSync(join(tmpdir(), `${project}-`));
const rootPasswordFile = join(workDir, "db-root");
const appPasswordFile = join(workDir, "db-app");
const migratePasswordFile = join(workDir, "db-migrate");
const grantScriptFile = join(workDir, "grant-app-privileges.sh");
const encryptionKeyFile = join(workDir, "token-encryption-key");
const keyBackupDir = join(workDir, "separate-key-backup");
const keyRecoveryDir = join(workDir, "key-recovery");
const backupDir = join(workDir, "database-backup");
const backupFile = join(backupDir, "synthetic.sql.gz");
const temporaryConfigFile = join(root, "tests", `.phase3-prisma-${suffix}.config.ts`);
const restoreContainer = `${project}-restore`;
const restoreVolume = `${project}-restore`;
let createdContainer = false;
let createdNetwork = false;
let createdVolume = false;
let exitCode = 0;

for (const [path, content] of [
  [rootPasswordFile, randomBytes(32).toString("hex")],
  [appPasswordFile, randomBytes(32).toString("hex")],
  [migratePasswordFile, randomBytes(32).toString("hex")],
  [encryptionKeyFile, randomBytes(32).toString("hex")],
]) {
  writeFileSync(path, `${content}\n`, { mode: 0o600, flag: "wx" });
}
mkdirSync(keyBackupDir, { mode: 0o700 });
mkdirSync(keyRecoveryDir, { mode: 0o700 });
mkdirSync(backupDir, { mode: 0o700 });
const appPassword = readFileSync(appPasswordFile, "utf8").trim();
const migratePassword = readFileSync(migratePasswordFile, "utf8").trim();

function docker(args, options = {}) {
  return execFileSync("docker", args, { stdio: ["pipe", "pipe", "pipe"], ...options });
}

function runSql(sql, user = "root", password = readFileSync(rootPasswordFile, "utf8").trim()) {
  return docker([
    "exec", "-i", "--env", `MYSQL_PWD=${password}`, container,
    "mariadb", "--batch", "--skip-column-names", `--user=${user}`, database,
  ], { input: sql, encoding: "utf8" });
}

function rootSql(sql) {
  return docker([
    "exec", "-i", "--env", `MYSQL_PWD=${readFileSync(rootPasswordFile, "utf8").trim()}`,
    container, "mariadb", "--batch", "--skip-column-names", "--user=root",
  ], { input: sql, encoding: "utf8" });
}

function cli(command, env, allowCodes = [0]) {
  const result = spawnSync("npm", command, { cwd: root, env, encoding: "utf8" });
  if (!allowCodes.includes(result.status)) {
    throw new Error(`${command.join(" ")} failed (${result.status}): ${result.stderr || result.stdout}`);
  }
  return result;
}

function prisma(args, env, allowCodes = [0]) {
  const result = spawnSync("node", ["node_modules/prisma/build/index.js", ...args], {
    cwd: root, env, encoding: "utf8",
  });
  if (!allowCodes.includes(result.status)) {
    throw new Error(`prisma ${args.join(" ")} failed (${result.status}): ${result.stderr || result.stdout}`);
  }
  return result;
}

function assertNoResource(kind, name) {
  const result = spawnSync("docker", [kind, "inspect", name], { stdio: "ignore" });
  assert.notEqual(result.status, 0, `Refusing to reuse existing ${kind}: ${name}`);
}

function verifyExpectedAppGrants() {
  const grantRows = runSql(`
    SELECT CONCAT(TABLE_NAME, ':', GROUP_CONCAT(PRIVILEGE_TYPE ORDER BY PRIVILEGE_TYPE))
    FROM information_schema.TABLE_PRIVILEGES
    WHERE TABLE_SCHEMA='${database}'
      AND GRANTEE=CONCAT(QUOTE('europodlahy_app'),'@',QUOTE('%'))
    GROUP BY TABLE_NAME ORDER BY TABLE_NAME;
  `).trim().split("\n");
  const expected = [
    "audit_logs:INSERT,SELECT",
    "companies:INSERT,SELECT,UPDATE",
    "company_privacy_drafts:INSERT,SELECT,UPDATE",
    "company_privacy_notices:INSERT,SELECT",
    "company_privacy_receipts:INSERT,SELECT",
    "partner_badge_awards:INSERT,SELECT",
    "partner_tokens:INSERT,SELECT,UPDATE",
    "partners:INSERT,SELECT,UPDATE",
    "purchases:INSERT,SELECT,UPDATE",
    "users:INSERT,SELECT,UPDATE",
  ];
  assert.deepEqual(grantRows.sort(), expected.sort(), "effective app table grants must exactly match the grant script");
  assert.equal(runSql(`
    SELECT COUNT(*) FROM information_schema.SCHEMA_PRIVILEGES
    WHERE TABLE_SCHEMA='${database}'
      AND GRANTEE=CONCAT(QUOTE('europodlahy_app'),'@',QUOTE('%'));
  `).trim(), "0", "app user must have no database-wide grants");
  assert.equal(runSql(`
    SELECT COUNT(*) FROM information_schema.USER_PRIVILEGES
    WHERE GRANTEE=CONCAT(QUOTE('europodlahy_app'),'@',QUOTE('%'))
      AND PRIVILEGE_TYPE <> 'USAGE';
  `).trim(), "0", "app user must have no global privileges beyond MariaDB's implicit USAGE");
  console.info("Effective application grants match all 10 expected table-level grant sets; no schema/global grants.");
}

function verifyMigrationGrants() {
  const grantee = "europodlahy_migrate";
  assert.ok(Number(runSql(`
    SELECT COUNT(*) FROM information_schema.SCHEMA_PRIVILEGES
    WHERE TABLE_SCHEMA='${database}'
      AND GRANTEE=CONCAT(QUOTE('${grantee}'),'@',QUOTE('%'));
  `).trim()) > 0, "migration account must have database-scoped DDL/DML privileges");
  assert.equal(runSql(`
    SELECT COUNT(*) FROM information_schema.SCHEMA_PRIVILEGES
    WHERE GRANTEE=CONCAT(QUOTE('${grantee}'),'@',QUOTE('%'))
      AND TABLE_SCHEMA <> '${database}';
  `).trim(), "0", "migration account must not have grants on other databases");
  assert.equal(runSql(`
    SELECT COUNT(*) FROM information_schema.TABLE_PRIVILEGES
    WHERE GRANTEE=CONCAT(QUOTE('${grantee}'),'@',QUOTE('%'));
  `).trim(), "0", "migration account uses database scope, not extra table grants");
  assert.equal(runSql(`
    SELECT COUNT(*) FROM information_schema.USER_PRIVILEGES
    WHERE GRANTEE=CONCAT(QUOTE('${grantee}'),'@',QUOTE('%'))
      AND PRIVILEGE_TYPE <> 'USAGE';
  `).trim(), "0", "migration account must not have global privileges");
  console.info("Migration account has database-scoped grants only; no other-schema or global privileges.");
}

function verifyAppDenials() {
  const deniedStatements = [
    "DELETE FROM purchases WHERE 1=0;",
    "UPDATE audit_logs SET reason='denied' WHERE 1=0;",
    "DELETE FROM company_privacy_notices WHERE 1=0;",
    "UPDATE company_privacy_receipts SET reason='denied' WHERE 1=0;",
    "CREATE TABLE p3_app_must_not_ddl (id INT);",
  ];
  for (const statement of deniedStatements) {
    const result = spawnSync("docker", [
      "exec", "-i", "--env", `MYSQL_PWD=${appPassword}`, container,
      "mariadb", "--batch", "--skip-column-names", "--user=europodlahy_app", database,
    ], { input: statement, encoding: "utf8", stdio: ["pipe", "pipe", "pipe"] });
    assert.notEqual(result.status, 0, `app user unexpectedly ran: ${statement}`);
  }
  console.info("App user is denied delete, immutable-history mutation, and DDL operations.");
}

function verifyMigrationLedger(ledgerEnv) {
  const ledgerDatabase = `partnersprogram_p3_ledger_${suffix}`;
  const retryDatabase = `partnersprogram_p3_retry_${suffix}`;
  rootSql(`
    CREATE DATABASE ${ledgerDatabase};
    CREATE DATABASE ${retryDatabase};
    GRANT ALL PRIVILEGES ON ${ledgerDatabase}.* TO 'europodlahy_migrate'@'%';
    GRANT ALL PRIVILEGES ON ${retryDatabase}.* TO 'europodlahy_migrate'@'%';
  `);

  const migrationRoot = join(workDir, "migration-ledger-project");
  const migrationDir = join(migrationRoot, "migrations");
  const schemaFile = join(migrationRoot, "schema.prisma");
  cpSync(resolve(root, "prisma/migrations"), migrationDir, { recursive: true });
  copyFileSync(resolve(root, "prisma/schema.prisma"), schemaFile);
  const names = readFileSync(join(migrationDir, "migration_lock.toml"), "utf8");
  assert.match(names, /provider\s*=\s*"mysql"/);
  const migrationNames = readdirSync(migrationDir)
    .filter((name) => /^\d{14}_/.test(name))
    .sort();
  assert.equal(migrationNames.length, 11);
  const failedMigration = migrationNames.at(-1);
  assert.ok(failedMigration);
  const failedSqlFile = join(migrationDir, failedMigration, "migration.sql");
  const originalSql = readFileSync(failedSqlFile, "utf8");
  writeFileSync(failedSqlFile, `${originalSql}\nTHIS IS AN INTENTIONALLY INVALID STATEMENT;\n`);

  writeFileSync(temporaryConfigFile, `
    import { defineConfig, env } from "prisma/config";
    export default defineConfig({
      schema: ${JSON.stringify(schemaFile)},
      migrations: { path: ${JSON.stringify(migrationDir)} },
      datasource: { url: env("MIGRATE_DATABASE_URL") },
    });
  `, { mode: 0o600, flag: "wx" });

  const ledgerUrl = ledgerEnv.MIGRATE_DATABASE_URL.replace(`/${database}`, `/${ledgerDatabase}`);
  const isolatedLedgerEnv = {
    ...ledgerEnv,
    DATABASE_URL: ledgerUrl,
    MIGRATE_DATABASE_URL: ledgerUrl,
  };
  const firstDeploy = prisma(["migrate", "deploy", "--config", temporaryConfigFile], isolatedLedgerEnv, [1]);
  assert.notEqual(firstDeploy.status, 0, "deliberately invalid temporary migration must fail");
  const failedRow = rootSql(`
    SELECT CONCAT(migration_name, '|', COUNT(*), '|',
      SUM(finished_at IS NULL AND rolled_back_at IS NULL))
    FROM ${ledgerDatabase}._prisma_migrations
    WHERE migration_name='${failedMigration}';
  `).trim();
  assert.equal(failedRow, `${failedMigration}|1|1`, "Prisma must record one unresolved failed attempt");
  const completedBeforeRepair = rootSql(`
    SELECT COUNT(*) FROM ${ledgerDatabase}._prisma_migrations
    WHERE finished_at IS NOT NULL AND rolled_back_at IS NULL;
  `).trim();
  assert.equal(completedBeforeRepair, "10");

  const tokenColumns = rootSql(`
    SELECT COUNT(*) FROM information_schema.COLUMNS
    WHERE TABLE_SCHEMA='${ledgerDatabase}' AND TABLE_NAME='partner_tokens'
      AND COLUMN_NAME IN ('token_encrypted', 'active_type');
  `).trim();
  const tokenTriggers = rootSql(`
    SELECT COUNT(*) FROM information_schema.TRIGGERS
    WHERE TRIGGER_SCHEMA='${ledgerDatabase}'
      AND TRIGGER_NAME IN ('partner_tokens_active_type_insert', 'partner_tokens_active_type_update');
  `).trim();
  assert.equal(tokenColumns, "2", "failed migration left its earlier DDL statements applied");
  assert.equal(tokenTriggers, "2", "failed migration left its earlier trigger DDL applied");
  prisma(["migrate", "resolve", "--applied", failedMigration, "--config", temporaryConfigFile], isolatedLedgerEnv);
  const appliedRecovery = prisma(["migrate", "deploy", "--config", temporaryConfigFile], isolatedLedgerEnv);
  assert.match(appliedRecovery.stdout, /No pending migrations to apply/);
  assert.equal(rootSql(`
    SELECT COUNT(*) FROM ${ledgerDatabase}._prisma_migrations
    WHERE finished_at IS NOT NULL AND rolled_back_at IS NULL;
  `).trim(), "11");

  const retryUrl = ledgerEnv.MIGRATE_DATABASE_URL.replace(`/${database}`, `/${retryDatabase}`);
  const cleanRetryEnv = {
    ...ledgerEnv,
    DATABASE_URL: retryUrl,
    MIGRATE_DATABASE_URL: retryUrl,
  };
  writeFileSync(failedSqlFile, "THIS IS AN INTENTIONALLY INVALID FIRST STATEMENT;\n");
  const cleanFailure = prisma(["migrate", "deploy", "--config", temporaryConfigFile], cleanRetryEnv, [1]);
  assert.notEqual(cleanFailure.status, 0);
  assert.equal(rootSql(`
    SELECT COUNT(*) FROM information_schema.COLUMNS
    WHERE TABLE_SCHEMA='${retryDatabase}' AND TABLE_NAME='partner_tokens'
      AND COLUMN_NAME IN ('token_encrypted', 'active_type');
  `).trim(), "0", "the clean failed attempt must precede all migration DDL");
  prisma(["migrate", "resolve", "--rolled-back", failedMigration, "--config", temporaryConfigFile], cleanRetryEnv);
  writeFileSync(failedSqlFile, originalSql);
  const resumed = prisma(["migrate", "deploy", "--config", temporaryConfigFile], cleanRetryEnv);
  assert.match(resumed.stdout, /11 migrations? applied|Applying migration/);
  assert.equal(rootSql(`
    SELECT COUNT(*) FROM ${retryDatabase}._prisma_migrations
    WHERE finished_at IS NOT NULL AND rolled_back_at IS NULL;
  `).trim(), "11");
  assert.equal(rootSql(`
    SELECT COUNT(*) FROM ${retryDatabase}._prisma_migrations
    WHERE migration_name='${failedMigration}' AND rolled_back_at IS NOT NULL;
  `).trim(), "1");
  assert.equal(rootSql(`SELECT COUNT(*) FROM ${retryDatabase}._prisma_migrations;`).trim(), "12");
  console.info("Prisma bookkeeping verified partial-DDL failure and applied-resolution, plus clean failure, rolled-back resolution and retry from a temporary migration copy.");
}

function queryForRestore(containerName, sql, databaseName = database) {
  const command = [
    "exec", "--interactive", "--env", `MYSQL_PWD=${readFileSync(rootPasswordFile, "utf8").trim()}`,
    containerName, "mariadb", "--batch", "--skip-column-names", "--user=root",
  ];
  if (databaseName) command.push(databaseName);
  return execFileSync("docker", [
    ...command,
  ], { input: sql, encoding: "utf8" }).trim();
}

async function main() {
  assertNoResource("container", container);
  assertNoResource("network", network);
  assertNoResource("container", restoreContainer);
  assertNoResource("volume", restoreVolume);

  const originalGrantScript = readFileSync(resolve(root, "docker/mariadb/grant-app-privileges.sh"), "utf8");
  assert.equal([...originalGrantScript.matchAll(/^\s*GRANT\b/gm)].length, 10);
  writeFileSync(grantScriptFile, originalGrantScript.replaceAll("europodlahy.", `${database}.`), { mode: 0o600 });
  const portProbe = createServer();
  await new Promise((resolvePromise, reject) => {
    portProbe.once("error", reject);
    portProbe.listen(0, "127.0.0.1", resolvePromise);
  });
  const hostPort = portProbe.address().port;
  await new Promise((resolvePromise, reject) => portProbe.close((error) => error ? reject(error) : resolvePromise()));
  docker(["network", "create", network]);
  createdNetwork = true;
  docker([
    "run", "--detach", "--name", container, "--network", network,
    "--publish", `127.0.0.1:${hostPort}:3306`,
    "--env", "MARIADB_DATABASE=europodlahy",
    "--env", "MARIADB_ROOT_PASSWORD_FILE=/run/secrets/db-root",
    "--env", "DB_ROOT_PASSWORD_FILE=/run/secrets/db-root",
    "--mount", `type=bind,source=${rootPasswordFile},target=/run/secrets/db-root,readonly`,
    "--mount", `type=bind,source=${grantScriptFile},target=/docker/grant-app-privileges.sh,readonly`,
    "mariadb:11.4",
  ]);
  createdContainer = true;

  let ready = false;
  for (let attempt = 0; attempt < 90; attempt++) {
    const probe = spawnSync("docker", [
      "exec", container, "healthcheck.sh", "--connect", "--innodb_initialized",
    ], { stdio: "ignore" });
    if (probe.status === 0) {
      ready = true;
      break;
    }
    await new Promise((resolvePromise) => setTimeout(resolvePromise, 1000));
  }
  assert.ok(ready, "isolated MariaDB did not become ready");
  const rootPassword = readFileSync(rootPasswordFile, "utf8").trim();
  const appUrl = `mysql://europodlahy_app:${appPassword}@127.0.0.1:${hostPort}/${database}`;
  const migrateUrl = `mysql://europodlahy_migrate:${migratePassword}@127.0.0.1:${hostPort}/${database}`;
  const observerUrl = `mysql://root:${rootPassword}@127.0.0.1:${hostPort}/${database}`;
  const testEnv = {
    ...process.env,
    ...dotenv.parse(readFileSync(".env.example")),
    NODE_ENV: "test",
    DATABASE_URL: appUrl,
    MIGRATE_DATABASE_URL: migrateUrl,
    SHADOW_DATABASE_URL: `mysql://europodlahy_migrate:${migratePassword}@127.0.0.1:${hostPort}/shadow_unused`,
    TEST_DATABASE_URL: appUrl,
    P3_OBSERVER_DATABASE_URL: observerUrl,
    AUTH_SECRET: randomBytes(32).toString("base64url"),
    TOKEN_ENCRYPTION_KEY: readFileSync(encryptionKeyFile, "utf8").trim(),
    P3_ACCEPTANCE_DATABASE: database,
  };

  const appPasswordSql = appPassword.replaceAll("\\", "\\\\").replaceAll("'", "''");
  const migratePasswordSql = migratePassword.replaceAll("\\", "\\\\").replaceAll("'", "''");
  rootSql(`
    CREATE DATABASE ${database};
    CREATE USER 'europodlahy_app'@'%' IDENTIFIED BY '${appPasswordSql}';
    CREATE USER 'europodlahy_migrate'@'%' IDENTIFIED BY '${migratePasswordSql}';
    GRANT ALL PRIVILEGES ON ${database}.* TO 'europodlahy_migrate'@'%';
  `);
  const migrationStarted = performance.now();
  cli(["run", "db:deploy"], testEnv);
  const migrationDurationMs = Math.round(performance.now() - migrationStarted);
  const migrationCount = runSql(`
    SELECT COUNT(*) FROM _prisma_migrations WHERE finished_at IS NOT NULL AND rolled_back_at IS NULL;
  `).trim();
  assert.equal(migrationCount, "11");
  const deployAgain = cli(["run", "db:deploy"], testEnv);
  assert.match(deployAgain.stdout, /No pending migrations to apply/);
  assert.equal(runSql("SELECT COUNT(*) FROM _prisma_migrations;").trim(), "11");
  const drift = prisma([
    "migrate", "diff",
    "--from-config-datasource",
    "--to-schema", "prisma/schema.prisma",
    "--exit-code",
  ], testEnv);
  assert.equal(drift.status, 0, "deployed database schema must match Prisma schema");
  const objectCounts = runSql(`
    SELECT CONCAT('tables=', COUNT(*)) FROM information_schema.TABLES
      WHERE TABLE_SCHEMA='${database}' AND TABLE_TYPE='BASE TABLE';
    SELECT CONCAT('foreign_keys=', COUNT(*)) FROM information_schema.TABLE_CONSTRAINTS
      WHERE CONSTRAINT_SCHEMA='${database}' AND CONSTRAINT_TYPE='FOREIGN KEY';
    SELECT CONCAT('indexes=', COUNT(*)) FROM (
      SELECT TABLE_NAME, INDEX_NAME FROM information_schema.STATISTICS
      WHERE TABLE_SCHEMA='${database}' GROUP BY TABLE_NAME, INDEX_NAME
    ) AS indexes;
    SELECT CONCAT('checks=', COUNT(*)) FROM information_schema.TABLE_CONSTRAINTS
      WHERE CONSTRAINT_SCHEMA='${database}' AND CONSTRAINT_TYPE='CHECK';
    SELECT CONCAT('triggers=', GROUP_CONCAT(TRIGGER_NAME ORDER BY TRIGGER_NAME SEPARATOR ','))
      FROM information_schema.TRIGGERS WHERE TRIGGER_SCHEMA='${database}';
  `).trim().split("\n");
  assert.deepEqual(objectCounts, [
    "tables=11",
    "foreign_keys=26",
    "indexes=53",
    "checks=27",
    "triggers=audit_logs_before_delete,audit_logs_before_update,company_privacy_notices_no_delete,company_privacy_notices_no_update,company_privacy_receipts_no_delete,company_privacy_receipts_no_update,partner_tokens_active_type_insert,partner_tokens_active_type_update",
  ]);
  console.info(`Prisma migrate deploy applied 11 migrations in ${migrationDurationMs} ms; second deploy was a no-op; parity passed (${objectCounts.join(", ")}).`);

  docker([
    "exec", "--env", "DB_ROOT_PASSWORD_FILE=/run/secrets/db-root",
    container, "bash", "/docker/grant-app-privileges.sh",
  ]);
  verifyExpectedAppGrants();
  verifyMigrationGrants();
  verifyAppDenials();

  const test = spawnSync("node", [
    "--import", "tsx", "--test", "tests/phase3-database.test.ts",
  ], { cwd: root, env: testEnv, encoding: "utf8" });
  if (test.status !== 0) {
    if (test.stdout) process.stdout.write(test.stdout);
    if (test.stderr) process.stderr.write(test.stderr);
    throw new Error("Application concurrency and transaction tests failed.");
  }
  assert.match(`${test.stdout}\n${test.stderr}`, /pass [1-9]\d*/);
  console.info("Application-level concurrency, transaction rollback, and serialized race tests passed.");

  verifyMigrationLedger(testEnv);

  copyFileSync(encryptionKeyFile, join(keyBackupDir, "token-encryption-key"));
  chmodSync(join(keyBackupDir, "token-encryption-key"), 0o600);
  copyFileSync(join(keyBackupDir, "token-encryption-key"), join(keyRecoveryDir, "token-encryption-key"));
  chmodSync(join(keyRecoveryDir, "token-encryption-key"), 0o600);
  assert.equal(
    readFileSync(join(keyRecoveryDir, "token-encryption-key"), "utf8"),
    readFileSync(encryptionKeyFile, "utf8"),
  );
  assert.equal(statSync(keyBackupDir).mode & 0o777, 0o700);
  assert.equal(statSync(join(keyBackupDir, "token-encryption-key")).mode & 0o777, 0o600);
  assert.equal(statSync(keyRecoveryDir).mode & 0o777, 0o700);
  assert.equal(statSync(join(keyRecoveryDir, "token-encryption-key")).mode & 0o777, 0o600);

  const tokenIdentity = runSql(`
    SELECT CONCAT(company_id, '|', partner_id, '|', type, '|', token_hash, '|', token_encrypted)
    FROM partner_tokens WHERE token_encrypted IS NOT NULL LIMIT 1;
  `).trim().split("|");
  assert.equal(tokenIdentity.length, 5);
  const purchaseSnapshot = runSql(`
    SELECT CONCAT(company_id, '|', partner_id, '|', amount, '|', net_amount, '|',
      vat_rate_percent, '|', points, '|', partner_present, '|', source, '|',
      is_deleted, '|', idempotency_key)
    FROM purchases ORDER BY id;
  `).trim();
  const auditSnapshot = runSql(`
    SELECT GROUP_CONCAT(action ORDER BY id SEPARATOR ',') FROM audit_logs;
  `).trim();
  const migrationSnapshot = runSql(`
    SELECT GROUP_CONCAT(migration_name ORDER BY migration_name SEPARATOR ',')
    FROM _prisma_migrations WHERE finished_at IS NOT NULL AND rolled_back_at IS NULL;
  `).trim();
  const rowCountSnapshot = runSql(`
    SELECT CONCAT('companies=', COUNT(*)) FROM companies;
    SELECT CONCAT('users=', COUNT(*)) FROM users;
    SELECT CONCAT('partners=', COUNT(*)) FROM partners;
    SELECT CONCAT('partner_tokens=', COUNT(*)) FROM partner_tokens;
    SELECT CONCAT('purchases=', COUNT(*)) FROM purchases;
    SELECT CONCAT('audit_logs=', COUNT(*)) FROM audit_logs;
    SELECT CONCAT('migration_rows=', COUNT(*)) FROM _prisma_migrations;
  `).trim();

  const backupStarted = performance.now();
  const dump = docker([
    "exec", "--env", `MYSQL_PWD=${rootPassword}`, container,
    "mariadb-dump", "--single-transaction", "--routines", "--events",
    "--triggers", "--hex-blob", "--default-character-set=utf8mb4",
    "--databases", database,
  ], { encoding: "utf8" });
  const gzip = spawnSync("gzip", ["-c"], { input: dump });
  assert.equal(gzip.status, 0);
  writeFileSync(backupFile, gzip.stdout, { mode: 0o600, flag: "wx" });
  execFileSync("gzip", ["-t", backupFile]);
  const backupDurationMs = Math.round(performance.now() - backupStarted);

  const restoreStarted = performance.now();
  docker(["volume", "create", restoreVolume]);
  createdVolume = true;
  docker([
    "run", "--detach", "--name", restoreContainer, "--network", "none",
    "--env", "MARIADB_DATABASE=europodlahy",
    "--env", "MARIADB_ROOT_PASSWORD_FILE=/run/secrets/db-root",
    "--env", "DB_ROOT_PASSWORD_FILE=/run/secrets/db-root",
    "--mount", `type=bind,source=${rootPasswordFile},target=/run/secrets/db-root,readonly`,
    "--mount", `type=volume,source=${restoreVolume},target=/var/lib/mysql`,
    "mariadb:11.4",
  ]);
  let restoreReady = false;
  for (let attempt = 0; attempt < 90; attempt++) {
    const probe = spawnSync("docker", [
      "exec", restoreContainer, "healthcheck.sh", "--connect", "--innodb_initialized",
    ], { stdio: "ignore" });
    if (probe.status === 0) {
      restoreReady = true;
      break;
    }
    await new Promise((resolvePromise) => setTimeout(resolvePromise, 1000));
  }
  assert.ok(restoreReady, "isolated restore DB did not become ready");
  const sqlDump = execFileSync("gzip", ["-dc", backupFile]);
  docker([
    "exec", "--interactive", restoreContainer, "bash", "-ec",
    'root_password="$(cat /run/secrets/db-root)"; MYSQL_PWD="$root_password" exec mariadb -uroot',
  ], { input: sqlDump });

  const restoredDatabaseList = queryForRestore(restoreContainer, "SHOW DATABASES;", "");
  const restoredTableList = queryForRestore(restoreContainer, "SHOW TABLES;");
  assert.notEqual(
    restoredTableList,
    "",
    `restored MariaDB database must contain tables (databases: ${restoredDatabaseList})`,
  );
  const restoredCounts = queryForRestore(restoreContainer, `
    SELECT CONCAT('companies=', COUNT(*)) FROM companies;
    SELECT CONCAT('users=', COUNT(*)) FROM users;
    SELECT CONCAT('partners=', COUNT(*)) FROM partners;
    SELECT CONCAT('partner_tokens=', COUNT(*)) FROM partner_tokens;
    SELECT CONCAT('purchases=', COUNT(*)) FROM purchases;
    SELECT CONCAT('audit_logs=', COUNT(*)) FROM audit_logs;
    SELECT CONCAT('migration_rows=', COUNT(*)) FROM _prisma_migrations;
  `).split("\n");
  assert.deepEqual(restoredCounts, rowCountSnapshot.split("\n"));
  assert.equal(queryForRestore(restoreContainer, `
    SELECT CONCAT(company_id, '|', partner_id, '|', amount, '|', net_amount, '|',
      vat_rate_percent, '|', points, '|', partner_present, '|', source, '|',
      is_deleted, '|', idempotency_key)
    FROM purchases ORDER BY id;
  `), purchaseSnapshot, "restored purchase money, points, source and lifecycle must match");
  assert.equal(queryForRestore(restoreContainer, `
    SELECT GROUP_CONCAT(action ORDER BY id SEPARATOR ',') FROM audit_logs;
  `), auditSnapshot, "restored audit actions must match");
  assert.equal(queryForRestore(restoreContainer, `
    SELECT GROUP_CONCAT(migration_name ORDER BY migration_name SEPARATOR ',')
    FROM _prisma_migrations WHERE finished_at IS NOT NULL AND rolled_back_at IS NULL;
  `), migrationSnapshot, "restored migration history must match");
  const restoredToken = queryForRestore(restoreContainer, `
    SELECT CONCAT(company_id, '|', partner_id, '|', type, '|', token_hash, '|', token_encrypted)
    FROM partner_tokens WHERE token_encrypted IS NOT NULL LIMIT 1;
  `).split("|");
  assert.deepEqual(restoredToken, tokenIdentity);
  const recoveredKey = readFileSync(join(keyRecoveryDir, "token-encryption-key"), "utf8").trim();
  const decryptTest = spawnSync("node", [
    "--import", "tsx", "-e",
    `const { decryptToken } = require("./src/server/token-crypto.ts");
     const { createHash } = require("node:crypto");
     const [companyId, partnerId, type, tokenHash, envelope] = process.env.P3_RESTORED_TOKEN.split("|");
     const value = decryptToken(envelope, { companyId: BigInt(companyId), partnerId: BigInt(partnerId), type, tokenHash }, process.env.P3_RECOVERED_KEY);
     if (createHash("sha256").update(value).digest("hex") !== tokenHash) process.exit(1);
     console.log("Restored synthetic token decrypted with separately recovered key.");`,
  ], {
    cwd: root,
    env: { ...process.env, P3_RESTORED_TOKEN: restoredToken.join("|"), P3_RECOVERED_KEY: recoveredKey },
    encoding: "utf8",
  });
  assert.equal(decryptTest.status, 0, decryptTest.stderr);
  process.stdout.write(decryptTest.stdout);
  const restoreDurationMs = Math.round(performance.now() - restoreStarted);
  console.info(`Synthetic compressed backup took ${backupDurationMs} ms; populated isolated restore plus key recovery took ${restoreDurationMs} ms.`);
  console.info("Populated backup restored: row counts and migration history matched; separate key recovery decrypted the restored synthetic envelope.");

  console.info("P3 isolated DB migration, grants, app concurrency, transaction rollback, populated restore and separate key recovery checks passed.");
}

try {
  await main();
} catch (error) {
  let message = error instanceof Error ? error.message : "Phase 3 isolated database verification failed.";
  for (const secret of [
    readFileSync(rootPasswordFile, "utf8").trim(),
    readFileSync(appPasswordFile, "utf8").trim(),
    readFileSync(migratePasswordFile, "utf8").trim(),
    readFileSync(encryptionKeyFile, "utf8").trim(),
  ]) {
    if (secret) message = message.replaceAll(secret, "[redacted]");
  }
  message = message.replace(/mysql:\/\/[^:\s]+:[^@\s]+@/g, "mysql://[redacted]@");
  console.error(message);
  exitCode = 1;
} finally {
  rmSync(temporaryConfigFile, { force: true });
  if (createdContainer) spawnSync("docker", ["rm", "--force", container], { stdio: "ignore" });
  if (spawnSync("docker", ["container", "inspect", restoreContainer], { stdio: "ignore" }).status === 0) {
    spawnSync("docker", ["rm", "--force", restoreContainer], { stdio: "ignore" });
  }
  if (createdVolume) spawnSync("docker", ["volume", "rm", restoreVolume], { stdio: "ignore" });
  if (createdNetwork) spawnSync("docker", ["network", "rm", network], { stdio: "ignore" });
  rmSync(workDir, { recursive: true, force: true });
  for (const [kind, name] of [
    ["container", container],
    ["container", restoreContainer],
    ["network", network],
    ["volume", restoreVolume],
  ]) {
    if (spawnSync("docker", [kind, "inspect", name], { stdio: "ignore" }).status === 0) {
      console.error(`Isolated ${kind} cleanup failed: ${name}`);
      exitCode = 1;
    }
  }
}
process.exitCode = exitCode;
