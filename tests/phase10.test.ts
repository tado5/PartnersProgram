import assert from "node:assert/strict";
import { test } from "node:test";

import { decimalCell, formatCsvDate, serializeCsv } from "../src/lib/csv";

test("CSV exports use UTF-8 BOM, semicolons, CRLF and RFC-style quote escaping", () => {
  const csv = serializeCsv([
    ["Názov", "Poznámka", "Suma"],
    ['Podlaha; "premium"', "riadok 1\r\nriadok 2", decimalCell("1234.50")],
  ]);

  assert.equal(
    csv,
    '\uFEFFNázov;Poznámka;Suma\r\n"Podlaha; ""premium""";"riadok 1\r\nriadok 2";1234,50\r\n',
  );
});

test("formula-like untrusted strings are protected while typed numbers and decimals remain numeric", () => {
  const csv = serializeCsv([[
    "=1+1",
    "+cmd",
    "-untrusted",
    "@SUM(A1:A2)",
    " \t=HYPERLINK(\"https://example.test\")",
    "\tmalformed",
    "\rmalformed",
    -12,
    -12.5,
    decimalCell("-12.34"),
  ]]);

  assert.equal(
    csv,
    '\uFEFF\'=1+1;\'+cmd;\'-untrusted;\'@SUM(A1:A2);"\' \t=HYPERLINK(""https://example.test"")";\'\tmalformed;"\'\rmalformed";-12;-12,5;-12,34\r\n',
  );
});

test("date values are rendered in the requested time zone without seconds", () => {
  assert.equal(
    formatCsvDate(new Date("2026-01-31T23:00:59.000Z"), "Europe/Bratislava"),
    "01.02.2026 00:00",
  );
});
