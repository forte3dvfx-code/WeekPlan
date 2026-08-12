/* sw.js — service worker.
 *
 * IMPORTANTE: incrementa CACHE_VERSAO sempre que alterares qualquer ficheiro.
 * Sem isso o telemóvel continua a servir a versão antiga da cache.
 * Depois de publicar, abre a app duas vezes: a primeira instala o novo
 * service worker, a segunda passa a usá-lo.
 */
const CACHE_VERSAO = 'cadencia-v1';

const FICHEIROS = [
  './',
  './index.html',
  './manifest.json',
  './css/style.css',
  './js/dates.js',
  './js/db.js',
  './js/schedule.js',
  './js/store.js',
  './js/export.js',
  './js/charts.js',
  './js/ui-sheet.js',
  './js/ui-hoje.js',
  './js/ui-semana.js',
  './js/ui-evolucao.js',
  './js/ui-definicoes.js',
  './js/app.js',
  './icons/icon-192.png',
  './icons/icon-512.png'
];

self.addEventListener('install', (evento) => {
  evento.waitUntil(
    caches.open(CACHE_VERSAO)
      // addAll falha inteiro se um ficheiro faltar; o map individual é tolerante
      .then((cache) => Promise.all(
        FICHEIROS.map((f) => cache.add(f).catch(() => null))
      ))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', (evento) => {
  evento.waitUntil(
    caches.keys()
      .then((chaves) => Promise.all(
        chaves.filter((c) => c !== CACHE_VERSAO).map((c) => caches.delete(c))
      ))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (evento) => {
  if (evento.request.method !== 'GET') return;
  evento.respondWith(
    caches.match(evento.request).then((resposta) => {
      if (resposta) return resposta;
      return fetch(evento.request).then((rede) => {
        // guarda o que for novo, para funcionar offline na próxima vez
        if (rede && rede.status === 200 && rede.type === 'basic') {
          const copia = rede.clone();
          caches.open(CACHE_VERSAO).then((cache) => cache.put(evento.request, copia));
        }
        return rede;
      }).catch(() => caches.match('./index.html'));
    })
  );
});
