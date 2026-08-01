// ============================================================
// Apiari v1.2 — Service Worker (cache offline + aggiornamenti)
// Copyright (c) 2026 Lazzaro Serva - Centola
// Via Tasso, 28 – 84051 CENTOLA (SA) – Italia
// http://www.graficaesiti.it/
// Tutti i diritti riservati – All rights reserved.
// ============================================================

const CACHE_NAME = 'apiari-v1.2';
const ASSETS = [
  './',
  './index.html',
  './style.css',
  './app.js',
  './manifest.json',
  './assets/icon-192.png',
  './assets/icon-512.png',
  './assets/icon-192-maskable.png',
  './assets/icon-512-maskable.png',
  './assets/apple-touch-icon.png',
  './assets/favicon.ico',
  './assets/favicon-32.png',
  './assets/favicon-16.png'
];

// ── Installazione: NON chiamare skipWaiting() qui. ──
// Il nuovo SW resta in stato "waiting" finché la pagina non lo autorizza
// tramite il messaggio SKIP_WAITING — così il banner di aggiornamento funziona.
self.addEventListener('install', event => {
  event.waitUntil(
    caches.open(CACHE_NAME).then(cache =>
      cache.addAll(ASSETS).catch(() =>
        cache.addAll(['./index.html', './manifest.json'])
      )
    )
  );
});

// ── Attivazione: pulizia cache vecchie ──
self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys().then(keys =>
      Promise.all(keys.filter(k => k !== CACHE_NAME).map(k => caches.delete(k)))
    ).then(() => self.clients.claim())
  );
});

// ── Fetch ──
// Le richieste di NAVIGAZIONE (apertura/refresh pagina) usano network-first:
// evita l'errore ERR_FAILED quando l'app installata su Android riapre una
// pagina cache-first ormai obsoleta. Tutte le altre risorse restano cache-first.
self.addEventListener('fetch', event => {
  if (event.request.method !== 'GET') return;

  if (event.request.mode === 'navigate') {
    event.respondWith(
      fetch(event.request)
        .then(r => {
          if (r && r.status === 200) {
            const clone = r.clone();
            caches.open(CACHE_NAME).then(c => c.put('./index.html', clone));
          }
          return r;
        })
        .catch(() => caches.match('./index.html'))
    );
    return;
  }

  event.respondWith(
    caches.match(event.request).then(cached => {
      if (cached) return cached;
      return fetch(event.request).then(r => {
        if (r && r.status === 200)
          caches.open(CACHE_NAME).then(c => c.put(event.request, r.clone()));
        return r;
      }).catch(() => undefined);
    })
  );
});

// ── Messaggi dalla pagina ──
self.addEventListener('message', event => {
  const { type } = event.data || {};
  if (type === 'SKIP_WAITING') {
    self.skipWaiting();
  }
});
