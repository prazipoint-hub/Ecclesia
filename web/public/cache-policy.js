/* Single source of truth for what the service worker may cache.
 * Loaded by sw.js through importScripts, and by the unit tests, so the two cannot drift apart.
 * Church data must never reach the cache: anything under /api/ and anything carrying credentials goes straight to the network. */
(function (root) {
  var STATIC_PREFIXES = ['/assets/', '/icons/'];
  var STATIC_FILES = ['/manifest.webmanifest', '/offline.html', '/favicon.svg'];

  /**
   * @param {{ url: string, method?: string, mode?: string, hasAuthorization?: boolean, origin: string }} req
   * @returns {'bypass' | 'cache-first' | 'navigate'}
   */
  function decide(req) {
    var method = (req.method || 'GET').toUpperCase();
    if (method !== 'GET') return 'bypass';
    if (req.hasAuthorization) return 'bypass';
    var url;
    try { url = new URL(req.url, req.origin); } catch (e) { return 'bypass'; }
    if (url.origin !== req.origin) return 'bypass';
    var path = url.pathname;
    if (path === '/api' || path.indexOf('/api/') === 0) return 'bypass';
    if (path === '/sw.js' || path === '/cache-policy.js') return 'bypass';
    if (req.mode === 'navigate') return 'navigate';
    if (STATIC_FILES.indexOf(path) !== -1) return 'cache-first';
    for (var i = 0; i < STATIC_PREFIXES.length; i++) if (path.indexOf(STATIC_PREFIXES[i]) === 0) return 'cache-first';
    return 'bypass';
  }

  root.EcclesiaCachePolicy = { decide: decide, CACHE_PREFIX: 'ecclesia-shell-' };
})(typeof self !== 'undefined' ? self : this);
