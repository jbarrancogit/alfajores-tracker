const CACHE_NAME = 'alfajores-v17';
const STATIC_ASSETS = [
  './',
  './index.html',
  './css/styles.css',
  './js/supabase.js',
  './js/auth.js',
  './js/app.js',
  './js/puntos.js',
  './js/tipos.js',
  './js/pagos.js',
  './js/entregas.js',
  './js/dashboard.js',
  './js/historial.js',
  './js/analisis.js',
  './js/excel.js',
  './js/config.js',
  './js/ruta.js',
  './js/portal.js',
  './manifest.json'
];

self.addEventListener('install', (e) => {
  e.waitUntil(
    caches.open(CACHE_NAME)
      .then((cache) => cache.addAll(STATIC_ASSETS))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.filter((k) => k !== CACHE_NAME).map((k) => caches.delete(k)))
    ).then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (e) => {
  if (e.request.url.includes('supabase.co')) return;
  if (e.request.url.includes('cdn.sheetjs.com')) return;
  if (e.request.url.includes('cdn.jsdelivr.net')) return;
  if (e.request.url.includes('unpkg.com')) return;
  if (e.request.url.includes('tile.openstreetmap.org')) return;
  e.respondWith(
    caches.match(e.request).then((cached) => cached || fetch(e.request))
  );
});
