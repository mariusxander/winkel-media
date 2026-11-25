/* Service Worker — Panel de Supervisión (alcance: esta carpeta /admin/) */
const VERSION = 'vta-v12';
const SHELL_CACHE = 'vta-shell-' + VERSION;

const SHELL = ['./', 'index.html', 'manifest.json', '../icons/admin-192.png', '../icons/admin-512.png', '../icons/admin-apple-touch.png'];
const CDN = [
  'https://cdn.tailwindcss.com',
  'https://cdn.jsdelivr.net/npm/chart.js@4.4.1/dist/chart.umd.js'
];

self.addEventListener('install', event => {
  event.waitUntil((async () => {
    const cache = await caches.open(SHELL_CACHE);
    await Promise.all(SHELL.map(u => cache.add(u).catch(() => {})));
    await Promise.all(CDN.map(async u => {
      try { await cache.put(u, await fetch(new Request(u, { mode: 'no-cors' }))); } catch (_) {}
    }));
    await self.skipWaiting();
  })());
});

self.addEventListener('activate', event => {
  event.waitUntil((async () => {
    const keys = await caches.keys();
    await Promise.all(keys.filter(k => k.startsWith('vta-shell-') && k !== SHELL_CACHE).map(k => caches.delete(k)));
    await self.clients.claim();
  })());
});

async function staleWhileRevalidate(req) {
  const cache = await caches.open(SHELL_CACHE);
  const cached = await cache.match(req);
  const network = fetch(req).then(res => {
    if (res && (res.ok || res.type === 'opaque')) cache.put(req, res.clone());
    return res;
  }).catch(() => null);
  return cached || (await network) || Response.error();
}

self.addEventListener('fetch', event => {
  const req = event.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);

  // La API (Apps Script), Drive y las teselas de mapa nunca se interceptan
  if (/(^|\.)script\.google\.com$|(^|\.)googleusercontent\.com$|(^|\.)drive\.google\.com$/.test(url.hostname)) return;

  // Navegación: red primero y, sin conexión, la última versión guardada
  if (req.mode === 'navigate') {
    const scopePath = new URL(self.registration.scope).pathname;
    if (url.pathname !== scopePath && url.pathname !== scopePath + 'index.html') return;
    event.respondWith((async () => {
      try {
        const res = await fetch(req);
        const cache = await caches.open(SHELL_CACHE);
        cache.put('index.html', res.clone());
        return res;
      } catch (_) {
        return (await caches.match(req)) || (await caches.match('index.html')) || (await caches.match('./')) || Response.error();
      }
    })());
    return;
  }

  // Estáticos propios y librerías CDN
  if (url.origin === self.location.origin || CDN.includes(req.url)) {
    event.respondWith(staleWhileRevalidate(req));
  }
});
