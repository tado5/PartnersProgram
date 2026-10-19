import assert from "node:assert/strict";
import { test } from "node:test";

import { characterCount, formatApiError, validationFields } from "../src/lib/validation-errors";
import {
  companyCreateSchema, companySettingsUpdateSchema, partnerUpdateSchema,
  passwordChangeSchema, purchaseCreateSchema, userCreateSchema,
} from "../src/lib/schemas";
import { privacyNoticeSchema } from "../src/lib/privacy";

test("validation responses name every incorrect field in Slovak without echoing input values", () => {
  const result = userCreateSchema.safeParse({
    email: "invalid", name: "A", temporaryPassword: "short", role: "seller",
  });
  assert.equal(result.success, false);
  if (result.success) return;
  const fields = validationFields(result.error.issues);
  assert.deepEqual(fields, [
    { field: "email", message: "Zadajte platnú e-mailovú adresu." },
    { field: "name", message: "Zadajte aspoň 2 znaky." },
    { field: "temporaryPassword", message: "Zadajte aspoň 10 znakov." },
  ]);
  const message = formatApiError({ message: "Skontrolujte zadané údaje.", fields }, "Uloženie zlyhalo.");
  assert.match(message, /E-mail: Zadajte platnú/);
  assert.match(message, /Meno \/ názov: Zadajte aspoň 2/);
  assert.match(message, /Dočasné heslo: Zadajte aspoň 10/);
  assert.doesNotMatch(message, /Too small|Invalid email|short/);
});

test("nested company admin errors have distinct human-readable labels", () => {
  const result = companyCreateSchema.safeParse({
    name: "Firma", slug: "Invalid Slug", ico: "123",
    admin: { name: "A", email: "invalid", temporaryPassword: "short" },
  });
  assert.equal(result.success, false);
  if (result.success) return;
  const message = formatApiError({ fields: validationFields(result.error.issues) }, "Skontrolujte údaje.");
  assert.match(message, /Slug firmy: Použite malé písmená/);
  assert.match(message, /IČO: Zadajte presne 8 číslic/);
  assert.match(message, /Meno prvého admina:/);
  assert.match(message, /E-mail prvého admina:/);
  assert.match(message, /Dočasné heslo prvého admina:/);
});

test("phone formatting and purchase amount errors explain the expected format", () => {
  const phone = partnerUpdateSchema.safeParse({ phone: "123" });
  assert.equal(phone.success, false);
  if (!phone.success) {
    const message = formatApiError({ fields: validationFields(phone.error.issues) }, "Skontrolujte údaje.");
    assert.match(message, /Telefón: Zadajte slovenské telefónne číslo/);
  }
  for (const amount of ["0", "1.234", "-1"]) {
    const purchase = purchaseCreateSchema.safeParse({
      amount, partnerId: "1", partnerPresent: true, source: "manual",
      idempotencyKey: "a45ce101-76bb-4fca-8fe8-fc5dfe1aeffe",
    });
    assert.equal(purchase.success, false);
    if (!purchase.success) {
      const message = formatApiError({ fields: validationFields(purchase.error.issues) }, "Skontrolujte údaje.");
      assert.match(message, /Suma nákupu s DPH:/);
      assert.doesNotMatch(message, /Invalid input|Invalid string/);
    }
  }
});

test("custom cross-field and privacy publication messages remain intact", () => {
  const settings = companySettingsUpdateSchema.safeParse({
    vatRatePercent: "23", purchaseConfirmAboveEur: null,
    bronzeMonthlyTurnoverEur: "200", silverMonthlyTurnoverEur: "100", goldMonthlyTurnoverEur: null,
  });
  assert.equal(settings.success, false);
  if (!settings.success) {
    const message = formatApiError({ fields: validationFields(settings.error.issues) }, "Skontrolujte údaje.");
    assert.match(message, /Hranica bronzového partnera: Aktívne hranice odznakov musia byť v rastúcom poradí/);
  }
  const privacy = privacyNoticeSchema.safeParse({
    controllerName: "", controllerAddress: "", controllerIco: "abc",
    contactEmail: "invalid", body: "Krátky text",
  });
  assert.equal(privacy.success, false);
  if (!privacy.success) {
    const message = formatApiError({ fields: validationFields(privacy.error.issues) }, "Doplňte údaje.");
    assert.match(message, /Prevádzkovateľ:/);
    assert.match(message, /Sídlo prevádzkovateľa:/);
    assert.match(message, /Kontaktný e-mail pre ochranu údajov:/);
    assert.match(message, /Informačné oznámenie:/);
    assert.doesNotMatch(message, /Invalid input|Too small/);
  }
});

test("existing non-validation errors and malformed API errors retain explicit fallbacks", () => {
  assert.equal(formatApiError(null, "Požiadavka zlyhala."), "Požiadavka zlyhala.");
  assert.equal(formatApiError({ code: "FORBIDDEN", message: "Nemáte oprávnenie." }, "Chyba."), "Nemáte oprávnenie.");
  assert.equal(formatApiError({ fields: [null, {}, { field: "email", message: 3 }] }, "Chyba."), "Chyba.");
  assert.equal(
    formatApiError({ fields: [{ field: "email", message: "Opravte adresu." }, { field: "email", message: "Opravte adresu." }] }, "Chyba."),
    "Chyba. E-mail: Opravte adresu.",
  );
});

test("Slovak character-count messages handle short field constraints", () => {
  assert.equal(characterCount(1), "1 znak");
  assert.equal(characterCount(2), "2 znaky");
  assert.equal(characterCount(4), "4 znaky");
  assert.equal(characterCount(10), "10 znakov");
});

test("validation feedback does not weaken existing password, optional-contact or monetary rules", () => {
  assert.equal(passwordChangeSchema.safeParse({ currentPassword: "old", newPassword: "123456789" }).success, false);
  assert.equal(passwordChangeSchema.safeParse({ currentPassword: "old", newPassword: "1234567890" }).success, true);
  assert.equal(partnerUpdateSchema.safeParse({ phone: "+421 903 123 456", email: null, ico: null }).success, true);
  assert.equal(companySettingsUpdateSchema.safeParse({
    vatRatePercent: "23", purchaseConfirmAboveEur: null,
    bronzeMonthlyTurnoverEur: null, silverMonthlyTurnoverEur: null, goldMonthlyTurnoverEur: null,
  }).success, true);
});
