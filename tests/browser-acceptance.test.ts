import assert from "node:assert/strict";
import { createHash, randomBytes, randomUUID } from "node:crypto";
import { writeFile } from "node:fs/promises";
import { test } from "node:test";
import { hash } from "@node-rs/argon2";
import { chromium, type BrowserContext, type Page } from "playwright";

import { prisma } from "../src/server/db";

const base = "http://127.0.0.1:3017";
const origin = "https://partners.example.invalid";
if (!process.env.DATABASE_URL?.endsWith("/europodlahy_5a_validation")) {
  throw new Error("Browser acceptance requires the disposable validation database.");
}

test("browser acceptance on isolated two-company fixtures", { timeout: 300_000 }, async (t) => {
  const browser = await chromium.launch({ channel: "chrome", headless: true });
  const errors: string[] = [];
  const password = randomBytes(24).toString("base64url");
  const passwordHash = await hash(password, { memoryCost: 19456, timeCost: 2, parallelism: 1 });
  const suffix = randomUUID();
  const contexts: BrowserContext[] = [];

  async function session(email: string, mobile = false) {
    const context = await browser.newContext({
      viewport: mobile ? { width: 390, height: 844 } : { width: 1366, height: 900 },
      ...(mobile ? { isMobile: true, hasTouch: true, deviceScaleFactor: 3 } : {}),
    });
    contexts.push(context);
    // Keep the production HTTPS origin/cookies while forwarding only to the local fixture server.
    await context.route(`${origin}/**`, async (route) => {
      const url = new URL(route.request().url());
      const response = await route.fetch({ url: `${base}${url.pathname}${url.search}`, maxRedirects: 0 });
      await route.fulfill({ response });
    });
    const page = await context.newPage();
    page.on("pageerror", (error) => errors.push(error.message));
    await page.goto(`${origin}/login`);
    await page.getByLabel("E-mail", { exact: true }).fill(email);
    await page.getByLabel("Heslo", { exact: true }).fill(password);
    await page.getByRole("button", { name: "Prihlásiť sa", exact: true }).click();
    await page.waitForURL((url) => url.pathname === "/app" || url.pathname === "/superadmin/firmy");
    return page;
  }

  async function noOverflow(page: Page) {
    const sizes = await page.evaluate(() => ({
      viewport: document.documentElement.clientWidth,
      content: document.documentElement.scrollWidth,
    }));
    assert.ok(sizes.content <= sizes.viewport, `Horizontal overflow: ${JSON.stringify(sizes)}`);
  }

  async function downloadCsv(page: Page, action: () => Promise<unknown>) {
    const downloaded = page.waitForEvent("download");
    await action();
    const download = await downloaded;
    assert.match(download.suggestedFilename(), /\.csv$/);
    const stream = await download.createReadStream();
    const chunks: Buffer[] = [];
    for await (const chunk of stream) chunks.push(Buffer.from(chunk));
    const bytes = Buffer.concat(chunks);
    assert.equal(bytes.subarray(0, 3).toString("hex"), "efbbbf");
    return bytes.toString("utf8");
  }

  try {
    const company = await prisma.company.create({ data: { name: "Browser Alpha", slug: `browser-alpha-${suffix}` } });
    const second = await prisma.company.create({ data: { name: "Browser Beta", slug: `browser-beta-${suffix}` } });
    const admin = await prisma.user.create({ data: {
      companyId: company.id, email: `browser-admin-${suffix}@example.test`,
      name: "Browser Alpha Admin", role: "admin", passwordHash, mustChangePassword: false,
    } });
    const secondAdmin = await prisma.user.create({ data: {
      companyId: second.id, email: `browser-second-${suffix}@example.test`,
      name: "Browser Beta Admin", role: "admin", passwordHash, mustChangePassword: false,
    } });
    const superadmin = await prisma.user.create({ data: {
      email: `browser-global-${suffix}@example.test`,
      name: "Browser Global", role: "superadmin", passwordHash, mustChangePassword: false,
    } });
    const seller = await prisma.user.create({ data: {
      companyId: company.id, email: `browser-seller-${suffix}@example.test`,
      name: "Browser Seller", role: "seller", passwordHash, mustChangePassword: false,
    } });
    const partner = await prisma.partner.create({ data: {
      companyId: company.id, code: "EP-BRW23", type: "installer",
      displayName: "Browser Alpha Partner", createdByUserId: admin.id,
    } });
    const otherPartner = await prisma.partner.create({ data: {
      companyId: second.id, code: "EP-BRW24", type: "company",
      displayName: "Browser Beta Secret", createdByUserId: secondAdmin.id,
    } });
    if (process.env.ACCEPTANCE_EXPORTS === "1") {
      await prisma.partner.create({ data: {
        companyId: company.id, code: "EP-BRW25", type: "referrer",
        displayName: "=1+1", phone: "+421900000000", internalNote: "Diakritika: ľščťžýáíé",
        createdByUserId: admin.id,
      } });
    }
    const purchase = await prisma.purchase.create({ data: {
      companyId: company.id, partnerId: partner.id, createdByUserId: admin.id,
      amount: "24.60", netAmount: "20.00", vatRatePercent: "23.00",
      points: 20, partnerPresent: true, source: "manual", purchasedAt: new Date("2026-10-14T10:00:00Z"),
    } });
    const cardToken = randomBytes(32).toString("base64url");
    await prisma.partnerToken.create({ data: {
      companyId: company.id, partnerId: partner.id, type: "qr",
      tokenHash: createHash("sha256").update(cardToken).digest("hex"),
      tokenHint: cardToken.slice(0, 6), createdByUserId: admin.id,
    } });
    await prisma.auditLog.createMany({ data: Array.from({ length: 45 }, (_, index) => ({
      companyId: company.id, userId: admin.id, action: "purchase.update", entityType: "purchase",
      entityId: purchase.id, partnerId: partner.id, reason: `Browser audit ${index}`,
      oldValues: { amount: "19.99", note: "PRIVATE_BROWSER_NOTE", passwordHash: "PRIVATE_BROWSER_HASH" },
      newValues: { amount: "24.60", netAmount: "20.00", points: 20 },
      createdAt: new Date(`2026-10-14T10:${String(index).padStart(2, "0")}:00Z`),
    })) });
    await prisma.auditLog.create({ data: {
      companyId: second.id, userId: secondAdmin.id, action: "partner.update", entityType: "partner",
      entityId: otherPartner.id, partnerId: otherPartner.id, newValues: { displayName: "Browser Beta Secret" },
    } });

    await t.test("desktop filters, pagination, change details and private-value masking", async () => {
      const page = await session(admin.email);
      await page.goto(`${origin}/app/audit`);
      await page.getByLabel("Od", { exact: true }).fill("2026-10-01");
      await page.getByLabel("Do", { exact: true }).fill("2026-10-31");
      await page.locator('select[name="userId"]').selectOption(admin.id.toString());
      await page.locator('select[name="action"]').selectOption("purchase.update");
      await page.locator('select[name="entityType"]').selectOption("purchase");
      await page.getByLabel("ID záznamu", { exact: true }).fill(purchase.id.toString());
      await page.getByLabel("ID partnera", { exact: true }).fill(partner.id.toString());
      await page.getByRole("button", { name: "Filtrovať", exact: true }).click();
      await page.waitForURL((url) => url.searchParams.get("action") === "purchase.update");
      await page.getByText("Dôvod: Browser audit 44", { exact: true }).waitFor();
      assert.equal(await page.locator("main ol > li").count(), 20);
      assert.match(await page.locator("main").innerText(), /z 45/);
      await page.getByText("Podrobnosti zmeny", { exact: true }).first().click();
      const details = page.locator("details[open]").first();
      assert.match(await details.innerText(), /19\.99/);
      assert.match(await details.innerText(), /24\.60/);
      assert.match(await details.innerText(), /Skryté/);
      assert.doesNotMatch(await page.content(), /PRIVATE_BROWSER_NOTE|PRIVATE_BROWSER_HASH|Browser Beta Secret/);
      await page.getByRole("link", { name: "Staršie", exact: true }).click();
      await page.waitForURL((url) => url.searchParams.get("page") === "2");
      await page.getByText("Dôvod: Browser audit 24", { exact: true }).waitFor();
      assert.equal(new URL(page.url()).searchParams.get("partnerId"), partner.id.toString());
      await page.getByRole("link", { name: "Novšie", exact: true }).click();
      await page.getByText("Dôvod: Browser audit 44", { exact: true }).waitFor();
      await noOverflow(page);
      await page.goto(`${origin}/app/audit?from=invalid`);
      await page.locator("main").getByRole("alert").waitFor();
      assert.match(await page.locator("main").getByRole("alert").innerText(), /nie sú platné/);
    });

    await t.test("superadmin company switching removes previous-company audit", async () => {
      const page = await session(superadmin.email);
      for (const [id, expected, forbidden] of [
        [company.id, "Browser Alpha Partner", "Browser Beta Secret"],
        [second.id, "Browser Beta Secret", "Browser Alpha Partner"],
      ] as const) {
        await page.goto(`${origin}/superadmin/firmy/${id}`);
        await page.getByRole("button", { name: "Otvoriť program firmy", exact: true }).click();
        await page.waitForURL(`${origin}/app`);
        await page.goto(`${origin}/app/audit`);
        await page.getByRole("link", { name: new RegExp(expected) }).first().waitFor();
        assert.doesNotMatch(await page.locator("main").innerText(), new RegExp(forbidden));
        if (process.env.ACCEPTANCE_EXPORTS === "1") {
          const csv = await downloadCsv(page, () => page.getByRole("button", { name: "Stiahnuť CSV", exact: true }).click());
          assert.match(csv, new RegExp(expected));
          assert.doesNotMatch(csv, new RegExp(forbidden));
        }
      }
    });

    await t.test("seller cannot open admin audit in the browser", async () => {
      const page = await session(seller.email);
      await page.goto(`${origin}/app/audit`);
      await page.waitForURL(`${origin}/app`);
      assert.equal(await page.getByRole("heading", { name: "Audit log", exact: true }).count(), 0);
      if (process.env.ACCEPTANCE_EXPORTS === "1") {
        await page.goto(`${origin}/app/exporty`);
        await page.waitForURL(`${origin}/app`);
        assert.equal(await page.getByRole("button", { name: "Stiahnuť CSV", exact: true }).count(), 0);
      }
    });

    await t.test("390px touch viewport supports audit filters, details and navigation without overflow", async () => {
      const page = await session(admin.email, true);
      await page.goto(`${origin}/app/audit?action=purchase.update`);
      await page.getByText("Dôvod: Browser audit 44", { exact: true }).waitFor();
      await page.getByText("Podrobnosti zmeny", { exact: true }).first().click();
      await noOverflow(page);
      await page.getByRole("link", { name: "Staršie", exact: true }).tap();
      await page.waitForURL((url) => url.searchParams.get("page") === "2");
      await page.getByText("Dôvod: Browser audit 24", { exact: true }).waitFor();
      await page.getByRole("button", { name: "Otvoriť menu", exact: true }).tap();
      await page.getByRole("dialog").waitFor();
      await page.getByRole("dialog").getByRole("link", { name: "Audit log", exact: true }).tap();
      await page.getByRole("dialog").waitFor({ state: "hidden" });
      await noOverflow(page);
    });

    if (process.env.ACCEPTANCE_EXPORTS === "1") {
      await t.test("CSV buttons download current filters on export page, reports, partners, purchases and audit", async () => {
        const page = await session(admin.email);
        await page.goto(`${origin}/app/exporty`);
        await page.getByRole("heading", { name: "Exporty CSV", exact: true }).waitFor();
        const partners = page.locator("section").filter({ has: page.getByRole("heading", { name: "Partneri", exact: true }) }).last();
        await partners.locator('input[name="q"]').fill("Alpha");
        const partnerCsv = await downloadCsv(page, () => partners.getByRole("button", { name: "Stiahnuť CSV", exact: true }).click());
        assert.match(partnerCsv, /Browser Alpha Partner/);
        assert.doesNotMatch(partnerCsv, /Browser Beta Secret/);
        if (process.env.ACCEPTANCE_EXCEL_DIR) {
          await partners.locator('input[name="q"]').fill("");
          const allPartnersCsv = await downloadCsv(page, () => partners.getByRole("button", { name: "Stiahnuť CSV", exact: true }).click());
          await writeFile(`${process.env.ACCEPTANCE_EXCEL_DIR}/partners.csv`, allPartnersCsv);
        }

        await page.goto(`${origin}/app/reporty?month=2026-10&type=installer`);
        await page.getByRole("heading", { name: "Mesačný report", exact: true }).waitFor();
        const reportCsv = await downloadCsv(page, () => page.getByRole("button", { name: "Stiahnuť CSV", exact: true }).click());
        assert.match(reportCsv, /Browser Alpha Partner/);
        assert.match(reportCsv, /24,60/);
        assert.match(reportCsv, /20,00/);
        assert.doesNotMatch(reportCsv, /Browser Beta Secret/);
        if (process.env.ACCEPTANCE_EXCEL_DIR) {
          await writeFile(`${process.env.ACCEPTANCE_EXCEL_DIR}/monthly.csv`, reportCsv);
        }
        if (process.env.ACCEPTANCE_SCREENSHOTS) {
          await page.screenshot({ path: `${process.env.ACCEPTANCE_SCREENSHOTS}/report-desktop.png`, fullPage: true });
        }

        await page.goto(`${origin}/app/nakupy?from=2026-10-14&to=2026-10-14`);
        const purchaseCsv = await downloadCsv(page, () => page.getByRole("button", { name: "Stiahnuť CSV", exact: true }).click());
        assert.match(purchaseCsv, /24,60/);
        assert.match(purchaseCsv, /14\.10\.2026/);
        if (process.env.ACCEPTANCE_EXCEL_DIR) {
          await writeFile(`${process.env.ACCEPTANCE_EXCEL_DIR}/purchases.csv`, purchaseCsv);
        }

        await page.goto(`${origin}/app/audit?action=purchase.update&partnerId=${partner.id}&page=2`);
        await page.getByText("Dôvod: Browser audit 24", { exact: true }).waitFor();
        const auditCsv = await downloadCsv(page, () => page.getByRole("button", { name: "Stiahnuť CSV", exact: true }).click());
        assert.match(auditCsv, /Browser audit 44/);
        assert.match(auditCsv, /Browser audit 0(?:[";\r\n])/);
        assert.doesNotMatch(auditCsv, /PRIVATE_BROWSER_NOTE|PRIVATE_BROWSER_HASH|Browser Beta Secret/);
        if (process.env.ACCEPTANCE_EXCEL_DIR) {
          await writeFile(`${process.env.ACCEPTANCE_EXCEL_DIR}/audit-logs.csv`, auditCsv);
        }

        await page.goto(`${origin}/app/partneri`);
        await page.getByLabel("Vyhľadať partnera", { exact: true }).fill("Alpha");
        const filteredCsv = await downloadCsv(page, () => page.getByRole("button", { name: "Stiahnuť CSV", exact: true }).click());
        assert.match(filteredCsv, /Browser Alpha Partner/);
        await noOverflow(page);
      });
    }

    await t.test("390px seller manual purchase and public QR card keep VAT, points and privacy consistent", async () => {
      const page = await session(seller.email, true);
      await page.goto(`${origin}/app/nakupy/manualne`);
      await page.getByLabel("Vyhľadať partnera", { exact: true }).fill("Browser Alpha Partner");
      await page.getByRole("link", { name: /Browser Alpha Partner/ }).tap();
      await page.getByLabel("Suma nákupu s DPH", { exact: false }).fill("19,99");
      await page.getByRole("radio", { name: "Áno", exact: true }).check();
      await page.getByRole("button", { name: "Uložiť nákup", exact: true }).tap();
      await page.getByRole("heading", { name: "Nákup bol uložený", exact: true }).waitFor();
      assert.match(await page.locator("main").innerText(), /16\.25 € bez DPH/);
      assert.match(await page.locator("main").innerText(), /16 bodov/);
      assert.equal(await prisma.purchase.count({ where: { companyId: company.id, createdByUserId: seller.id } }), 1);
      await noOverflow(page);
      await page.goto(`${origin}/k/${cardToken}`);
      await page.getByText("Browser Alpha Partner", { exact: true }).waitFor();
      const card = await page.locator("body").innerText();
      assert.match(card, /36/);
      assert.doesNotMatch(card, /PRIVATE_BROWSER_NOTE|Browser Alpha Admin|Browser Seller|Browser Beta Secret/);
      await noOverflow(page);
    });

    if (process.env.ACCEPTANCE_EXPORTS === "1") {
      await t.test("390px export forms download CSV and display validation errors", async () => {
        const page = await session(admin.email, true);
        await page.goto(`${origin}/app/exporty`);
        const report = page.locator("section").filter({ has: page.getByRole("heading", { name: "Mesačný prehľad", exact: true }) }).last();
        await report.locator('input[name="month"]').fill("2026-10");
        const csv = await downloadCsv(page, () => report.getByRole("button", { name: "Stiahnuť CSV", exact: true }).tap());
        assert.match(csv, /Browser Alpha Partner/);
        assert.doesNotMatch(csv, /Browser Beta Secret/);
        const purchases = page.locator("section").filter({ has: page.getByRole("heading", { name: "Nákupy", exact: true }) }).last();
        await purchases.locator('input[name="from"]').fill("2026-10-15");
        await purchases.locator('input[name="to"]').fill("2026-10-01");
        await purchases.getByRole("button", { name: "Stiahnuť CSV", exact: true }).tap();
        await purchases.getByRole("alert").waitFor();
        await noOverflow(page);
        if (process.env.ACCEPTANCE_SCREENSHOTS) {
          await page.screenshot({ path: `${process.env.ACCEPTANCE_SCREENSHOTS}/exports-mobile.png`, fullPage: true });
        }
      });
    }

    if (process.env.ACCEPTANCE_PHASE11 === "1") {
      await t.test("foreign partner and purchase pages never render another company's data", async () => {
        const foreignPurchase = await prisma.purchase.create({ data: {
          companyId: second.id, partnerId: otherPartner.id, createdByUserId: secondAdmin.id,
          amount: "123.00", netAmount: "100.00", vatRatePercent: "23.00",
          points: 100, partnerPresent: true, source: "manual",
        } });
        const page = await session(admin.email);
        for (const path of [
          `/app/partneri/${otherPartner.id}`,
          `/app/partneri/${otherPartner.id}/upravit`,
          `/app/nakupy/${foreignPurchase.id}`,
          `/app/nakupy/novy?partner=${otherPartner.id}&source=manual`,
        ]) {
          await page.goto(`${origin}${path}`);
          await page.getByRole("heading", { name: "404", exact: true }).waitFor();
          assert.doesNotMatch(await page.content(), /Browser Beta Secret|Browser Beta Admin/);
        }
      });

      await t.test("report month and custom period update totals and PDF is a valid download", async () => {
        const page = await session(admin.email);
        await page.goto(`${origin}/app/reporty?month=2026-10&type=installer`);
        await page.getByLabel("Mesiac", { exact: true }).selectOption("2026-09");
        await page.waitForURL((url) => url.searchParams.get("month") === "2026-09");
        await page.getByText("Za toto obdobie nie sú evidované nákupy.", { exact: true }).first().waitFor();
        assert.equal(new URL(page.url()).searchParams.get("type"), "installer");
        await page.getByLabel("Mesiac", { exact: true }).selectOption("2026-10");
        await page.waitForURL((url) => url.searchParams.get("month") === "2026-10");
        await page.getByRole("button", { name: "Od – do", exact: true }).click();
        await page.getByLabel("Od dátumu", { exact: true }).fill("2026-10-14");
        await page.getByLabel("Do dátumu", { exact: true }).fill("2026-10-14");
        await page.getByRole("button", { name: "Zobraziť", exact: true }).click();
        await page.waitForURL((url) => url.searchParams.get("from") === "2026-10-14");
        await page.getByRole("heading", { name: "Report za obdobie", exact: true }).waitFor();
        assert.equal(new URL(page.url()).searchParams.get("type"), "installer");
        if (process.env.ACCEPTANCE_EXPORTS === "1") {
          const csv = await downloadCsv(page, () => page.getByRole("button", { name: "Stiahnuť CSV", exact: true }).click());
          assert.match(csv, /24,60;20,00;20;1/);
        }
        const pending = page.waitForEvent("download");
        await page.getByRole("button", { name: "Tlačiť / stiahnuť PDF", exact: true }).click();
        const download = await pending;
        assert.match(download.suggestedFilename(), /\.pdf$/);
        const stream = await download.createReadStream();
        const chunks: Buffer[] = [];
        for await (const chunk of stream) chunks.push(Buffer.from(chunk));
        assert.equal(Buffer.concat(chunks).subarray(0, 5).toString(), "%PDF-");
        await noOverflow(page);
      });

      await t.test("admin purchase edit and soft delete require a reason and preserve audit values", async () => {
        const editable = await prisma.purchase.create({ data: {
          companyId: company.id, partnerId: partner.id, createdByUserId: admin.id,
          amount: "12.30", netAmount: "10.00", vatRatePercent: "23.00",
          points: 10, partnerPresent: true, source: "manual",
        } });
        const page = await session(admin.email, true);
        await page.goto(`${origin}/app/nakupy/${editable.id}`);
        assert.equal(await page.getByRole("button", { name: "Uložiť zmeny", exact: true }).isDisabled(), true);
        assert.equal(await page.getByRole("button", { name: "Zmazať nákup", exact: true }).isDisabled(), true);
        await page.getByLabel("Suma s DPH (€)", { exact: true }).fill("24,60");
        await page.getByLabel("Interná poznámka", { exact: true }).fill('<img src=x onerror="window.phase11Xss=true">');
        await page.getByLabel("Dôvod úpravy *", { exact: true }).fill("Browser correction");
        const saved = page.waitForResponse((response) =>
          response.url().endsWith(`/api/purchases/${editable.id}`) && response.request().method() === "PATCH");
        await page.getByRole("button", { name: "Uložiť zmeny", exact: true }).tap();
        assert.equal((await saved).status(), 200);
        await page.getByText("Dôvod: Browser correction", { exact: true }).waitFor();
        const updated = await prisma.purchase.findUniqueOrThrow({ where: { id: editable.id } });
        assert.equal(updated.amount.toFixed(2), "24.60");
        assert.equal(updated.netAmount.toFixed(2), "20.00");
        assert.equal(updated.points, 20);
        assert.equal(await page.evaluate(() => "phase11Xss" in window), false);
        const audit = await prisma.auditLog.findFirstOrThrow({
          where: { companyId: company.id, entityType: "purchase", entityId: editable.id, action: "purchase.update" },
        });
        assert.match(JSON.stringify(audit.oldValues), /12\.30/);
        assert.match(JSON.stringify(audit.newValues), /24\.60/);
        assert.doesNotMatch(JSON.stringify(audit.newValues), /onerror/);
        await page.getByLabel("Dôvod úpravy *", { exact: true }).fill("Browser deletion");
        page.once("dialog", (dialog) => void dialog.accept());
        await page.getByRole("button", { name: "Zmazať nákup", exact: true }).tap();
        await page.waitForURL((url) => url.pathname === "/app/nakupy" && url.searchParams.get("includeDeleted") === "true");
        const deleted = await prisma.purchase.findUniqueOrThrow({ where: { id: editable.id } });
        assert.equal(deleted.isDeleted, true);
        assert.equal(await prisma.auditLog.count({
          where: { companyId: company.id, action: "purchase.delete", entityId: editable.id, reason: "Browser deletion" },
        }), 1);
        await page.goto(`${origin}/app/nakupy/${editable.id}`);
        await page.getByText("Tento nákup je zmazaný a body sa nezapočítavajú.", { exact: true }).waitFor();
        assert.equal(await page.getByRole("button", { name: "Uložiť zmeny", exact: true }).count(), 0);
        await noOverflow(page);
      });

      await t.test("switching company in another tab discards an in-progress purchase form", async () => {
        const page = await session(superadmin.email);
        await page.goto(`${origin}/superadmin/firmy/${company.id}`);
        await page.getByRole("button", { name: "Otvoriť program firmy", exact: true }).click();
        await page.waitForURL(`${origin}/app`);
        await page.goto(`${origin}/app/nakupy/novy?partner=${partner.id}&source=manual`);
        await page.getByLabel("Suma nákupu s DPH", { exact: false }).fill("77,77");
        const otherTab = await page.context().newPage();
        await otherTab.goto(`${origin}/superadmin/firmy/${second.id}`);
        await otherTab.getByRole("button", { name: "Otvoriť program firmy", exact: true }).click();
        await otherTab.waitForURL(`${origin}/app`);
        await page.waitForURL(`${origin}/superadmin/firmy`);
        assert.equal(await page.getByLabel("Suma nákupu s DPH", { exact: false }).count(), 0);
        assert.equal(await prisma.purchase.count({
          where: { companyId: company.id, createdByUserId: superadmin.id, amount: "77.77" },
        }), 0);
      });

      await t.test("deactivated program revokes browser access; reactivation restores access", async () => {
        const page = await session(secondAdmin.email);
        await page.goto(`${origin}/app/partneri`);
        await page.getByRole("heading", { name: "Browser Beta Secret", exact: true }).waitFor();
        await prisma.company.update({ where: { id: second.id }, data: { isActive: false, deactivatedAt: new Date() } });
        try {
          await page.reload();
          await page.waitForURL((url) => url.pathname === "/login");
          assert.doesNotMatch(await page.locator("body").innerText(), /Browser Beta Secret/);
        } finally {
          await prisma.company.update({ where: { id: second.id }, data: { isActive: true, deactivatedAt: null } });
        }
        await page.goto(`${origin}/app/partneri`);
        await page.getByRole("heading", { name: "Browser Beta Secret", exact: true }).waitFor();
      });

      await t.test("logout and history navigation do not restore an authenticated company page", async () => {
        const page = await session(admin.email);
        await page.goto(`${origin}/app/audit`);
        await page.getByRole("link", { name: /Browser Alpha Partner/ }).first().waitFor();
        await page.getByRole("button", { name: "Odhlásiť", exact: true }).filter({ visible: true }).click();
        await page.waitForURL((url) => url.pathname === "/login");
        await page.goBack();
        await page.waitForURL((url) => url.pathname === "/login");
        assert.doesNotMatch(await page.locator("body").innerText(), /Browser Alpha Partner|Browser audit 44/);
        const response = await page.context().request.get(`${base}/api/audit-logs`);
        assert.equal(response.status(), 401);
      });
    }
    assert.deepEqual(errors, [], "Browser runtime errors");
  } finally {
    await Promise.all(contexts.map((context) => context.close()));
    await browser.close();
    await prisma.$disconnect();
  }
});
