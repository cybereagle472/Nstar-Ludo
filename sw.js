const CACHE = 'nstar-ludo-v6';
const APP = [
  './','./index.html','./styles.css','./app.js','./engine.js','./auth.js','./supabase.js','./supabase-config.js','./vendor/supabase-js.mjs','./manifest.webmanifest',
  './assets/icons/brand.svg','./assets/icons/icon-192.png','./assets/icons/icon-512.png','./assets/fonts/roboto-latin.woff2',
  './assets/images/board.png','./assets/images/dice/1.png','./assets/images/dice/2.png','./assets/images/dice/3.png',
  './assets/images/dice/4.png','./assets/images/dice/5.png','./assets/images/dice/6.png','./assets/images/dice/draw.gif',
  './assets/sounds/roll_the_dice.mp3','./assets/sounds/move.wav','./assets/sounds/laugh.mp3'
];
self.addEventListener('install', event => event.waitUntil(caches.open(CACHE).then(cache => cache.addAll(APP)).then(() => self.skipWaiting())));
self.addEventListener('activate', event => event.waitUntil(caches.keys().then(keys => Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k)))).then(() => self.clients.claim())));
self.addEventListener('fetch', event => {
  const url = new URL(event.request.url);
  if (event.request.method !== 'GET' || url.origin !== self.location.origin || url.pathname.startsWith('/api/')) return;
  // Network first keeps updates fresh; the cached app is available without a connection.
  event.respondWith(fetch(event.request).then(response => {
    if (response.ok) caches.open(CACHE).then(cache => cache.put(event.request, response.clone()));
    return response;
  }).catch(() => caches.match(event.request).then(cached => cached || (event.request.mode === 'navigate' ? caches.match('./index.html') : Response.error()))));
});
