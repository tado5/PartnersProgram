import assert from "node:assert/strict";
import { test } from "node:test";

import { parseCalendarMonth } from "../src/lib/dates";

test("monthly report parser accepts YYYY-MM and rejects invalid periods", () => {
  assert.deepEqual(parseCalendarMonth("2026-10"), { year: 2026, month: 10 });
  assert.deepEqual(parseCalendarMonth("0001-01"), { year: 1, month: 1 });
  assert.equal(parseCalendarMonth("2026-13"), null);
  assert.equal(parseCalendarMonth("2026-1"), null);
  assert.equal(parseCalendarMonth("2026-10-01"), null);
  assert.equal(parseCalendarMonth("0000-10"), null);
});

test("period helpers shift months, label periods and list month options", async () => {
  const { monthLabel, monthOptions, periodLabel, shiftMonth } = await import("../src/lib/period");
  assert.equal(shiftMonth("2026-01", -1), "2025-12");
  assert.equal(shiftMonth("2026-12", 1), "2027-01");
  assert.equal(monthLabel("2026-10"), "Október 2026");
  assert.equal(periodLabel({ month: "2026-09", from: "2026-09-01", to: "2026-09-30" }), "September 2026");
  assert.equal(periodLabel({ month: null, from: "2026-09-15", to: "2026-10-10" }), "15. 9. 2026 – 10. 10. 2026");
  assert.equal(periodLabel({ month: null, from: "2026-09-15", to: "2026-09-15" }), "15. 9. 2026");
  const options = monthOptions("2026-10", null, 3);
  assert.deepEqual(options, ["2026-10", "2026-09", "2026-08"]);
  assert.deepEqual(monthOptions("2026-10", "2020-01", 2), ["2026-10", "2026-09", "2020-01"]);
});

test("month dropdown offers the current month and five previous months by default", async () => {
  const { monthOptions } = await import("../src/lib/period");
  assert.deepEqual(monthOptions("2026-03", null), ["2026-03", "2026-02", "2026-01", "2025-12", "2025-11", "2025-10"]);
});

test("report PDF renders Slovak text, top partners and paginates long partner tables", async () => {
  const { renderReportPdf, reportFileName } = await import("../src/server/reports-pdf");
  const partners = Array.from({ length: 80 }, (_, index) => ({
    id: String(index + 1), code: `EP-${String(index).padStart(5, "0")}`, displayName: `Partner č. ${index + 1} – Žilina`,
    type: (["installer", "company", "referrer"] as const)[index % 3],
    amount: "123.00", grossAmount: "123.00", netAmount: "100.00", points: 100, purchases: 1,
  }));
  const pdf = await renderReportPdf({
    companyName: "Europodlahy", period: { month: "2026-10", from: "2026-10-01", to: "2026-10-31" },
    report: {
      summary: { amount: "9840.00", grossAmount: "9840.00", netAmount: "8000.00", points: 8000, purchases: 80 },
      partners,
    },
    generatedBy: "Admin", timeZone: "Europe/Bratislava", now: new Date("2026-10-13T12:00:00Z"),
  });
  assert.equal(pdf.subarray(0, 5).toString(), "%PDF-");
  const pages = pdf.toString("latin1").match(/\/Type \/Page\b(?!s)/g) ?? [];
  assert.ok(pages.length >= 3, `expected multiple pages, got ${pages.length}`);
  assert.equal(reportFileName("europodlahy", { month: "2026-10", from: "2026-10-01", to: "2026-10-31" }), "report-europodlahy-2026-10.pdf");
  assert.equal(reportFileName("europodlahy", { month: null, from: "2026-09-15", to: "2026-10-10" }), "report-europodlahy-2026-09-15_2026-10-10.pdf");

  const empty = await renderReportPdf({
    companyName: "Europodlahy", period: { month: null, from: "2026-01-01", to: "2026-01-31" },
    report: { summary: { amount: "0.00", grossAmount: "0.00", netAmount: "0.00", points: 0, purchases: 0 }, partners: [] },
    generatedBy: "Admin", timeZone: "Europe/Bratislava",
  });
  assert.equal((empty.toString("latin1").match(/\/Type \/Page\b(?!s)/g) ?? []).length, 1);
});
