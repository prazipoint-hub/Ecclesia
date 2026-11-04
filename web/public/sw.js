/* Ecclesia service worker: keeps the app shell available offline.
 * It never stores API responses or authenticated requests (see cache-policy.js). */
importScripts('/cache-policy.js');

var VERSION = 'v1';
var POLICY = self.EcclesiaCachePolicy;
var CACHE = POLICY.CACHE_PREFIX + VERSION;
var PRECACHE = ['/offline.html', '/manifest.webmanifest', '/favicon.svg', '/icons/icon-192.svg', '/icons/icon-512.svg'];

self.addEventListener('install', function (event) {
  event.waitUntil(caches.open(CACHE).then(function (cache) { return cache.addAll(PRECACHE); }).then(function () { return self.skipWaiting(); }));
});

self.addEventListener('activate', function (event) {
  event.waitUntil(
    caches.keys().then(function (keys) {
      return Promise.all(keys.filter(function (k) { return k.indexOf(POLICY.CACHE_PREFIX) === 0 && k !== CACHE; }).map(function (k) { return caches.delete(k); }));
    }).then(function () { return self.clients.claim(); })
  );
});

self.addEventListener('fetch', function (event) {
  var request = event.request;
  var action = POLICY.decide({
    url: request.url, method: request.method, mode: request.mode,
    hasAuthorization: request.headers.has('Authorization'), origin: self.location.origin,
  });
  if (action === 'bypass') return;

  if (action === 'navigate') {
    // Network first so a deploy shows up at once; the offline page is only the fallback.
    event.respondWith(fetch(request).catch(function () { return caches.match('/offline.html'); }));
    return;
  }

  event.respondWith(
    caches.match(request).then(function (hit) {
      if (hit) return hit;
      return fetch(request).then(function (response) {
        if (response && response.ok && response.type === 'basic') {
          var copy = response.clone();
          caches.open(CACHE).then(function (cache) { cache.put(request, copy); });
        }
        return response;
      });
    })
  );
});
