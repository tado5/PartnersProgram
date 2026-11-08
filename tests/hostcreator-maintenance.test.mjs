import assert from "node:assert/strict";
import { parse } from "dotenv";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { configureEncryption, selectSurvivors } from "../scripts/hostcreator-maintenance-lib.mjs";

test("reset identities are unambiguous and preserve only the requested active global superadmin and company", () => {
  const users = [{ id: 1n, role: "superadmin", company_id: null, is_active: 1 }];
  const companies = [{ id: 2n, name: "TestFirma ABC", is_active: 1 }];
  assert.deepEqual(selectSurvivors(users, companies), { userId: 1n, companyId: 2n });
  assert.deepEqual(selectSurvivors(users, [{ ...companies[0], name: "testfirmaAbc" }]), { userId: 1n, companyId: 2n });
  for (const [u, c] of [[[], companies], [[...users, ...users], companies], [users, [...companies, ...companies]], [users, []]]) {
    assert.throws(() => selectSurvivors(u, c), /exactly one/);
  }
});

test("configuration generates one stable server key and refuses to lose encrypted tokens", async () => {
  const directory = await mkdtemp(join(tmpdir(), "partners-maintenance-config-"));
  const root = join(directory, "release");
  const shared = join(directory, "shared");
  try {
    await mkdir(join(root, ".next/standalone"), { recursive: true });
    await mkdir(shared);
    await writeFile(join(shared, ".env"), "DATABASE_URL=mysql://synthetic\nTOKEN_ENCRYPTION_KEY=\n");
    const connection = { query: async () => [{ total: 0n }] };
    await configureEncryption(connection, root, parse);
    const first = await readFile(join(shared, ".env"), "utf8");
    assert.match(parse(first).TOKEN_ENCRYPTION_KEY, /^[a-f0-9]{64}$/);
    await configureEncryption(connection, root, parse);
    assert.equal(parse(await readFile(join(shared, ".env"), "utf8")).TOKEN_ENCRYPTION_KEY, parse(first).TOKEN_ENCRYPTION_KEY);
    assert.equal(await readFile(join(root, ".next/standalone/.env"), "utf8"), await readFile(join(shared, ".env"), "utf8"));
    await writeFile(join(shared, ".env"), "TOKEN_ENCRYPTION_KEY=\n");
    await assert.rejects(configureEncryption({ query: async () => [{ total: 1n }] }, root, parse), /original key/);
    assert.equal(await readFile(join(shared, ".env"), "utf8"), "TOKEN_ENCRYPTION_KEY=\n");
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});
