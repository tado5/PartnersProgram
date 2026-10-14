import assert from "node:assert/strict";
import { test } from "node:test";

import {
  dateTimeInputInZoneToIso,
  zonedCalendarDayRange,
  zonedCalendarMonthRange,
  zonedDayRange,
} from "../src/lib/dates";
import { getMonthlyBadge } from "../src/lib/monthly-badges";
import { companySettingsUpdateSchema, purchaseCreateSchema } from "../src/lib/schemas";
import { netAmountFromGross, pointsForAmount, purchaseNeedsConfirmation } from "../src/lib/purchases";

test("gross amounts calculate net VAT and points exactly to cents", () => {
  assert.deepEqual(netAmountFromGross("19.99", "23.00"), {
    grossAmount: "19.99", netAmount: "16.25", vatAmount: "3.74",
  });
  assert.deepEqual(netAmountFromGross("100.00", "0.00"), {
    grossAmount: "100.00", netAmount: "100.00", vatAmount: "0.00",
  });
  assert.equal(pointsForAmount("16.25"), 16);
  assert.equal(pointsForAmount("100.00"), 100);
  assert.equal(purchaseNeedsConfirmation("99.99", "100.00"), false);
  assert.equal(purchaseNeedsConfirmation("100.00", "100.00"), true);
  assert.equal(purchaseNeedsConfirmation("100.01", "100.00"), true);
  assert.equal(purchaseNeedsConfirmation("999999.99", null), false);
});

test("purchase inputs require company-safe token/source pairs and preserve idempotency", () => {
  const values = purchaseCreateSchema.parse({
    partnerId: "42",
    amount: "19,99",
    partnerPresent: true,
    source: "manual",
    purchasedAt: "2026-10-13T10:00:00.000Z",
    idempotencyKey: "d7e89f98-3401-4ea4-b03f-2b12cdb21e73",
  });
  assert.equal(values.partnerId, BigInt(42));
  assert.equal(values.amount, "19.99");
  assert.equal(values.highAmountConfirmed, false);

  assert.equal(purchaseCreateSchema.safeParse({
    ...values,
    partnerId: "42",
    source: "qr",
  }).success, false);
  assert.equal(purchaseCreateSchema.safeParse({
    ...values,
    partnerId: "42",
    source: "manual",
    tokenId: "7",
  }).success, false);
});

test("company confirmation setting can be disabled or set to cents precision", () => {
  const badgeThresholds = {
    bronzeMonthlyTurnoverEur: null,
    silverMonthlyTurnoverEur: null,
    goldMonthlyTurnoverEur: null,
  };
  assert.equal(companySettingsUpdateSchema.parse({
    vatRatePercent: "23", purchaseConfirmAboveEur: null, ...badgeThresholds,
  }).purchaseConfirmAboveEur, null);
  assert.equal(companySettingsUpdateSchema.parse({
    vatRatePercent: "23",
    purchaseConfirmAboveEur: "1000,50",
    bronzeMonthlyTurnoverEur: "500",
    silverMonthlyTurnoverEur: "1000,50",
    goldMonthlyTurnoverEur: null,
  }).silverMonthlyTurnoverEur, "1000.50");
  assert.equal(companySettingsUpdateSchema.parse({
    vatRatePercent: "23",
    purchaseConfirmAboveEur: null,
    bronzeMonthlyTurnoverEur: "10000000",
    silverMonthlyTurnoverEur: null,
    goldMonthlyTurnoverEur: null,
  }).bronzeMonthlyTurnoverEur, "10000000.00");
  assert.equal(companySettingsUpdateSchema.safeParse({
    vatRatePercent: "23", purchaseConfirmAboveEur: null, ...badgeThresholds, unknown: true,
  }).success, false);
  assert.equal(companySettingsUpdateSchema.safeParse({
    vatRatePercent: "101", purchaseConfirmAboveEur: "0", ...badgeThresholds,
  }).success, false);
  assert.equal(companySettingsUpdateSchema.safeParse({
    vatRatePercent: "23",
    purchaseConfirmAboveEur: null,
    bronzeMonthlyTurnoverEur: "1000",
    silverMonthlyTurnoverEur: "500",
    goldMonthlyTurnoverEur: null,
  }).success, false);
});

test("monthly badge selection uses the highest enabled threshold without a partner quota", () => {
  const thresholds = {
    bronzeMonthlyTurnoverEur: "500.00",
    silverMonthlyTurnoverEur: "1000.00",
    goldMonthlyTurnoverEur: "2000.00",
  };
  assert.equal(getMonthlyBadge("499.99", thresholds).tier, null);
  assert.equal(getMonthlyBadge("500.00", thresholds).tier, "bronze");
  assert.equal(getMonthlyBadge("1500.00", thresholds).tier, "silver");
  assert.equal(getMonthlyBadge("2000.00", thresholds).tier, "gold");
  assert.equal(getMonthlyBadge("900.00", {
    bronzeMonthlyTurnoverEur: null,
    silverMonthlyTurnoverEur: "800.00",
    goldMonthlyTurnoverEur: null,
  }).tier, "silver");
  assert.equal(getMonthlyBadge("100.00", {
    bronzeMonthlyTurnoverEur: null,
    silverMonthlyTurnoverEur: null,
    goldMonthlyTurnoverEur: null,
  }).nextThreshold, null);
});

test("seller day bounds follow Europe/Bratislava daylight-saving transitions", () => {
  const spring = zonedDayRange(new Date("2026-03-29T12:00:00.000Z"), "Europe/Bratislava");
  assert.equal(spring.start.toISOString(), "2026-03-28T23:00:00.000Z");
  assert.equal((spring.end.getTime() - spring.start.getTime()) / 3_600_000, 23);

  const autumn = zonedDayRange(new Date("2026-10-25T12:00:00.000Z"), "Europe/Bratislava");
  assert.equal(autumn.start.toISOString(), "2026-10-24T22:00:00.000Z");
  assert.equal((autumn.end.getTime() - autumn.start.getTime()) / 3_600_000, 25);
});

test("calendar month bounds follow Europe/Bratislava, including new year", () => {
  const january = zonedCalendarMonthRange(2027, 1, "Europe/Bratislava");
  assert.equal(january.periodStart, "2027-01-01");
  assert.equal(january.start.toISOString(), "2026-12-31T23:00:00.000Z");
  assert.equal(january.end.toISOString(), "2027-01-31T23:00:00.000Z");
  const march = zonedCalendarMonthRange(2026, 3, "Europe/Bratislava");
  assert.equal((march.end.getTime() - march.start.getTime()) / 3_600_000, 743);
});

test("calendar date filters use exclusive, timezone-aware day bounds", () => {
  const springForward = zonedCalendarDayRange(2026, 3, 29, "Europe/Bratislava");
  assert.equal(springForward.start.toISOString(), "2026-03-28T23:00:00.000Z");
  assert.equal(springForward.end.toISOString(), "2026-03-29T22:00:00.000Z");
  assert.equal(springForward.end.getTime() - springForward.start.getTime(), 23 * 3_600_000);
  assert.throws(() => zonedCalendarDayRange(2026, 2, 29, "Europe/Bratislava"), RangeError);
});

test("datetime-local values are interpreted in the application timezone", () => {
  assert.equal(
    dateTimeInputInZoneToIso("2026-10-13T09:00", "Europe/Bratislava"),
    "2026-10-13T07:00:00.000Z",
  );
  assert.equal(
    dateTimeInputInZoneToIso("2026-03-29T02:30", "Europe/Bratislava"),
    null,
  );
});
