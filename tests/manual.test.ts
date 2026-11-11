import assert from "node:assert/strict";
import { existsSync } from "node:fs";
import { test } from "node:test";

import {
  getManualArticle, getManualArticles, manualArticles, manualChapters, type ManualRole,
} from "../src/lib/manual";

test("manual guides have unique routes, complete task instructions and valid related guides", () => {
  const slugs = manualArticles.map((article) => article.slug);
  assert.equal(new Set(slugs).size, slugs.length);
  for (const article of manualArticles) {
    assert.match(article.slug, /^[a-z]+(?:-[a-z]+)*$/);
    assert.ok(article.title && article.summary && article.sections.length, article.slug);
    for (const section of article.sections) {
      assert.ok(section.title && section.result && section.steps.length >= 3, article.slug);
    }
    for (const related of article.related) {
      assert.ok(slugs.includes(related), `${article.slug}: unknown related guide ${related}`);
      assert.notEqual(related, article.slug);
    }
    if (article.action) {
      assert.ok(existsSync(`src/app${article.action.href}/page.tsx`), article.action.href);
    }
  }
});

test("manual restricts seller chapters and direct lookups to seller capabilities", () => {
  const expected = [
    "zaciname", "skenovanie", "bez-karty", "zapis-nakupu", "historia-nakupov",
    "body", "verejna-karta", "heslo", "problemy",
  ];
  assert.deepEqual(getManualArticles("seller").map((article) => article.slug), expected);
  for (const slug of ["nastavenie-firmy", "pouzivatelia", "partneri", "qr-karty",
    "nfc", "stratena-karta", "opravy-nakupov", "reporty", "exporty", "audit",
    "ochrana-udajov", "firmy", "platformovy-audit", "prepinanie-firiem"]) {
    assert.equal(getManualArticle("seller", slug), undefined, slug);
  }
});

test("admin gets every company guide while superadmin also gets global guidance", () => {
  const admin = getManualArticles("admin");
  assert.ok(admin.some((article) => article.slug === "nastavenie-firmy"));
  assert.ok(admin.some((article) => article.slug === "ochrana-udajov"));
  for (const slug of ["firmy", "prepinanie-firiem", "platformovy-audit"]) {
    assert.equal(getManualArticle("admin", slug), undefined);
    assert.ok(getManualArticle("superadmin", slug));
  }
  for (const article of admin) assert.ok(getManualArticle("superadmin", article.slug));
  for (const role of ["seller", "admin", "superadmin"] satisfies ManualRole[]) {
    const base = role === "superadmin" ? "/superadmin/manual" : "/app/manual";
    assert.deepEqual(manualChapters(role, base), getManualArticles(role).map((article) => ({
      href: `${base}/${article.slug}`, label: article.title,
    })));
    assert.equal(getManualArticle(role, "neexistuje"), undefined);
    assert.equal(getManualArticle(role, "constructor"), undefined);
  }
});

test("lost-card and NFC instructions preserve history and distinguish independent credentials", () => {
  const content = JSON.stringify(getManualArticle("admin", "stratena-karta"));
  assert.match(content, /Nevytvárajte nový profil/);
  assert.match(content, /staré nezmazané nákupy/);
  assert.match(content, /oba prístupy/);
  assert.match(JSON.stringify(getManualArticle("admin", "nfc")), /sama fyzický čip nezapisuje/);
  assert.match(JSON.stringify(getManualArticle("admin", "ochrana-udajov")), /nespúšťajú automatické mazanie/);
});

test("card printing guides explain bundled fonts for both management roles", () => {
  for (const role of ["admin", "superadmin"] satisfies ManualRole[]) {
    const content = JSON.stringify(getManualArticle(role, "qr-karty"));
    assert.match(content, /pribalené písmo vrátane slovenskej diakritiky/);
    assert.match(content, /na tlač netreba inštalovať písma/);
  }
  assert.equal(getManualArticle("seller", "qr-karty"), undefined);
});

test("all roles receive current installation, session, camera and repeat-purchase instructions", () => {
  for (const role of ["seller", "admin", "superadmin"] satisfies ManualRole[]) {
    const gettingStarted = JSON.stringify(getManualArticle(role, "zaciname"));
    assert.match(gettingStarted, /Nainštalovať pre Android/);
    assert.match(gettingStarted, /Safari/);
    assert.match(gettingStarted, /potrebuje internet/);
    const login = JSON.stringify(getManualArticle(role, "heslo"));
    assert.match(login, /Zapamätať si prihlásenie/);
    assert.match(login, /najviac 7 dní/);
    assert.match(login, /spoločnom alebo verejnom zariadení/);
    assert.match(JSON.stringify(getManualArticle(role, "skenovanie")), /znova zapnite/);
    assert.match(JSON.stringify(getManualArticle(role, "zapis-nakupu")), /Ďalší nákup tohto partnera/);
  }
});
