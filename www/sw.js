/* ===================================================
   sw.js — Service Worker pour fonctionnement hors-ligne
   =================================================== */

const CACHE_NAME = 'stpro-v2';
const ASSETS = [
  '/',
  '/index.html',
  '/css/style.css',
  '/js/db.js',
  '/js/receipt.js',
  '/js/orders.js',
  '/js/clients.js',
  '/js/map.js',
  '/js/app.js',
  '/manifest.json'
];

/* ---- Installation ---- */
self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => {
      return cache.addAll(ASSETS).catch(() => {
        // Ignorer si certains fichiers ne sont pas disponibles
      });
    })
  );
  self.skipWaiting();
});

/* ---- Activation ---- */
self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(
        keys
          .filter((key) => key !== CACHE_NAME)
          .map((key) => caches.delete(key))
      )
    )
  );
  self.clients.claim();
});

/* ---- Fetch : Cache-first pour les assets, réseau pour le reste ---- */
self.addEventListener('fetch', (event) => {
  // Ignorer les requêtes non-GET et les requêtes externes
  if (event.request.method !== 'GET') return;
  if (!event.request.url.startsWith(self.location.origin)) return;

  event.respondWith(
    caches.match(event.request).then((cached) => {
      if (cached) return cached;

      return fetch(event.request).then((response) => {
        // Mettre en cache les nouvelles ressources
        if (response.status === 200) {
          const clone = response.clone();
          caches.open(CACHE_NAME).then((cache) => {
            cache.put(event.request, clone);
          });
        }
        return response;
      }).catch(() => {
        // Retourner l'index pour les navigations
        if (event.request.mode === 'navigate') {
          return caches.match('/index.html');
        }
      });
    })
  );
});
