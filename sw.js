/* sw.js — funciona sem rede.
 *
 * Primeiro a rede, depois a cache: com rede vês sempre a versão nova;
 * sem rede, a última que ficou guardada. (Cache primeiro deixava versões
 * antigas presas no telemóvel.)
 * Sobe CACHE_NAME sempre que mudares um ficheiro.
 */
const CACHE_NAME = 'cadencia-v2';

const SHELL = [
  './',
  './index.html',
  './manifest.json',
  './css/style.css',
  './js/db.js',
  './js/drive.js',
  './js/app.js',
  './icons/icon-192.png',
  './icons/icon-512.png'
];

self.addEventListener('install', (ev) => {
  ev.waitUntil(
    caches.open(CACHE_NAME)
      .then((c) => Promise.all(SHELL.map((f) => c.add(f).catch(() => null))))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', (ev) => {
  ev.waitUntil(
    caches.keys()
      .then((ks) => Promise.all(ks.filter((k) => k !== CACHE_NAME).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (ev) => {
  const req = ev.request;
  // só os ficheiros da própria app; a Google (Drive) passa direto
  if (req.method !== 'GET' || new URL(req.url).origin !== location.origin) return;
  ev.respondWith(
    fetch(req)
      .then((r) => {
        if (r && r.status === 200) {
          const copia = r.clone();
          caches.open(CACHE_NAME).then((c) => c.put(req, copia));
        }
        return r;
      })
      .catch(() => caches.match(req).then((m) => m || caches.match('./index.html')))
  );
});
