import assert from "node:assert/strict";
import { createHash, randomBytes, randomUUID } from "node:crypto";
import { writeFile } from "node:fs/promises";
import { test } from "node:test";
import { hash } from "@node-rs/argon2";
import { chromium, type BrowserContext, type Page } from "playwright";
import sharp from "sharp";

import { prisma } from "../src/server/db";
import { companyCookieName } from "../src/server/auth/company-cookie";

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
      const response = await route.fetch({
        url: `${base}${url.pathname}${url.search}`, maxRedirects: 0,
        ...(route.request().headers()["next-action"] ? {
          headers: { ...route.request().headers(), "x-forwarded-host": url.host },
        } : {}),
      });
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
      overflowing: [...document.querySelectorAll("main *")].filter((element) =>
        element.getBoundingClientRect().right > document.documentElement.clientWidth,
      ).slice(0, 8).map((element) => ({
        tag: element.tagName, classes: element.className,
        left: element.getBoundingClientRect().left, width: element.getBoundingClientRect().width,
        minWidth: getComputedStyle(element).minWidth, wrap: getComputedStyle(element).whiteSpace,
        parentWidth: element.parentElement?.getBoundingClientRect().width,
      })),
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
    const company = await prisma.company.create({ data: { name: "Browser Alpha", slug: `browser-alpha-${suffix}`, ico: "12345678" } });
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

    await t.test("mobile validation identifies fields, prevents invalid requests and preserves server details", async () => {
      const page = await session(admin.email, true);
      await page.goto(`${origin}/app/users`);
      const create = page.locator("form").filter({ has: page.locator('input[name="name"]') });
      let createRequests = 0;
      await page.route("**/api/users", async (route) => {
        if (route.request().method() !== "POST") return route.continue();
        createRequests++;
        await route.fulfill({
          status: 400, contentType: "application/json",
          body: JSON.stringify({ error: {
            code: "VALIDATION_ERROR", message: "Skontrolujte zadané údaje.",
            fields: [{ field: "email", message: "Zadajte platnú e-mailovú adresu." }],
          } }),
        });
      });
      await create.getByRole("button", { name: "Vytvoriť účet", exact: true }).click();
      const summary = create.locator("[data-validation-summary]");
      await summary.waitFor();
      assert.match(await summary.innerText(), /Meno:.*Vyplňte/);
      assert.match(await summary.innerText(), /E-mail:.*Vyplňte/);
      assert.match(await summary.innerText(), /Dočasné heslo.*Vyplňte/);
      assert.equal(await page.evaluate(() => (document.activeElement as HTMLInputElement)?.name), "name");
      assert.equal(await create.locator('input[name="name"]').getAttribute("aria-invalid"), "true");
      assert.equal(createRequests, 0);

      await create.locator('input[name="name"]').fill("A");
      await create.locator('input[name="email"]').fill("not-an-email");
      await create.locator('input[name="temporaryPassword"]').fill("short");
      await create.getByRole("button", { name: "Vytvoriť účet", exact: true }).click();
      assert.match(await summary.innerText(), /aspoň 2/);
      assert.match(await summary.innerText(), /platnú e-mailovú/);
      assert.match(await summary.innerText(), /aspoň 10/);
      assert.equal(createRequests, 0);
      await create.locator('input[name="name"]').fill("Test validation");
      await create.locator('input[name="email"]').fill("validation@example.test");
      await create.locator('input[name="temporaryPassword"]').fill("long-enough-password");
      const invalidUserResponse = page.waitForResponse((response) =>
        response.url().endsWith("/api/users") && response.request().method() === "POST");
      await create.getByRole("button", { name: "Vytvoriť účet", exact: true }).click();
      assert.equal((await invalidUserResponse).status(), 400);
      await page.getByText("Skontrolujte zadané údaje. E-mail: Zadajte platnú e-mailovú adresu.", { exact: true }).waitFor();
      assert.equal(createRequests, 1);
      assert.equal(await create.locator('[aria-invalid="true"]').count(), 0);
      await noOverflow(page);

      await page.goto(`${origin}/app/nakupy/novy?partner=${partner.id}&source=manual`);
      await page.getByRole("button", { name: "Uložiť nákup", exact: true }).click();
      const purchaseErrors = page.locator("[data-validation-summary]");
      await purchaseErrors.waitFor();
      assert.match(await purchaseErrors.innerText(), /Suma nákupu/);
      assert.match(await purchaseErrors.innerText(), /Partner bol prítomný/);
      assert.equal(await purchaseErrors.locator("li").count(), 2, "required radio group should produce one error");
      await purchaseErrors.getByRole("button", { name: /Partner bol prítomný/ }).click();
      assert.equal(await page.evaluate(() => (document.activeElement as HTMLInputElement)?.name), "partnerPresent");
      await noOverflow(page);

      let purchaseRequests = 0;
      await page.route("**/api/purchases", async (route) => {
        if (route.request().method() !== "POST") return route.continue();
        purchaseRequests++;
        await route.fulfill({
          status: 409, contentType: "application/json",
          body: JSON.stringify({ error: {
            code: "PURCHASE_CONFIRMATION_REQUIRED", message: "Potvrďte správnosť sumy.",
          } }),
        });
      });
      await page.getByLabel("Suma nákupu s DPH", { exact: false }).fill("1234,56");
      await page.locator('input[name="partnerPresent"][value="yes"]').check();
      await page.getByRole("button", { name: "Uložiť nákup", exact: true }).click();
      const confirmPurchase = page.getByRole("button", { name: "Potvrdiť a uložiť nákup", exact: true });
      await confirmPurchase.waitFor();
      assert.equal(await confirmPurchase.isEnabled(), true);
      await confirmPurchase.click();
      await purchaseErrors.waitFor();
      assert.match(await purchaseErrors.innerText(), /Potvrdzujem správnosť sumy.*Zaškrtnite/);
      assert.equal(purchaseRequests, 1, "missing confirmation must not issue another request");

      await page.goto(`${origin}/app/nakupy/${purchase.id}`);
      const save = page.getByRole("button", { name: "Uložiť zmeny", exact: true });
      assert.equal(await save.isEnabled(), true);
      await save.click();
      await page.locator("[data-validation-summary]").waitFor();
      assert.match(await page.locator("[data-validation-summary]").innerText(), /Dôvod úpravy/);
      let deleteConfirmationShown = false;
      page.once("dialog", async (dialog) => {
        deleteConfirmationShown = true;
        await dialog.dismiss();
      });
      await page.getByRole("button", { name: "Zmazať nákup", exact: true }).click();
      assert.equal(deleteConfirmationShown, false, "a missing deletion reason must be explained before confirmation");
      assert.equal(await page.evaluate(() => (document.activeElement as HTMLTextAreaElement)?.name), "reason");
      page.removeAllListeners("dialog");

      await page.goto(`${origin}/app/audit`);
      await page.getByLabel("Od", { exact: true }).fill("2026-10-31");
      await page.getByLabel("Do", { exact: true }).fill("2026-10-01");
      await page.getByLabel("ID záznamu", { exact: true }).fill("0");
      await page.getByRole("button", { name: "Filtrovať", exact: true }).click();
      const auditErrors = page.locator("[data-validation-summary]");
      await auditErrors.waitFor();
      assert.match(await auditErrors.innerText(), /Koncový dátum/);
      assert.match(await auditErrors.innerText(), /ID záznamu/);
      assert.equal(new URL(page.url()).search, "", "invalid filters must not navigate to a generic error page");

      await page.goto(`${origin}/app/reporty?month=2026-10`);
      await page.getByRole("button", { name: "Od – do", exact: true }).click();
      await page.getByLabel("Od dátumu", { exact: true }).fill("2025-01-01");
      await page.getByLabel("Do dátumu", { exact: true }).fill("2026-01-02");
      await page.getByRole("button", { name: "Zobraziť", exact: true }).click();
      await page.locator("[data-validation-summary]").waitFor();
      assert.match(await page.locator("[data-validation-summary]").innerText(), /najviac 366 dní/);
      await page.getByLabel("Do dátumu", { exact: true }).fill("2026-01-01");
      await page.getByRole("button", { name: "Zobraziť", exact: true }).click();
      await page.waitForURL((url) => url.searchParams.get("to") === "2026-01-01");
      await noOverflow(page);
    });

    await t.test("partner token dialog traps focus and restores it on close", async () => {
      const page = await session(admin.email);
      await page.goto(`${origin}/app/partneri/${partner.id}`);
      await page.getByRole("button", { name: "Nový NFC", exact: true }).click();
      const generate = page.getByRole("button", { name: "Vygenerovať NFC", exact: true });
      await generate.click();
      const dialog = page.getByRole("dialog", { name: "Token je vytvorený" });
      await dialog.waitFor();
      assert.equal(await page.evaluate(() => document.activeElement?.getAttribute("aria-label")), "Zavrieť");

      await dialog.getByRole("button", { name: "Hotovo a zavrieť", exact: true }).evaluate((element) => {
        (element as HTMLButtonElement).focus();
      });
      await page.keyboard.press("Tab");
      assert.equal(await page.evaluate(() => document.activeElement?.getAttribute("aria-label")), "Zavrieť");
      await page.keyboard.press("Escape");
      await dialog.waitFor({ state: "detached" });
      assert.equal(await generate.isEnabled(), true);
      assert.equal(await generate.evaluate((element) => document.activeElement === element), true,
        "closing the dialog should restore its now-enabled generating trigger");
    });

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

    await t.test("PartnersProgram branding is independent of company branding", async () => {
      const page = await session(admin.email);
      await page.locator("aside").getByText("PartnersProgram", { exact: true }).waitFor();
      await page.goto(`${origin}/change-password`);
      assert.match(await page.locator("body").innerText(), /PartnersProgram/);
      assert.doesNotMatch(await page.locator("body").innerText(), /Europodlahy/i);
      const publicContext = await browser.newContext();
      contexts.push(publicContext);
      await publicContext.route(`${origin}/**`, async (route) => {
        const url = new URL(route.request().url());
        const response = await route.fetch({ url: `${base}${url.pathname}${url.search}`, maxRedirects: 0 });
        await route.fulfill({ response });
      });
      const publicPage = await publicContext.newPage();
      await publicPage.goto(`${origin}/login`);
      assert.match(await publicPage.locator("body").innerText(), /PartnersProgram/);
      assert.doesNotMatch(await publicPage.locator("body").innerText(), /Europodlahy/i);
      await publicPage.goto(`${origin}/`);
      assert.equal(await publicPage.title(), "PartnersProgram | Partnerský program");
      assert.match(await publicPage.locator("body").innerText(), /PartnersProgram/);
      assert.doesNotMatch(await publicPage.locator("body").innerText(), /Europodlahy/i);
    });

    await t.test("superadmin company switching removes previous-company audit", async () => {
      const page = await session(superadmin.email);
      await page.goto(`${origin}/superadmin/firmy`);
      assert.equal(await page.getByRole("button", { name: "Ukončiť firemný kontext", exact: true }).count(), 0);
      for (const [id, expected, forbidden] of [
        [company.id, "Browser Alpha Partner", "Browser Beta Secret"],
        [second.id, "Browser Beta Secret", "Browser Alpha Partner"],
      ] as const) {
        await page.goto(`${origin}/superadmin/firmy/${id}`);
        const selectionResponse = page.waitForResponse((response) =>
          response.url().endsWith("/api/superadmin/company-context") &&
          response.request().method() === "POST");
        await page.getByRole("button", { name: "Otvoriť program firmy", exact: true }).click();
        const selected = await selectionResponse;
        assert.equal(selected.status(), 200);
        assert.equal(selected.headers()["clear-site-data"], undefined);
        await page.waitForURL(`${origin}/app`);
        await page.goto(`${origin}/app/audit`);
        await page.getByRole("link", { name: new RegExp(expected) }).first().waitFor();
        assert.doesNotMatch(await page.locator("main").innerText(), new RegExp(forbidden));
        if (process.env.ACCEPTANCE_EXPORTS === "1") {
          const csv = await downloadCsv(page, () => page.getByRole("button", { name: "Stiahnuť CSV", exact: true }).click());
          assert.match(csv, new RegExp(expected));
          assert.doesNotMatch(csv, new RegExp(forbidden));
        }
        if (id === company.id) {
          await page.goto(`${origin}/app/nakupy/novy?partner=${partner.id}&source=manual`);
          let unexpectedDialog = false;
          page.once("dialog", async (dialog) => {
            unexpectedDialog = true;
            await dialog.dismiss();
          });
          await page.getByRole("link", { name: /Späť na firmy \/ zmeniť firmu/ }).click();
          await page.waitForURL(`${origin}/superadmin/firmy`);
          assert.equal(unexpectedDialog, false, "untouched controlled forms should not trigger an unsaved-changes dialog");
          page.removeAllListeners("dialog");
        }
      }
      await page.goto(`${origin}/app/nakupy/novy?partner=${otherPartner.id}&source=manual`);
      await page.getByLabel("Suma nákupu s DPH", { exact: false }).fill("77,77");
      const leaveDialog = page.waitForEvent("dialog", { timeout: 5_000 }).then(async (dialog) => {
        assert.match(dialog.message(), /rozpísané formuláre/);
        await dialog.accept();
      });
      await page.getByRole("link", { name: /Späť na firmy \/ zmeniť firmu/ }).click();
      await leaveDialog;
      await page.waitForURL(`${origin}/superadmin/firmy`);
      const endContext = page.getByRole("button", { name: "Ukončiť firemný kontext", exact: true });
      await endContext.waitFor();
      const clearResponse = page.waitForResponse((response) =>
        response.url().endsWith("/api/superadmin/company-context") &&
        response.request().method() === "DELETE");
      await Promise.all([page.waitForNavigation(), endContext.click()]);
      assert.equal((await clearResponse).status(), 200);
      assert.equal((await page.context().cookies(origin)).some((cookie) => cookie.name === companyCookieName), false);
      assert.equal(await page.getByRole("button", { name: "Ukončiť firemný kontext", exact: true }).count(), 0);
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
      await page.locator("main").getByRole("link", { name: /Browser Alpha Partner/ }).tap();
      await page.waitForURL((url) => url.pathname === "/app/nakupy/novy");
      await page.getByRole("heading", { name: "Browser Alpha Partner", exact: true }).waitFor();
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
        assert.equal(await page.getByRole("button", { name: "Uložiť zmeny", exact: true }).isEnabled(), true);
        assert.equal(await page.getByRole("button", { name: "Zmazať nákup", exact: true }).isEnabled(), true);
        await page.getByRole("button", { name: "Uložiť zmeny", exact: true }).tap();
        await page.locator("[data-validation-summary]").waitFor();
        assert.match(await page.locator("[data-validation-summary]").innerText(), /Dôvod úpravy/);
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
    if (process.env.ACCEPTANCE_PRIVACY === "1") {
      await t.test("privacy notice publication unlocks only evidenced registration and keeps public notices token-free", async () => {
        const page = await session(admin.email, true);
        await page.goto(`${origin}/app/partneri/novy`);
        await page.getByRole("alert").filter({ hasText: "Registrácia nových partnerov je zablokovaná" }).waitFor();
        assert.equal(await page.getByRole("button", { name: "Vytvoriť partnera", exact: true }).count(), 0);
        assert.equal(await prisma.companyPrivacyReceipt.count({ where: { partnerId: partner.id } }), 0);
        await page.getByRole("link", { name: "Otvoriť nastavenia firmy", exact: true }).click();
        const settings = page.locator("section").filter({
          has: page.getByRole("heading", { name: "Ochrana osobných údajov", exact: true }),
        }).last();
        const body = "Informácie o ochrane údajov pre partnerov Browser Alpha. ".repeat(4)
          + '<img src=x onerror="window.privacyXss=true">';
        assert.equal(await settings.getByLabel("Prevádzkovateľ", { exact: true }).inputValue(), company.name);
        assert.equal(await settings.getByLabel("IČO prevádzkovateľa", { exact: true }).inputValue(), company.ico);
        await settings.getByText("Zobraziť alebo upraviť podmienky a lehoty", { exact: true }).click();
        assert.doesNotMatch(await settings.locator("textarea").inputValue(), /\[DOPLNIŤ:/);
        assert.match(await settings.locator("textarea").inputValue(), /3 roky/);
        await settings.getByRole("button", { name: "Uložiť návrh", exact: true }).click();
        await settings.getByRole("status").filter({ hasText: "Návrh bol uložený." }).waitFor();
        await settings.getByRole("button", { name: "Publikovať oznámenie", exact: true }).click();
        await settings.getByRole("alert").waitFor();
        assert.equal(await prisma.companyPrivacyNotice.count({ where: { companyId: company.id } }), 0);
        await settings.getByLabel("Prevádzkovateľ", { exact: true }).fill("Browser Alpha controller");
        await settings.getByLabel("Sídlo prevádzkovateľa", { exact: true }).fill("Testovacia 1, Bratislava");
        await settings.getByLabel("IČO prevádzkovateľa", { exact: true }).fill("12345678");
        await settings.getByLabel("Kontaktný e-mail pre ochranu údajov", { exact: true }).fill("browser-privacy@example.test");
        await settings.getByLabel("Zodpovedná osoba (ak je ustanovená)", { exact: true }).fill("Kontakt podľa oznámenia");
        await settings.locator("textarea").fill(body);
        assert.equal(await settings.getByRole("button", { name: "Publikovať oznámenie", exact: true }).isDisabled(), true);
        await settings.getByRole("button", { name: "Uložiť návrh", exact: true }).click();
        await settings.getByRole("status").filter({ hasText: "Návrh bol uložený." }).waitFor();
        await settings.getByRole("button", { name: "Publikovať oznámenie", exact: true }).click();
        await settings.getByRole("status").filter({ hasText: "Oznámenie bolo publikované." }).waitFor();
        const notice = await prisma.companyPrivacyNotice.findFirstOrThrow({ where: { companyId: company.id } });
        assert.equal(notice.publishedByUserId, admin.id);
        assert.equal(notice.body, body);
        assert.equal(await prisma.companyPrivacyReceipt.count({ where: { partnerId: partner.id } }), 0);
        await noOverflow(page);

        await page.goto(`${origin}/app/partneri/novy`);
        const registration = page.locator("form").filter({ has: page.locator('input[name="displayName"]') });
        await registration.locator('input[name="displayName"]').fill("Browser informed partner");
        assert.equal(await registration.locator('input[name="privacyConfirmed"]').isChecked(), false);
        assert.equal(await registration.locator('input[name="privacyProvidedAt"]').inputValue(), "");
        assert.equal(await registration.locator('select[name="privacyMethod"]').inputValue(), "");
        await registration.getByRole("button", { name: "Vytvoriť partnera", exact: true }).click();
        assert.equal(await prisma.partner.count({ where: { companyId: company.id, displayName: "Browser informed partner" } }), 0);
        await registration.locator('select[name="privacyMethod"]').selectOption("printed");
        const localTime = await page.evaluate(() => {
          const now = new Date();
          return new Date(now.getTime() - now.getTimezoneOffset() * 60_000).toISOString().slice(0, -1);
        });
        await registration.locator('input[name="privacyProvidedAt"]').fill(localTime);
        await registration.locator('input[name="privacyConfirmed"]').check();
        const created = page.waitForResponse((response) =>
          response.url().endsWith("/api/partners") && response.request().method() === "POST");
        await registration.getByRole("button", { name: "Vytvoriť partnera", exact: true }).click();
        assert.equal((await created).status(), 201);
        await page.waitForURL((url) => /^\/app\/partneri\/\d+$/.test(url.pathname));
        const registered = await prisma.partner.findFirstOrThrow({
          where: { companyId: company.id, displayName: "Browser informed partner" },
        });
        const receipt = await prisma.companyPrivacyReceipt.findFirstOrThrow({ where: { partnerId: registered.id } });
        assert.equal(receipt.noticeId, notice.id);
        assert.equal(receipt.recordedByUserId, admin.id);
        assert.equal(receipt.method, "printed");
        assert.equal(receipt.reason, null);
        assert.ok(receipt.providedAt >= notice.publishedAt);
        assert.ok(receipt.providedAt <= new Date());
        const history = page.locator("section").filter({
          has: page.getByRole("heading", { name: "Informovanie o spracúvaní údajov", exact: true }),
        }).last();
        await history.getByText("Zaznamenal: Browser Alpha Admin", { exact: false }).waitFor();
        assert.equal(await history.locator("ol > li").count(), 1);
        assert.match(await history.locator("ol").innerText(), /V tlačenej podobe|Verzia 1/);
        await history.locator('select[name="privacyMethod"]').selectOption("email");
        await history.locator('input[name="privacyProvidedAt"]').fill(localTime);
        await history.locator('input[name="privacyConfirmed"]').check();
        await history.getByRole("button", { name: "Zaznamenať poskytnutie", exact: true }).click();
        assert.equal(await prisma.companyPrivacyReceipt.count({ where: { partnerId: registered.id } }), 1);
        await history.getByLabel("Dôvod ďalšieho záznamu alebo opravy", { exact: true }).fill("Browser additional email informing");
        const appended = page.waitForResponse((response) =>
          response.url().endsWith(`/api/partners/${registered.id}/privacy`) && response.request().method() === "POST");
        await history.getByRole("button", { name: "Zaznamenať poskytnutie", exact: true }).click();
        assert.equal((await appended).status(), 201);
        await history.getByText("Dôvod: Browser additional email informing", { exact: true }).waitFor();
        assert.equal(await history.locator("ol > li").count(), 2);
        assert.deepEqual(await prisma.companyPrivacyReceipt.findUniqueOrThrow({ where: { id: receipt.id } }), receipt);
        await noOverflow(page);

        await page.goto(`${origin}/app/partneri`);
        const filtered = page.waitForResponse((response) =>
          response.url().includes("/api/partners?") && new URL(response.url()).searchParams.get("privacy") === "missing");
        await page.getByLabel("Informovanie o spracúvaní údajov", { exact: true }).selectOption("missing");
        await page.getByRole("button", { name: "Hľadať", exact: true }).click();
        assert.equal((await filtered).status(), 200);
        await page.getByRole("heading", { name: "Browser informed partner", exact: true }).waitFor({ state: "hidden" });
        await page.getByRole("heading", { name: "Browser Alpha Partner", exact: true }).waitFor();
        assert.equal(await page.getByRole("heading", { name: "Browser informed partner", exact: true }).count(), 0);
        assert.doesNotMatch(await page.locator("main").innerText(), /Browser Beta Secret/);
        const recorded = page.waitForResponse((response) =>
          response.url().includes("/api/partners?") && new URL(response.url()).searchParams.get("privacy") === "recorded");
        await page.getByLabel("Informovanie o spracúvaní údajov", { exact: true }).selectOption("recorded");
        await page.getByRole("button", { name: "Hľadať", exact: true }).click();
        assert.equal((await recorded).status(), 200);
        await page.getByRole("heading", { name: "Browser informed partner", exact: true }).waitFor();
        assert.equal(await page.getByRole("heading", { name: "Browser Alpha Partner", exact: true }).count(), 0);
        await noOverflow(page);

        const anonymous = await browser.newContext({ viewport: { width: 390, height: 844 } });
        contexts.push(anonymous);
        const publicPage = await anonymous.newPage();
        await publicPage.goto(`${base}/gdpr`);
        await publicPage.getByRole("heading", { name: "Ochrana osobných údajov", exact: true }).waitFor();
        assert.doesNotMatch(await publicPage.locator("body").innerText(), /VZOR NA DOPLNENIE|DOPLNIŤ/);
        const templateDownload = publicPage.waitForEvent("download");
        await publicPage.getByRole("link", { name: "Stiahnuť PDF", exact: true }).click();
        const downloadedTemplate = await templateDownload;
        assert.equal(downloadedTemplate.suggestedFilename(), "gdpr.pdf");
        const templateStream = await downloadedTemplate.createReadStream();
        const templateChunks: Buffer[] = [];
        for await (const chunk of templateStream) templateChunks.push(Buffer.from(chunk));
        assert.equal(Buffer.concat(templateChunks).subarray(0, 5).toString(), "%PDF-");
        await noOverflow(publicPage);
        await publicPage.goto(`${base}/ochrana-udajov/${company.slug}?version=1`);
        await publicPage.getByText("Browser Alpha controller", { exact: true }).waitFor();
        assert.ok((await publicPage.locator("body").innerText()).includes(body));
        assert.equal(await publicPage.evaluate(() => "privacyXss" in window), false);
        assert.equal(await publicPage.locator("img").count(), 0);
        assert.doesNotMatch(await publicPage.locator("body").innerText(), /Browser informed partner|Browser Alpha Partner|Browser Beta Secret/);
        assert.equal(new URL(publicPage.url()).searchParams.has("token"), false);
        const publishedDownload = publicPage.waitForEvent("download");
        await publicPage.getByRole("link", { name: "Stiahnuť PDF", exact: true }).click();
        assert.equal((await publishedDownload).suggestedFilename(), `ochrana-udajov-${company.slug}-v1.pdf`);
        await noOverflow(publicPage);
        await publicPage.goto(`${base}/k/${cardToken}`);
        const link = publicPage.getByRole("link", { name: /ochran|údaj|oznámen/i });
        const href = await link.getAttribute("href");
        assert.match(href!, new RegExp(`^/ochrana-udajov/${company.slug}`));
        assert.ok(!href!.includes(cardToken));
        assert.match(await publicPage.locator("body").innerText(), /odkaz|kartu/i);

        const global = await session(superadmin.email);
        await global.goto(`${origin}/superadmin/firmy/${company.id}`);
        await global.getByRole("button", { name: "Otvoriť program firmy", exact: true }).click();
        await global.waitForURL(`${origin}/app`);
        await global.goto(`${origin}/app/nastavenia`);
        const readOnly = global.locator("section").filter({
          has: global.getByRole("heading", { name: "Ochrana osobných údajov", exact: true }),
        }).last();
        await readOnly.getByLabel("Prevádzkovateľ", { exact: true }).waitFor();
        assert.equal(await readOnly.getByLabel("Prevádzkovateľ", { exact: true }).isDisabled(), true);
        assert.equal(await readOnly.getByRole("button", { name: "Uložiť návrh", exact: true }).count(), 0);
        assert.equal(await readOnly.getByRole("button", { name: "Publikovať oznámenie", exact: true }).count(), 0);
        await global.goto(`${origin}/app/partneri/${registered.id}`);
        await global.locator("section").filter({
          has: global.getByRole("heading", { name: "Informovanie o spracúvaní údajov", exact: true }),
        }).last().getByText("Dôvod: Browser additional email informing", { exact: true }).waitFor();
        assert.equal(await global.getByRole("button", { name: "Zaznamenať poskytnutie", exact: true }).count(), 0);
        await global.goto(`${origin}/superadmin/firmy/${second.id}`);
        await global.getByRole("button", { name: "Otvoriť program firmy", exact: true }).click();
        await global.waitForURL(`${origin}/app`);
        await global.goto(`${origin}/app/nastavenia`);
        assert.doesNotMatch(await global.locator("main").innerText(), /Browser Alpha controller|browser-privacy@example.test/);
        await global.goto(`${origin}/app/partneri/novy`);
        await global.getByRole("alert").filter({ hasText: "Registrácia nových partnerov je zablokovaná" }).waitFor();
        const sellerPage = await session(seller.email);
        await sellerPage.goto(`${origin}/app/nastavenia`);
        await sellerPage.waitForURL(`${origin}/app`);
        assert.equal(await sellerPage.getByRole("heading", { name: "Ochrana osobných údajov", exact: true }).count(), 0);
      });
    }
    if (process.env.ACCEPTANCE_LOGO === "1") {
      await t.test("company logo upload, menu, mobile, public card, PDF and removal stay company-scoped", async () => {
        const page = await session(admin.email);
        await page.goto(`${origin}/app/nastavenia`);
        const settings = page.locator("section").filter({
          has: page.getByRole("heading", { name: "Logo firmy", exact: true }),
        }).last();
        const png = await sharp({ create: { width: 800, height: 400, channels: 4, background: "#0d9488" } }).png().toBuffer();
        await settings.getByLabel("Vybrať logo", { exact: true }).setInputFiles({
          name: "test-logo.png", mimeType: "image/png", buffer: png,
        });
        await settings.getByRole("button", { name: "Nahrať logo", exact: true }).click();
        await settings.getByRole("status").waitFor();
        await page.locator("aside").getByRole("img", { name: "Logo Browser Alpha", exact: true }).waitFor();
        let imageUrl = await settings.getByRole("img", { name: "Logo Browser Alpha", exact: true }).getAttribute("src");
        assert.match(imageUrl!, /^data:image\/png;base64,/);
        const imageSize = await sharp(Buffer.from(imageUrl!.split(",")[1], "base64")).metadata();
        assert.equal(imageSize.width, 512);
        assert.equal(imageSize.height, 256);
        const mobileAdmin = await session(admin.email, true);
        await mobileAdmin.goto(`${origin}/app/nastavenia`);
        await mobileAdmin.locator("header").getByRole("img", { name: "Logo Browser Alpha", exact: true }).waitFor();
        await noOverflow(mobileAdmin);
        await mobileAdmin.getByRole("button", { name: "Otvoriť menu", exact: true }).click();
        await mobileAdmin.getByRole("button", { name: "Zavrieť menu", exact: true }).last().waitFor();
        await noOverflow(mobileAdmin);
        await mobileAdmin.getByRole("button", { name: "Zavrieť menu", exact: true }).last().click();
        const mobile = await session(seller.email, true);
        await mobile.locator("header").getByRole("img", { name: "Logo Browser Alpha", exact: true }).waitFor();
        await noOverflow(mobile);
        const anonymous = await browser.newContext();
        contexts.push(anonymous);
        const cardPage = await anonymous.newPage();
        await cardPage.goto(`${base}/k/${cardToken}`);
        await cardPage.getByRole("img", { name: "Logo Browser Alpha", exact: true }).waitFor();
        assert.equal(await cardPage.getByRole("img").getAttribute("src"), imageUrl);
        const replacement = await sharp({ create: { width: 128, height: 64, channels: 4, background: "#eab308" } }).webp().toBuffer();
        await settings.getByLabel("Vybrať logo", { exact: true }).setInputFiles({
          name: "replacement.webp", mimeType: "image/webp", buffer: replacement,
        });
        const updated = page.waitForResponse((response) =>
          response.url().endsWith("/api/company/logo") && response.request().method() === "PUT");
        await settings.getByRole("button", { name: "Nahrať logo", exact: true }).click();
        assert.equal((await updated).status(), 200);
        await page.waitForFunction((old) => {
          const preview = document.querySelector<HTMLImageElement>('section img[alt="Logo Browser Alpha"]');
          return preview && preview.src !== old;
        }, imageUrl);
        imageUrl = await settings.getByRole("img").getAttribute("src");
        await cardPage.reload();
        assert.equal(await cardPage.getByRole("img").getAttribute("src"), imageUrl);
        const beta = await session(secondAdmin.email);
        assert.equal(await beta.getByRole("img", { name: "Logo Browser Alpha", exact: true }).count(), 0);

        await page.goto(`${origin}/app/reporty?month=2026-10`);
        const pending = page.waitForEvent("download");
        await page.getByRole("button", { name: "Tlačiť / stiahnuť PDF", exact: true }).click();
        const stream = await (await pending).createReadStream();
        const chunks: Buffer[] = [];
        for await (const chunk of stream) chunks.push(Buffer.from(chunk));
        assert.match(Buffer.concat(chunks).toString("latin1"), /\/Subtype \/Image/);
        const sa = await session(superadmin.email);
        await sa.goto(`${origin}/superadmin/firmy/${company.id}`);
        await sa.getByRole("button", { name: "Otvoriť program firmy", exact: true }).click();
        await sa.waitForURL(`${origin}/app`);
        await sa.goto(`${origin}/app/nastavenia`);
        await sa.getByRole("heading", { name: "Logo firmy", exact: true }).waitFor();
        assert.equal(await sa.locator('input[type="file"]').count(), 0);
        await sa.locator("aside").getByRole("img", { name: "Logo Browser Alpha", exact: true }).waitFor();
        await sa.goto(`${origin}/superadmin/firmy/${second.id}`);
        await sa.getByRole("button", { name: "Otvoriť program firmy", exact: true }).click();
        await sa.waitForURL(`${origin}/app`);
        assert.equal(await sa.getByRole("img", { name: "Logo Browser Alpha", exact: true }).count(), 0);

        await page.goto(`${origin}/app/nastavenia`);
        await settings.getByRole("button", { name: "Odstrániť logo", exact: true }).click();
        await settings.getByRole("status").waitFor();
        await page.locator("aside").getByRole("img", { name: "Logo Browser Alpha", exact: true }).waitFor({ state: "hidden" });
        await cardPage.reload();
        assert.equal(await cardPage.getByRole("img").count(), 0);
        assert.equal((await prisma.company.findUniqueOrThrow({ where: { id: company.id } })).logoData, null);
      });
    }
    assert.deepEqual(errors, [], "Browser runtime errors");
  } finally {
    await Promise.all(contexts.map((context) => context.close()));
    await browser.close();
    await prisma.$disconnect();
  }
});
