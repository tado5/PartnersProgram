import { randomBytes } from "node:crypto";
import { chmodSync, existsSync, lstatSync, readFileSync, renameSync, unlinkSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";

export const resetId = "20261108-test-reset-superadmin-testfirmaabc";
const emptyTables = [
  "company_privacy_receipts", "company_privacy_notices", "company_privacy_drafts",
  "audit_logs", "purchases", "partner_badge_awards", "partner_tokens", "partners",
];
const deleteTriggers = [
  "audit_logs_before_delete", "company_privacy_notices_no_delete", "company_privacy_receipts_no_delete",
];

export function selectSurvivors(users, companies) {
  const admins = users.filter(user => user.role === "superadmin");
  const matches = companies.filter(company => company.name.replace(/\s/g, "").toLowerCase() === "testfirmaabc");
  if (admins.length !== 1 || !admins[0].is_active || admins[0].company_id !== null || matches.length !== 1 || !matches[0].is_active) {
    throw new Error("Reset requires exactly one active global superadmin and one active TestFirma ABC. Nothing deleted.");
  }
  return { userId: admins[0].id, companyId: matches[0].id };
}

function atomicWrite(path, value) {
  if (existsSync(path) && (!lstatSync(path).isFile() || lstatSync(path).isSymbolicLink())) {
    throw new Error("Refusing to replace non-regular maintenance configuration.");
  }
  const temporary = `${path}.maintenance-${randomBytes(8).toString("hex")}`;
  writeFileSync(temporary, value, { flag: "wx", mode: 0o600 });
  try {
    renameSync(temporary, path);
    chmodSync(path, 0o600);
  } finally {
    if (existsSync(temporary)) unlinkSync(temporary);
  }
}

export async function configureEncryption(connection, root, parse) {
  const path = resolve(root, "../shared/.env");
  let contents = readFileSync(path, "utf8");
  const configuration = parse(contents);
  const key = configuration.TOKEN_ENCRYPTION_KEY;
  if (key && !/^[a-fA-F0-9]{64}$/.test(key)) throw new Error("Existing TOKEN_ENCRYPTION_KEY is invalid; it was not replaced.");
  if (!key) {
    const [row] = await connection.query("SELECT COUNT(*) AS total FROM partner_tokens WHERE token_encrypted IS NOT NULL");
    if (Number(row.total) !== 0) throw new Error("Encrypted tokens already exist. Restore their original key; generating a replacement is forbidden.");
    contents = contents.replace(/^[ \t]*(?:export[ \t]+)?TOKEN_ENCRYPTION_KEY[ \t]*=.*(?:\r?\n|$)/gm, "");
    contents += `\nTOKEN_ENCRYPTION_KEY=${randomBytes(32).toString("hex")}\n`;
  }
  const maintenance = resolve(root, "../shared/.partners-maintenance");
  contents = contents.replace(/^[ \t]*(?:export[ \t]+)?HOSTCREATOR_MAINTENANCE_FILE[ \t]*=.*(?:\r?\n|$)/gm, "");
  contents += `\nHOSTCREATOR_MAINTENANCE_FILE=${JSON.stringify(maintenance)}\n`;
  atomicWrite(path, contents);
  for (const target of [resolve(root, ".env"), resolve(root, ".next/standalone/.env")]) atomicWrite(target, contents);
  console.info(key ? "Existing token encryption key preserved." : "Token encryption key generated on server; its value was not logged.");
}

export async function resetTestData(connection, shared, { approved, activeCapable, verifyMaintenance }) {
  if (!approved) throw new Error("Reset requires HOSTCREATOR_TEST_RESET_APPROVED=yes.");
  const [lock] = await connection.query("SELECT GET_LOCK(?, 10) AS acquired", [resetId]);
  if (Number(lock.acquired) !== 1) throw new Error("Another maintenance operation is running.");
  const gate = resolve(shared, ".partners-maintenance");
  const recovery = resolve(shared, ".partners-reset-triggers.json");
  let lockedTables = false;
  let restored = false;
  let triggerDefinitions = [];
  try {
    if (existsSync(recovery)) triggerDefinitions = JSON.parse(readFileSync(recovery, "utf8"));
    const [done] = await connection.query("SELECT COUNT(*) AS total FROM deployment_operations WHERE id = ?", [resetId]);
    if (Number(done.total) === 1 && !triggerDefinitions.length) {
      console.info("Test reset already completed; no records deleted.");
      return;
    }
    if (!activeCapable) throw new Error("Deploy maintenance support first without reset approval, then repeat deploy with reset approval.");
    const survivors = selectSurvivors(
      await connection.query("SELECT id, role, is_active, company_id FROM users"),
      await connection.query("SELECT id, name, is_active FROM companies"),
    );
    if (!triggerDefinitions.length) {
      for (const name of deleteTriggers) {
        const [definition] = await connection.query(`SHOW CREATE TRIGGER \`${name}\``);
        triggerDefinitions.push({ name, sql: definition["SQL Original Statement"] });
      }
      atomicWrite(recovery, JSON.stringify(triggerDefinitions));
    }
    for (const definition of triggerDefinitions) {
      if (!deleteTriggers.includes(definition.name) || typeof definition.sql !== "string" || !/^CREATE\s/i.test(definition.sql)) {
        throw new Error("Invalid trigger recovery record. Maintenance was not executed.");
      }
    }
    writeFileSync(gate, "Approved test data maintenance\n", { mode: 0o600 });
    if (verifyMaintenance) await verifyMaintenance();
    for (const { name } of triggerDefinitions) await connection.query(`DROP TRIGGER IF EXISTS \`${name}\``);
    await connection.query("SET autocommit = 0");
    await connection.query(`LOCK TABLES ${[...emptyTables, "users", "companies", "deployment_operations"].map(name => `\`${name}\` WRITE`).join(", ")}`);
    lockedTables = true;
    const [completed] = await connection.query("SELECT COUNT(*) AS total FROM deployment_operations WHERE id = ?", [resetId]);
    if (Number(completed.total) === 0) {
      const lockedSurvivors = selectSurvivors(
        await connection.query("SELECT id, role, is_active, company_id FROM users"),
        await connection.query("SELECT id, name, is_active FROM companies"),
      );
      if (String(survivors.userId) !== String(lockedSurvivors.userId) || String(survivors.companyId) !== String(lockedSurvivors.companyId)) {
        throw new Error("Survivor identities changed during maintenance.");
      }
      for (const table of emptyTables) await connection.query(`DELETE FROM \`${table}\``);
      await connection.query("UPDATE companies SET created_by_user_id = NULL WHERE created_by_user_id <> ?", [survivors.userId]);
      await connection.query("DELETE FROM users WHERE id <> ?", [survivors.userId]);
      await connection.query("DELETE FROM companies WHERE id <> ?", [survivors.companyId]);
      await connection.query("INSERT INTO deployment_operations (id) VALUES (?)", [resetId]);
      await connection.commit();
      console.info("Approved reset committed: only original superadmin and TestFirma ABC retained. Password and company settings unchanged.");
    }
  } catch (error) {
    await connection.rollback();
    throw error;
  } finally {
    try {
      if (lockedTables) await connection.query("UNLOCK TABLES");
      await connection.query("SET autocommit = 1");
      for (const { name, sql } of triggerDefinitions) {
        const rows = await connection.query("SELECT TRIGGER_NAME FROM information_schema.TRIGGERS WHERE TRIGGER_SCHEMA = DATABASE() AND TRIGGER_NAME = ?", [name]);
        if (!rows.length) await connection.query(sql);
      }
      restored = true;
      if (existsSync(recovery)) unlinkSync(recovery);
      if (existsSync(gate)) unlinkSync(gate);
    } finally {
      await connection.query("SELECT RELEASE_LOCK(?)", [resetId]);
      if (!restored) console.error("Trigger restoration failed. Maintenance remains enabled; rerun the approved reset to recover.");
    }
  }
}
