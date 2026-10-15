import assert from "node:assert/strict";
import { test } from "node:test";

import {
  privacyDraftSchema, privacyNoticeSchema, privacyPublishSchema,
  privacyReceiptSchema, privacyNoticeResponse,
} from "../src/lib/privacy";
import { privacyTemplateBody, hasPrivacyTemplatePlaceholders } from "../src/lib/privacy-template";
import { privacyTemplateDocument, privacyDocumentHtml, renderPrivacyDocumentPdf } from "../src/server/privacy-document";

const complete = {
  controllerName: "Test firma",
  controllerAddress: "Testovacia 1, Bratislava",
  controllerIco: "12345678",
  contactEmail: "privacy@example.invalid",
  dpoContact: null,
  body: "Informácie o spracúvaní osobných údajov. ".repeat(4).trim(),
};

test("drafts allow incomplete fields while published notices require complete information", () => {
  const draft = { controllerName: "", controllerAddress: "", contactEmail: "", body: "" };
  assert.equal(privacyDraftSchema.safeParse(draft).success, true);
  assert.equal(privacyNoticeSchema.safeParse(draft).success, false);
  assert.equal(privacyNoticeSchema.safeParse(complete).success, true);
  for (const field of ["controllerName", "controllerAddress", "contactEmail", "body"]) {
    assert.equal(privacyNoticeSchema.safeParse({ ...complete, [field]: " " }).success, false, field);
  }
  assert.equal(privacyDraftSchema.safeParse({ ...draft, contactEmail: "not-yet-an-email" }).success, true);
  assert.equal(privacyNoticeSchema.safeParse({ ...complete, contactEmail: "not-an-email" }).success, false);
});

test("notice inputs trim content and normalize absent optional values to null", () => {
  assert.deepEqual(privacyNoticeSchema.parse({
    ...complete, controllerName: "  Test firma  ", controllerIco: " ", dpoContact: " ",
  }), { ...complete, controllerIco: null });
  const { controllerIco: _ico, dpoContact: _dpo, ...withoutOptionals } = complete;
  void _ico;
  void _dpo;
  assert.deepEqual(privacyNoticeSchema.parse(withoutOptionals), { ...complete, controllerIco: null });
  assert.equal(privacyNoticeSchema.safeParse({ ...complete, controllerIco: "1234" }).success, false);
  assert.equal(privacyNoticeSchema.safeParse({ ...complete, controllerIco: "abcdefgh" }).success, false);
});

test("draft and publication schemas enforce storage limits and reject unknown keys", () => {
  for (const [field, limit] of [
    ["controllerName", 150], ["controllerAddress", 500], ["controllerIco", 8],
    ["contactEmail", 191], ["dpoContact", 500], ["body", 20_000],
  ] as const) {
    assert.equal(privacyDraftSchema.safeParse({ ...complete, [field]: "x".repeat(limit) }).success, true);
    assert.equal(privacyDraftSchema.safeParse({ ...complete, [field]: "x".repeat(limit + 1) }).success, false);
  }
  assert.equal(privacyNoticeSchema.safeParse({ ...complete, body: "x".repeat(99) }).success, false);
  assert.equal(privacyNoticeSchema.safeParse({ ...complete, body: "x".repeat(100) }).success, true);
  const supplementaryCharacter = String.fromCodePoint(0x1f600);
  assert.equal(privacyNoticeSchema.safeParse({ ...complete, body: supplementaryCharacter.repeat(50) }).success, false);
  assert.equal(privacyNoticeSchema.safeParse({ ...complete, body: supplementaryCharacter.repeat(100) }).success, true);
  assert.equal(privacyDraftSchema.safeParse({ ...complete, companyId: "2" }).success, false);
});

test("publish payload requires an ISO optimistic-concurrency token", () => {
  assert.equal(privacyPublishSchema.safeParse({}).success, false);
  assert.equal(privacyPublishSchema.safeParse({ expectedUpdatedAt: "2026-10-15T12:00:00.000Z" }).success, true);
  for (const input of [
    { expectedUpdatedAt: "2026-10-15" }, { expectedUpdatedAt: null },
    { effectiveAt: "2026-10-16T12:00:00.000Z" }, null,
  ]) {
    assert.equal(privacyPublishSchema.safeParse(input).success, false);
  }
});

test("receipt inputs validate unsigned bigint IDs, ISO timestamps, methods and correction reasons", () => {
  const receipt = { noticeId: "1", providedAt: "2026-10-15T12:00:00.000Z", method: "in_person" };
  assert.deepEqual(privacyReceiptSchema.parse(receipt), { ...receipt, reason: null });
  for (const method of ["in_person", "printed", "email"]) {
    assert.equal(privacyReceiptSchema.safeParse({ ...receipt, method }).success, true);
  }
  for (const noticeId of ["", "abc", "0", "-1", "1.1", "1e2", "18446744073709551616", "1".repeat(100)]) {
    assert.equal(privacyReceiptSchema.safeParse({ ...receipt, noticeId }).success, false, noticeId);
  }
  assert.equal(privacyReceiptSchema.safeParse({ ...receipt, noticeId: "18446744073709551615" }).success, true);
  assert.equal(privacyReceiptSchema.safeParse({ ...receipt, method: "consent" }).success, false);
  assert.equal(privacyReceiptSchema.safeParse({ ...receipt, providedAt: "2026-10-15" }).success, false);
  assert.equal(privacyReceiptSchema.safeParse({ ...receipt, reason: "x" }).success, false);
  assert.equal(privacyReceiptSchema.safeParse({ ...receipt, reason: "x".repeat(255) }).success, true);
  assert.equal(privacyReceiptSchema.safeParse({ ...receipt, reason: "x".repeat(256) }).success, false);
  assert.equal(privacyReceiptSchema.parse({ ...receipt, reason: "  oprava  " }).reason, "oprava");
  assert.equal(privacyReceiptSchema.parse({ ...receipt, reason: " " }).reason, null);
  assert.equal(privacyReceiptSchema.safeParse({ ...receipt, companyId: "2" }).success, false);
});

test("notice snapshots serialize IDs/dates without exposing internal company or actor IDs", () => {
  const snapshot = privacyNoticeResponse({
    ...complete, id: BigInt("18446744073709551615"), version: 2,
    publishedAt: new Date("2026-10-15T12:00:00.000Z"),
  });

  assert.deepEqual(snapshot, {
    ...complete, id: "18446744073709551615", version: 2, publishedAt: "2026-10-15T12:00:00.000Z",
  });
  assert.doesNotThrow(() => JSON.stringify(snapshot));
  assert.equal("companyId" in snapshot, false);
  assert.equal("publishedByUserId" in snapshot, false);
});

test("the main document is complete and publishable with company identity while legacy placeholders remain blocked", () => {
  assert.ok(privacyTemplateBody.length < 20_000);
  assert.equal(privacyDraftSchema.safeParse({ ...complete, body: privacyTemplateBody }).success, true);
  assert.equal(privacyNoticeSchema.safeParse({ ...complete, body: privacyTemplateBody }).success, true);
  assert.equal(hasPrivacyTemplatePlaceholders(privacyTemplateBody), false);
  assert.equal(privacyNoticeSchema.safeParse({ ...complete, body: `${privacyTemplateBody}\n[DOPLNIŤ: starší návrh]` }).success, false);
  for (const period of ["3 roky", "12 mesiacov", "30 dní", "90 dní"]) assert.ok(privacyTemplateBody.includes(period));
  for (const topic of [
    "právne základy", "Príjemcov", "Prenosy", "uchovávame", "práva", "prenosnosť",
    "oprávneného záujmu", "získavame", "neposkytnutia", "čl. 22", "dozornému orgánu",
    "QR/NFC", "osobnej prítomnosti", "audit", "poskytnutia", "výmazom",
  ]) assert.ok(privacyTemplateBody.toLowerCase().includes(topic.toLowerCase()), topic);
});

test("HTML documents escape company content and distinguish the common document from company versions", () => {
  const template = privacyTemplateDocument();
  const html = privacyDocumentHtml(template, "/gdpr?format=pdf");
  assert.match(html, /Spoločný dokument partnerského programu/);
  assert.match(html, /Stiahnuť PDF/);
  assert.doesNotMatch(html, /VZOR NA DOPLNENIE|DOPLNIŤ|<dt>/);
  const published = privacyDocumentHtml({
    ...template, ...complete, template: false, companyName: "<script>bad</script>",
    body: '<img src=x onerror="bad()">', versionLabel: "Verzia 2",
  }, "/ochrana-udajov/firma?version=2&format=pdf");
  assert.match(published, /&lt;script&gt;bad&lt;\/script&gt;/);
  assert.match(published, /&lt;img/);
  assert.doesNotMatch(published, /<script>|<img|VZOR NA DOPLNENIE|DOPLNIŤ/);
  assert.match(published, /version=2&amp;format=pdf/);
});

test("template and published notices produce paginated PDFs with embedded Unicode fonts", async () => {
  for (const document of [
    privacyTemplateDocument(),
    { ...privacyTemplateDocument(), ...complete, template: false, versionLabel: "Verzia 2", body: complete.body.repeat(100) },
  ]) {
    const pdf = await renderPrivacyDocumentPdf(document);
    assert.equal(pdf.subarray(0, 5).toString(), "%PDF-");
    assert.ok((pdf.toString("latin1").match(/\/Type \/Page\b(?!s)/g) ?? []).length >= 2);
    assert.match(pdf.toString("latin1"), /\/ToUnicode/);
    assert.match(pdf.toString("latin1"), /%%EOF/);
    assert.ok(pdf.length > 10000);
  }
});

test("page numbers do not create extra blank PDF pages", async () => {
  const pdf = await renderPrivacyDocumentPdf({
    ...privacyTemplateDocument(), ...complete, companyName: complete.controllerName,
    template: false, versionLabel: "Verzia 1",
  });
  assert.equal((pdf.toString("latin1").match(/\/Type \/Page\b(?!s)/g) ?? []).length, 1);
});
