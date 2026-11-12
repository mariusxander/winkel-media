/* Service Worker — Visitas Técnicas PWA */
const VERSION = 'vt-v1';
const SHELL_CACHE = 'vt-shell-' + VERSION;
const TILE_CACHE = 'vt-tiles-v1';
const MAX_TILES = 400;

const SHELL = ['./', 'index.html', 'manifest.json', 'icons/icon-192.png', 'icons/icon-512.png', 'icons/apple-touch-icon.png'];
const CDN = [
  'https://cdn.tailwindcss.com',
  'https://unpkg.com/leaflet@1.9.4/dist/leaflet.css',
  'https://unpkg.com/leaflet@1.9.4/dist/leaflet.js'
];

self.addEventListener('install', event => {
  event.waitUntil((async () => {
    const cache = await caches.open(SHELL_CACHE);
    await Promise.all(SHELL.map(u => cache.add(u).catch(() => {})));
    // Recursos de CDN: respuestas opacas (no-cors), igual que las etiquetas <script>/<link>
    await Promise.all(CDN.map(async u => {
      try { await cache.put(u, await fetch(new Request(u, { mode: 'no-cors' }))); } catch (_) {}
    }));
    await self.skipWaiting();
  })());
});

self.addEventListener('activate', event => {
  event.waitUntil((async () => {
    const keys = await caches.keys();
    await Promise.all(keys.filter(k => k.startsWith('vt-shell-') && k !== SHELL_CACHE).map(k => caches.delete(k)));
    await self.clients.claim();
  })());
});

async function trimCache(name, max) {
  const cache = await caches.open(name);
  const keys = await cache.keys();
  if (keys.length > max) await Promise.all(keys.slice(0, keys.length - max).map(k => cache.delete(k)));
}

async function staleWhileRevalidate(req, cacheName) {
  const cache = await caches.open(cacheName);
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

  // La API (Apps Script) y las imágenes de Drive nunca se interceptan
  if (/(^|\.)script\.google\.com$|(^|\.)googleusercontent\.com$|(^|\.)drive\.google\.com$/.test(url.hostname)) return;

  // Navegación: red primero, con respaldo offline
  if (req.mode === 'navigate') {
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

  // Teselas del mapa: caché primero
  if (url.hostname === 'tile.openstreetmap.org') {
    event.respondWith((async () => {
      const cache = await caches.open(TILE_CACHE);
      const hit = await cache.match(req);
      if (hit) return hit;
      try {
        const res = await fetch(req);
        if (res && (res.ok || res.type === 'opaque')) { cache.put(req, res.clone()); trimCache(TILE_CACHE, MAX_TILES); }
        return res;
      } catch (_) { return Response.error(); }
    })());
    return;
  }

  // Estáticos propios y librerías CDN
  if (url.origin === self.location.origin || CDN.includes(req.url)) {
    event.respondWith(staleWhileRevalidate(req, SHELL_CACHE));
  }
});
