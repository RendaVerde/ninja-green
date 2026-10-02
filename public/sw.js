const CACHE = "ninja-green-static-v2";
const STATIC_ASSETS = ["/manifest.webmanifest", "/favicon.svg"];

self.addEventListener("install", (event) => {
  event.waitUntil(caches.open(CACHE).then((cache) => cache.addAll(STATIC_ASSETS)));
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(caches.keys().then((keys) => Promise.all(keys.filter((key) => key !== CACHE).map((key) => caches.delete(key)))));
  self.clients.claim();
});

self.addEventListener("fetch", (event) => {
  if (event.request.method !== "GET") return;

  const url = new URL(event.request.url);
  const isStaticAsset =
    url.origin === self.location.origin && STATIC_ASSETS.includes(url.pathname);

  // Navegações e APIs podem conter dados de uma conta. Elas nunca entram no
  // cache compartilhado do PWA, evitando exibir dados de um usuário para outro.
  if (event.request.mode === "navigate" || url.pathname.startsWith("/api/")) {
    return;
  }

  if (isStaticAsset) {
    event.respondWith(
      caches.match(event.request).then((cached) => cached || fetch(event.request)),
    );
  }
});
