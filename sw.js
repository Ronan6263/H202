/* Peroxide Log offline cache */
const VERSION = "h2o2-v6";
const PDFJS = "https://cdn.jsdelivr.net/npm/pdfjs-dist@3.11.174/";
const APP_FILES = ["./", "./index.html", "./manifest.webmanifest", "./icon-192.png", "./icon-512.png", "./apple-touch-icon.png"];
const LIB_FILES = [
  "build/pdf.min.js", "build/pdf.worker.min.js",
  "standard_fonts/FoxitSans.pfb", "standard_fonts/FoxitSansBold.pfb",
  "standard_fonts/FoxitSansItalic.pfb", "standard_fonts/FoxitSansBoldItalic.pfb",
  "standard_fonts/LiberationSans-Regular.ttf", "standard_fonts/LiberationSans-Bold.ttf"
].map((f) => PDFJS + f);

self.addEventListener("install", (e) => {
  e.waitUntil((async () => {
    const c = await caches.open(VERSION);
    await c.addAll(APP_FILES);
    // Library files are best-effort; the app works without the preview.
    await Promise.all(LIB_FILES.map((u) => c.add(new Request(u, { mode: "cors" })).catch(() => {})));
    self.skipWaiting();
  })());
});

self.addEventListener("activate", (e) => {
  e.waitUntil((async () => {
    for (const k of await caches.keys()) if (k !== VERSION) await caches.delete(k);
    await self.clients.claim();
  })());
});

// Tapping a timer notification brings the app to the front.
self.addEventListener("notificationclick", (e) => {
  e.notification.close();
  e.waitUntil((async () => {
    const all = await self.clients.matchAll({ type: "window", includeUncontrolled: true });
    for (const c of all) if ("focus" in c) return c.focus();
    return self.clients.openWindow("./");
  })());
});

self.addEventListener("fetch", (e) => {
  const req = e.request;
  if (req.method !== "GET") return;
  const url = new URL(req.url);

  // App page: network first so updates arrive, cache when offline.
  if (req.mode === "navigate" || (url.origin === location.origin && /\/(index\.html)?$/.test(url.pathname))) {
    e.respondWith((async () => {
      const c = await caches.open(VERSION);
      try {
        const res = await fetch(req);
        if (res.ok) c.put("./index.html", res.clone());
        return res;
      } catch (_) {
        return (await c.match("./index.html")) || (await c.match("./")) || Response.error();
      }
    })());
    return;
  }

  // pdf.js and same-origin assets: cache first.
  if (url.href.startsWith(PDFJS) || url.origin === location.origin) {
    e.respondWith((async () => {
      const c = await caches.open(VERSION);
      const hit = await c.match(req);
      if (hit) return hit;
      try {
        const res = await fetch(req);
        if (res.ok || res.type === "opaque") c.put(req, res.clone());
        return res;
      } catch (_) {
        return Response.error();
      }
    })());
  }
});
