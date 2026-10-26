const CACHE = 'devworkspace-pro-shell-v3';

const scopeRoot = new URL('./', self.registration.scope);
const INDEX_URL = new URL('index.html', scopeRoot).href;

const APP_SHELL = [
  scopeRoot.href,
  INDEX_URL
];

self.addEventListener('install', event => {
  event.waitUntil(
    caches.open(CACHE)
      .then(cache => cache.addAll(APP_SHELL))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys()
      .then(keys =>
        Promise.all(
          keys
            .filter(key => key !== CACHE)
            .map(key => caches.delete(key))
        )
      )
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', event => {
  const request = event.request;

  if (request.method !== 'GET') return;

  const requestUrl = new URL(request.url);

  if (requestUrl.origin !== self.location.origin) return;

  event.respondWith((async () => {
    const cached = await caches.match(request);

    if (cached) return cached;

    try {
      const response = await fetch(request);

      if (response.ok && response.type === 'basic') {
        const cache = await caches.open(CACHE);
        await cache.put(request, response.clone());
      }

      return response;
    } catch (error) {
      if (request.mode === 'navigate') {
        const fallback = await caches.match(INDEX_URL);

        if (fallback) return fallback;
      }

      throw error;
    }
  })());
});
