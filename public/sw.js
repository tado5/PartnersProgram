/* Online-only: no Cache Storage, API interception or offline user data. */
self.addEventListener("install", (event) => {
  event.waitUntil(self.skipWaiting());
});

self.addEventListener("activate", (event) => {
  event.waitUntil(self.clients.claim());
});

self.addEventListener("fetch", (event) => {
  if (event.request.mode !== "navigate" || event.request.method !== "GET") return;
  event.respondWith(
    fetch(event.request, { cache: "no-store" }).catch(() => new Response(
      `<!doctype html><html lang="sk"><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>PartnersProgram — bez pripojenia</title><body><main><h1>Nie ste pripojení na internet</h1><p>PartnersProgram potrebuje internetové pripojenie. Skontrolujte Wi-Fi alebo mobilné dáta a obnovte stránku.</p><a href="/login">Skúsiť znova</a></main></body></html>`,
      { status: 503, headers: { "Content-Type": "text/html; charset=utf-8", "Cache-Control": "no-store", "Content-Security-Policy": "default-src 'none'; base-uri 'none'; frame-ancestors 'none'" } },
    )),
  );
});
