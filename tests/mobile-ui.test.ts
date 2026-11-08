import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { test } from "node:test";
import { compile } from "tailwindcss";
import { chromium } from "playwright";
import ts from "typescript";

declare global {
  interface Window {
    mobileUi: {
      prepare: (element: HTMLElement) => () => void;
      cleanups: (() => void)[];
      viewport: EventTarget & { scale: number; height: number; offsetTop: number };
    };
  }
}

test("mobile UI baseline preserves readable controls, safe areas and overlay scrolling", async (t) => {
  const cssPath = resolve("src/app/globals.css");
  const compiler = await compile(await readFile(cssPath, "utf8"), {
    base: dirname(cssPath),
    loadStylesheet: async (id, base) => {
      const path = id === "tailwindcss"
        ? resolve("node_modules/tailwindcss/index.css")
        : id === "tw-animate-css"
          ? resolve("node_modules/tw-animate-css/dist/tw-animate.css")
          : resolve(base, id);
      return { content: await readFile(path, "utf8"), base: dirname(path), path };
    },
  });
  const css = compiler.build([
    "text-xs", "text-sm", "md:text-sm", "fixed", "inset-0", "flex",
    "flex-col", "items-center", "justify-center", "overflow-y-auto",
    "my-auto", "w-full", "h-14", "px-4", "sm:px-6", "py-6", "sm:py-8",
  ]);
  const source = await readFile(resolve("src/lib/mobile-overlay.ts"), "utf8");
  const script = ts.transpileModule(source, {
    compilerOptions: { target: ts.ScriptTarget.ES2020, module: ts.ModuleKind.CommonJS },
  }).outputText;
  const browser = await chromium.launch({
    channel: process.env.CI ? "chromium" : "chrome",
    headless: true,
  });
  t.after(() => browser.close());

  for (const mobile of [true, false]) {
    await t.test(mobile ? "touch portrait and landscape" : "desktop retains compact input text", async () => {
      const context = await browser.newContext({
        viewport: mobile ? { width: 390, height: 844 } : { width: 1366, height: 900 },
        isMobile: mobile,
        hasTouch: mobile,
      });
      t.after(() => context.close());
      const page = await context.newPage();
      await page.setContent(`<!doctype html><meta name="viewport" content="width=device-width, initial-scale=1">
        <style>${css}</style>
        <header class="mobile-header h-14 px-4">Header</header>
        <main class="screen-page public-page px-4 sm:px-6">
          <label class="text-xs">Small input<input class="text-xs" aria-label="Small input"></label>
          <select class="text-sm"><option>Option</option></select>
          <textarea class="text-sm"></textarea>
          <input class="text-sm md:text-sm" type="date">
          <div contenteditable="true" class="text-xs">Editable</div>
          <button id="trigger">Open</button>
          <div style="height:2400px"></div>
        </main>
        <div id="overlay" hidden class="mobile-overlay modal-overlay fixed inset-0 flex items-center justify-center overflow-y-auto">
          <section class="my-auto w-full"><input aria-label="Modal input">
            <div style="height:1200px">Long modal content</div><button id="last">Last action</button>
          </section>
        </div>`);
      await page.addScriptTag({ content: `(() => {
        const exports = {};
        ${script}
        const viewport = Object.assign(new EventTarget(), { scale: 1, height: innerHeight, offsetTop: 0 });
        Object.defineProperty(window, "visualViewport", { configurable: true, value: viewport });
        window.mobileUi = { prepare: exports.prepareMobileOverlay, cleanups: [], viewport };
      })();` });

      for (const width of mobile ? [390, 844] : [1366]) {
        await page.setViewportSize({ width, height: width === 844 ? 390 : 900 });
        const styles = await page.locator("main input, main select, main textarea, [contenteditable]").evaluateAll(
          (elements) => elements.map((element) => parseFloat(getComputedStyle(element).fontSize)),
        );
        if (mobile) assert.ok(styles.every((size) => size >= 16), JSON.stringify(styles));
        else assert.equal(styles[0], 12);
        assert.equal(await page.locator("button").first().evaluate(
          (element) => getComputedStyle(element).touchAction,
        ), "manipulation");
      }

      await page.evaluate(() => {
        const root = document.documentElement.style;
        root.setProperty("--safe-top", "44px");
        root.setProperty("--safe-bottom", "34px");
        root.setProperty("--safe-left", "47px");
        root.setProperty("--safe-right", "47px");
      });
      const safe = await page.evaluate(() => ({
        header: document.querySelector("header")!.getBoundingClientRect().height,
        left: getComputedStyle(document.querySelector("main")!).paddingLeft,
        bottom: getComputedStyle(document.querySelector("main")!).paddingBottom,
        overflow: document.documentElement.scrollWidth > document.documentElement.clientWidth,
      }));
      assert.equal(safe.header, 100);
      assert.equal(safe.left, "47px");
      assert.equal(safe.bottom, "34px");
      assert.equal(safe.overflow, false);

      await page.evaluate(() => {
        document.body.style.setProperty("padding-right", "7px", "important");
        document.body.style.color = "rgb(255, 255, 255)";
        window.scrollTo(0, 600);
      });
      const position = await page.evaluate(() => scrollY);
      assert.equal(position, 600);
      await page.evaluate(() => {
        const overlay = document.getElementById("overlay")!;
        overlay.hidden = false;
        window.mobileUi.cleanups.push(window.mobileUi.prepare(overlay));
      });
      assert.equal(await page.evaluate(() => document.body.style.position), "fixed");
      await page.evaluate(() => {
        Object.assign(window.mobileUi.viewport, { height: 320, offsetTop: 24 });
        window.mobileUi.viewport.dispatchEvent(new Event("resize"));
      });
      await page.waitForFunction(() => document.getElementById("overlay")!.style.getPropertyValue("--overlay-height") === "320px");
      const bounds = await page.locator("#overlay").boundingBox();
      assert.ok(bounds);
      assert.equal(bounds.height, 320);
      assert.equal(bounds.y, 24);
      await page.locator("#last").scrollIntoViewIfNeeded();
      assert.ok(await page.locator("#overlay").evaluate((element) => element.scrollTop > 0));

      await page.evaluate(() => {
        window.mobileUi.viewport.scale = 2;
        window.mobileUi.viewport.dispatchEvent(new Event("resize"));
      });
      await page.waitForFunction(() => !document.getElementById("overlay")!.style.getPropertyValue("--overlay-height"));
      await page.evaluate(() => {
        window.mobileUi.cleanups.push(window.mobileUi.prepare(document.getElementById("overlay")!));
        window.mobileUi.cleanups.shift()!();
      });
      assert.equal(await page.evaluate(() => document.body.style.position), "fixed");
      await page.evaluate(() => {
        window.mobileUi.cleanups.pop()!();
        document.getElementById("overlay")!.hidden = true;
        document.getElementById("trigger")!.focus({ preventScroll: true });
      });
      const restored = await page.evaluate(() => ({
        position: document.body.style.position,
        scroll: scrollY,
        padding: document.body.style.getPropertyValue("padding-right"),
        priority: document.body.style.getPropertyPriority("padding-right"),
        color: document.body.style.color,
      }));
      assert.deepEqual(restored, {
        position: "", scroll: position, padding: "7px", priority: "important", color: "rgb(255, 255, 255)",
      });

      await page.evaluate(() => {
        Object.defineProperty(window, "visualViewport", { value: null });
        const cleanup = window.mobileUi.prepare(document.getElementById("overlay")!);
        cleanup();
      });
      assert.equal(await page.evaluate(() => document.body.style.position), "");
    });
  }
});
