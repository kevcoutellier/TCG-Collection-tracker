// Service worker de PokéFolio : l'app s'ouvre sans réseau et affiche la dernière version des pages déjà
// consultées (lecture seule). Les écritures hors ligne sont gérées par Next (experimental.useOffline) :
// elles partent au retour du réseau.
//
// - Pages (navigations) : réseau d'abord, copie en cache si le réseau échoue, sinon /offline.html.
// - Fichiers statiques de Next (noms uniques par déploiement) et icônes : cache d'abord.
// - Tout le reste (actions serveur, requêtes RSC, autres domaines) passe sans intervention.

const STATIC = "pokefolio-static-v1";
const PAGES = "pokefolio-pages";
const OFFLINE_URL = "/offline.html";
const MAX_PAGES = 60;
const MAX_STATIC = 400;

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches
      .open(STATIC)
      .then((cache) => cache.add(OFFLINE_URL))
      .then(() => self.skipWaiting()),
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    (async () => {
      for (const key of await caches.keys()) {
        if (key.startsWith("pokefolio-static-") && key !== STATIC) await caches.delete(key);
      }
      await self.clients.claim();
    })(),
  );
});

/** Garde les `max` entrées les plus récentes d'un cache (les clés sont dans l'ordre d'insertion). */
async function trim(name, max) {
  const cache = await caches.open(name);
  const keys = await cache.keys();
  await Promise.all(keys.slice(0, Math.max(0, keys.length - max)).map((key) => cache.delete(key)));
}

async function store(name, request, response, max) {
  const cache = await caches.open(name);
  await cache.delete(request);
  await cache.put(request, response);
  await trim(name, max);
}

async function page(event, url) {
  const auth = url.pathname === "/connexion" || url.pathname === "/inscription";
  try {
    const response = await fetch(event.request);
    // Connexion, déconnexion ou session expirée (redirection) : les pages d'un compte ne restent pas sur l'appareil.
    if (auth || response.type === "opaqueredirect" || response.redirected) event.waitUntil(caches.delete(PAGES));
    else if (response.ok && response.type === "basic") event.waitUntil(store(PAGES, event.request, response.clone(), MAX_PAGES));
    return response;
  } catch {
    const cached = auth ? undefined : await caches.match(event.request, { cacheName: PAGES, ignoreVary: true });
    return cached ?? (await caches.match(OFFLINE_URL)) ?? Response.error();
  }
}

async function staticAsset(event) {
  const cached = await caches.match(event.request, { cacheName: STATIC });
  if (cached) return cached;
  const response = await fetch(event.request);
  if (response.ok) event.waitUntil(store(STATIC, event.request, response.clone(), MAX_STATIC));
  return response;
}

self.addEventListener("fetch", (event) => {
  const { request } = event;
  if (request.method !== "GET") return;
  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;
  if (request.mode === "navigate") event.respondWith(page(event, url));
  else if (url.pathname.startsWith("/_next/static/") || /^\/(icon-\d+|apple-touch-icon)\.png$/.test(url.pathname)) {
    event.respondWith(staticAsset(event));
  }
});
