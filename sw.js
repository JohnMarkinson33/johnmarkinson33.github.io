// finTB service worker — MUSÍ byť samostatný súbor (blob:/inline Chrome odmieta)
const CACHE = 'fintb-v148';
const CORE = ['./', './index.html', './manifest.json', './icon-192.png', './icon-512.png'];

self.addEventListener('install', e => {
  e.waitUntil((async () => {
    const c = await caches.open(CACHE);
    // POZOR: c.addAll() je ATOMICKÝ — jeden 404 vyprázdni celý cache.
    // Preto cachujeme po jednom a zlyhanie len zalogujeme.
    await Promise.all(CORE.map(u =>
      c.add(new Request(u, { cache: 'reload' }))
       .catch(err => console.warn('SW: nepodarilo sa cachovať', u, err && err.message))
    ));
    await self.skipWaiting();
  })());
});

self.addEventListener('activate', e => {
  e.waitUntil((async () => {
    const ks = await caches.keys();
    await Promise.all(ks.filter(k => k !== CACHE).map(k => caches.delete(k)));
    await self.clients.claim();
  })());
});

// Network-first pre vlastné súbory → po deploy vždy najnovšia verzia.
// Cache = offline záloha. CDN (SheetJS) a Google idú priamo na sieť.
self.addEventListener('fetch', e => {
  const req = e.request;
  if (req.method !== 'GET') return;

  let url;
  try { url = new URL(req.url); } catch (_) { return; }
  if (url.origin !== self.location.origin) return;

  e.respondWith((async () => {
    try {
      const res = await fetch(req);
      if (res && res.status === 200 && res.type === 'basic') {
        const copy = res.clone();
        caches.open(CACHE).then(c => c.put(req, copy)).catch(() => {});
      }
      return res;
    } catch (_) {
      const hit = await caches.match(req);
      if (hit) return hit;
      // navigácia offline → vráť appku
      if (req.mode === 'navigate') {
        const shell = await caches.match('./index.html') || await caches.match('./');
        if (shell) return shell;
      }
      return new Response('Offline', { status: 503, statusText: 'Offline' });
    }
  })());
});
