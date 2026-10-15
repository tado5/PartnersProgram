import assert from "node:assert/strict";
import { test } from "node:test";

import { publicAuditFields, publicAuditValues, sanitizeAuditValues } from "../src/lib/audit";

test("audit write sanitization removes credentials and masks private contact values", () => {
  const safe = sanitizeAuditValues({
    displayName: "Partner",
    email: "partner@example.test",
    phone: "+421900000000",
    internalNote: "Citlivá poznámka",
    passwordHash: "hash",
    accessToken: "access-token",
    fullToken: "full-token",
    nested: { token: "full-token", tokenHint: "abcdef", password: "secret" },
  });

  assert.deepEqual(safe, {
    displayName: "Partner",
    email: "Skryté",
    phone: "Skryté",
    internalNote: "Skryté",
    nested: { tokenHint: "abcdef" },
  });
});

test("audit display exposes only labelled fields and never returns secret values", () => {
  const values = {
    amount: "125.00",
    note: "Private purchase note",
    password: "secret",
    tokenHash: "hash",
    arbitraryField: "unexpected",
  };

  assert.deepEqual(publicAuditFields(values), [
    { key: "amount", label: "Suma s DPH", value: "125.00" },
    { key: "note", label: "Poznámka", value: "Skryté" },
  ]);
  assert.deepEqual(publicAuditValues(values), {
    amount: "125.00",
    note: "Skryté",
  });

});

test("export audit details expose counts and safe filters without arbitrary nested values", () => {
  const values = {
    type: "partners", rowCount: 12,
    filters: { type: "installer", q: "Skryté", from: "2026-10-01", token: "secret", arbitraryField: "private" },
  };
  assert.deepEqual(publicAuditValues(values), {
    type: "partners", rowCount: 12,
    filters: '{"type":"installer","q":"Skryté","from":"2026-10-01"}',
  });
  assert.equal(publicAuditFields(values).find((field) => field.key === "rowCount")?.value, "12");
});
