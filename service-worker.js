const CACHE_NAME = 'gyrograf-v1.0.35';

const ASSETS = [
  './',
  './index.html',
  './styles.css',
  './app.js',
  './manifest.json',
  './images/logo.png',
  './images/appIcon_180.png',
  './images/appIcon_192.png',
  './images/appIcon_512.png'
];

const NETWORK_TIMEOUT_MS = 3000;
const BACKGROUND_REFRESH_DELAY_MS = 8000;

function fetchWithTimeout(request, timeoutMs) {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeoutMs);
  return fetch(request, { signal: controller.signal })
    .finally(() => clearTimeout(timeoutId));
}

async function updateCacheInBackground(request) {
  try {
    const cache = await caches.open(CACHE_NAME);
    const response = await fetchWithTimeout(request, NETWORK_TIMEOUT_MS);
    if (response && response.ok) {
      await cache.put(request, response.clone());
    }
  } catch {
    // Ignore background refresh errors.
  }
}

function toScopeUrl(path) {
  return new URL(path, self.registration.scope).href;
}

async function getCachedShell() {
  const cache = await caches.open(CACHE_NAME);
  for (const candidate of [toScopeUrl('./index.html'), toScopeUrl('./')]) {
    const match = await cache.match(candidate, { ignoreSearch: true });
    if (match) return match;
  }
  return null;
}

// Install: pre-cache all app assets so the app works fully offline immediately.
self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) =>
      cache.addAll(ASSETS.map((asset) => toScopeUrl(asset)))
    )
  );
  self.skipWaiting();
});

// Activate: delete any old caches from previous versions.
self.addEventListener('activate', (event) => {
  event.waitUntil((async () => {
    const cacheNames = await caches.keys();
    await Promise.all(
      cacheNames
        .filter((name) => name !== CACHE_NAME)
        .map((name) => caches.delete(name))
    );
  })());
  self.clients.claim();
});

self.addEventListener('message', (event) => {
  if (event?.data?.type === 'SKIP_WAITING') {
    self.skipWaiting();
  }
});

self.addEventListener('fetch', (event) => {
  const { request } = event;
  if (request.method !== 'GET') return;

  const url = new URL(request.url);
  const isSameOrigin = url.origin === self.location.origin;
  const isNavigation = request.mode === 'navigate';
  const isStaticAsset = ['script', 'style', 'image', 'font'].includes(request.destination);

  // Navigation requests: serve from cache instantly, refresh in background.
  if (isNavigation && isSameOrigin) {
    event.respondWith((async () => {
      const cache = await caches.open(CACHE_NAME);
      const cached = await cache.match(request, { ignoreSearch: true });
      if (cached) {
        setTimeout(() => updateCacheInBackground(request), BACKGROUND_REFRESH_DELAY_MS);
        return cached;
      }
      try {
        return await fetchWithTimeout(request, NETWORK_TIMEOUT_MS);
      } catch {
        const shell = await getCachedShell();
        if (shell) return shell;
        throw new Error('Offline and no cached shell available');
      }
    })());
    return;
  }

  // Static assets: cache-first with background refresh so updates arrive silently.
  if (isSameOrigin && isStaticAsset) {
    event.respondWith((async () => {
      const cache = await caches.open(CACHE_NAME);
      const cached = await cache.match(request, { ignoreSearch: true });
      if (cached) {
        setTimeout(() => updateCacheInBackground(request), BACKGROUND_REFRESH_DELAY_MS);
        return cached;
      }
      const response = await fetchWithTimeout(request, NETWORK_TIMEOUT_MS);
      if (response && response.ok) cache.put(request, response.clone());
      return response;
    })());
    return;
  }
});
