// Service Worker for Aspen's Playground PWA
// Update this version when deploying significant changes
const CACHE_VERSION = 4;
const CACHE_NAME = `aspens-playground-v${CACHE_VERSION}`;
const OFFLINE_URL = '/offline.html';

// Assets to cache on install
const ASSETS_TO_CACHE = [
    '/',
    '/index.html',
    '/game.js',
    '/modules/GameCore.js',
    '/manifest.json',
    '/privacy.html',
    '/terms.html',
    '/robots.txt',
    '/sitemap.xml',
    '/modules/config.js',
    '/modules/ui.js',
    '/modules/maps/MapManager.js',
    '/modules/maps/BaseMap.js',
    '/modules/maps/DiningHallMap.js',
    '/modules/maps/ArcadeZoneMap.js',
    '/modules/maps/BackstageMap.js',
    '/modules/maps/KitchenMap.js',
    '/modules/maps/PartyRoomMap.js'
];

// Install event - cache core assets
self.addEventListener('install', (event) => {
    console.log('[ServiceWorker] Installing...');
    event.waitUntil(
        caches.open(CACHE_NAME)
            .then((cache) => {
                console.log('[ServiceWorker] Caching core assets');
                return cache.addAll(ASSETS_TO_CACHE);
            })
            .then(() => {
                console.log('[ServiceWorker] Install complete');
                return self.skipWaiting();
            })
            .catch((error) => {
                console.error('[ServiceWorker] Install failed:', error);
            })
    );
});

// Activate event - clean up old caches and notify clients
self.addEventListener('activate', (event) => {
    console.log('[ServiceWorker] Activating...');
    event.waitUntil(
        caches.keys()
            .then((cacheNames) => {
                const oldCaches = cacheNames.filter(name => name !== CACHE_NAME);
                if (oldCaches.length > 0) {
                    console.log('[ServiceWorker] Cleaning old caches:', oldCaches);
                }
                return Promise.all(
                    oldCaches.map((cacheName) => {
                        console.log('[ServiceWorker] Deleting old cache:', cacheName);
                        return caches.delete(cacheName);
                    })
                );
            })
            .then(() => {
                console.log('[ServiceWorker] Activate complete');
                // Notify all clients that a new version is available
                return self.clients.matchAll().then(clients => {
                    clients.forEach(client => {
                        client.postMessage({ type: 'SW_UPDATED', version: CACHE_VERSION });
                    });
                });
            })
            .then(() => {
                return self.clients.claim();
            })
    );
});

// Fetch event - serve from cache, fallback to network
self.addEventListener('fetch', (event) => {
    const url = new URL(event.request.url);

    // Skip WebSocket connections
    if (url.protocol === 'wss:' || url.protocol === 'ws:') {
        return;
    }

    // Skip non-GET requests
    if (event.request.method !== 'GET') {
        return;
    }

    // Skip external CDN requests - let browser handle them directly
    if (url.hostname !== self.location.hostname) {
        return;
    }

    // For navigation requests (HTML pages)
    if (event.request.mode === 'navigate') {
        event.respondWith(
            fetch(event.request)
                .catch(() => {
                    // If offline, try to serve cached index or offline page
                    return caches.match('/index.html')
                        .then((response) => {
                            if (response) {
                                return response;
                            }
                            // Could serve an offline.html page here if we had one
                            return new Response(
                                '<!DOCTYPE html><html><head><title>Offline</title></head><body style="background:#1a0a0a;color:#fff;font-family:sans-serif;display:flex;justify-content:center;align-items:center;height:100vh;margin:0;"><div style="text-align:center;"><h1>You are offline</h1><p>Please check your internet connection and try again.</p></div></body></html>',
                                { headers: { 'Content-Type': 'text/html' } }
                            );
                        });
                })
        );
        return;
    }

    // For other requests - cache first, then network
    event.respondWith(
        caches.match(event.request)
            .then((cachedResponse) => {
                if (cachedResponse) {
                    // Return cached version and update cache in background
                    event.waitUntil(
                        fetch(event.request)
                            .then((networkResponse) => {
                                if (networkResponse && networkResponse.status === 200) {
                                    caches.open(CACHE_NAME)
                                        .then((cache) => {
                                            cache.put(event.request, networkResponse);
                                        });
                                }
                            })
                            .catch(() => {
                                // Network failed, but we already returned cached version
                            })
                    );
                    return cachedResponse;
                }

                // Not in cache - try network
                return fetch(event.request)
                    .then((networkResponse) => {
                        // Cache successful responses
                        if (networkResponse && networkResponse.status === 200) {
                            const responseToCache = networkResponse.clone();
                            caches.open(CACHE_NAME)
                                .then((cache) => {
                                    cache.put(event.request, responseToCache);
                                });
                        }
                        return networkResponse;
                    })
                    .catch(() => {
                        // Network failed and not in cache
                        console.log('[ServiceWorker] Fetch failed for:', event.request.url);
                        return new Response('', { status: 503, statusText: 'Service Unavailable' });
                    });
            })
    );
});

// Handle messages from the main thread
self.addEventListener('message', (event) => {
    if (event.data === 'skipWaiting') {
        self.skipWaiting();
    }
});
