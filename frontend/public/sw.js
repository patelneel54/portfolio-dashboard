const STATIC_CACHE = 'portfolio-v2';
const API_CACHE = 'portfolio-api-v1';
const FONT_CACHE = 'google-fonts-v1';
const STATIC_ASSETS = [
  '/',
  '/index.html',
  '/manifest.json',
];
const SWR_PATHS = ['/api/holdings', '/api/settings'];

async function cacheWithTimestamp(cache, request, response) {
  const body = await response.clone().arrayBuffer();
  const headers = new Headers(response.headers);
  headers.set('X-SW-Cached-At', String(Date.now()));
  const timestamped = new Response(body, {
    status: response.status,
    statusText: response.statusText,
    headers,
  });
  await cache.put(request, timestamped);
}

async function notifyClients(data) {
  const clients = await self.clients.matchAll({ type: 'window' });
  clients.forEach((client) => client.postMessage(data));
}

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(STATIC_CACHE).then((cache) => cache.addAll(STATIC_ASSETS))
  );
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  const keep = new Set([STATIC_CACHE, API_CACHE, FONT_CACHE]);
  event.waitUntil(
    caches.keys().then((names) => {
      const toDelete = names.filter((n) => !keep.has(n));
      return Promise.all(toDelete.map((n) => caches.delete(n)))
        .then(() => self.clients.claim())
        .then(() => {
          if (toDelete.length > 0) {
            return notifyClients({ type: 'SW_UPDATED' });
          }
        });
    })
  );
});

self.addEventListener('fetch', (event) => {
  const { request } = event;
  const url = new URL(request.url);

  // Stale-while-revalidate for holdings and settings
  if (request.method === 'GET' && SWR_PATHS.includes(url.pathname)) {
    event.respondWith(
      caches.open(API_CACHE).then((cache) => {
        return cache.match(request).then((cachedResponse) => {
          const fetchPromise = fetch(request.clone())
            .then(async (networkResponse) => {
              if (networkResponse.ok) {
                // Compare with cached version to detect changes
                if (cachedResponse) {
                  const [cachedBody, freshBody] = await Promise.all([
                    cachedResponse.clone().text(),
                    networkResponse.clone().text(),
                  ]);
                  await cacheWithTimestamp(cache, request, networkResponse);
                  if (cachedBody !== freshBody) {
                    notifyClients({ type: 'API_UPDATED', url: url.pathname });
                  }
                } else {
                  await cacheWithTimestamp(cache, request, networkResponse);
                }
              }
              return networkResponse;
            })
            .catch(() => null);

          if (cachedResponse) {
            // Serve stale immediately, revalidate in background
            event.waitUntil(fetchPromise);
            const cachedAt = parseInt(cachedResponse.headers.get('X-SW-Cached-At') || '0', 10);
            if (cachedAt) {
              event.waitUntil(
                notifyClients({ type: 'API_CACHED_AT', url: url.pathname, cachedAt })
              );
            }
            return cachedResponse;
          }

          // No cache (first visit) — wait for network
          return fetchPromise.then((resp) => resp || new Response('Offline', { status: 503 }));
        });
      })
    );
    return;
  }

  // Network-first for other API calls
  if (url.pathname.startsWith('/api/')) {
    event.respondWith(
      fetch(request).catch(() => caches.match(request))
    );
    return;
  }

  // Network-first for navigation (HTML pages)
  if (request.mode === 'navigate') {
    event.respondWith(
      fetch(request).catch(() => caches.match('/index.html'))
    );
    return;
  }

  // Cache-first for Google Fonts
  if (url.hostname === 'fonts.googleapis.com' || url.hostname === 'fonts.gstatic.com') {
    event.respondWith(
      caches.open(FONT_CACHE).then((cache) =>
        cache.match(request).then((cached) => {
          if (cached) return cached;
          return fetch(request).then((response) => {
            if (response.ok) cache.put(request, response.clone());
            return response;
          });
        })
      )
    );
    return;
  }

  // Cache-first for static assets
  event.respondWith(
    caches.match(request).then((cached) => {
      if (cached) return cached;
      return fetch(request).then((response) => {
        if (response.ok && request.url.startsWith(self.location.origin)) {
          const clone = response.clone();
          caches.open(STATIC_CACHE).then((cache) => cache.put(request, clone));
        }
        return response;
      });
    })
  );
});
