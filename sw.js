// Prosty service worker: strona zawsze próbuje pobrać świeże dane z sieci,
// a gdy nie ma internetu, pokazuje ostatnią zapamiętaną wersję.
const CACHE = 'typerzy-v2';
const PRECACHE = ['/', '/kupony/', '/pwa.js', '/manifest.webmanifest', '/icon-192.png'];

self.addEventListener('install', event => {
  event.waitUntil(
    caches.open(CACHE).then(cache =>
      Promise.allSettled(PRECACHE.map(url => cache.add(url)))
    ).then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys()
      .then(keys => Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', event => {
  const req = event.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  // Dane z Google Arkuszy, czcionki, statystyki: zawsze prosto z sieci
  if (url.origin !== self.location.origin) return;

  event.respondWith(
    fetch(req)
      .then(res => {
        if (res && res.ok) {
          const copy = res.clone();
          caches.open(CACHE).then(c => c.put(req, copy));
        }
        return res;
      })
      .catch(() =>
        caches.match(req).then(hit => hit || (req.mode === 'navigate' ? caches.match('/') : Response.error()))
      )
  );
});
