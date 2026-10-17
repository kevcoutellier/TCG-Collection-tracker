"use client";

import { WifiOff } from "lucide-react";
import { useOffline } from "next/offline";
import { useEffect } from "react";

/** Nom du cache des pages dans public/sw.js. */
const PAGES_CACHE = "pokefolio-pages";

/** Installe le service worker (public/sw.js) : l'app s'ouvre sans réseau. Hors production, rien n'est mis en cache. */
export function ServiceWorkerRegistration() {
  useEffect(() => {
    if (process.env.NODE_ENV !== "production" || !("serviceWorker" in navigator)) return;
    navigator.serviceWorker.register("/sw.js", { scope: "/", updateViaCache: "none" }).catch(() => {});
  }, []);
  return null;
}

/**
 * Sur les pages de connexion : efface les pages gardées pour le hors ligne, pour qu'un autre compte
 * ouvert sur le même téléphone ne voie jamais la collection du précédent.
 */
export function ClearOfflinePages() {
  useEffect(() => {
    if ("caches" in window) caches.delete(PAGES_CACHE).catch(() => {});
  }, []);
  return null;
}

/** Bandeau hors ligne : les cartes cochées partent au retour du réseau, tant que l'app reste ouverte. */
export function OfflineBanner() {
  const offline = useOffline();
  if (!offline) return null;
  return (
    <div
      role="status"
      className="fixed inset-x-3 bottom-[calc(4.75rem+env(safe-area-inset-bottom))] z-50 mx-auto flex max-w-md items-start gap-2.5 rounded-xl border border-primary/40 bg-popover px-3.5 py-2.5 text-sm shadow-lg lg:bottom-4"
    >
      <WifiOff className="mt-0.5 size-4 shrink-0 text-primary" />
      <span>
        <strong className="font-medium">Hors ligne.</strong>{" "}
        <span className="text-muted-foreground">Vos modifications seront envoyées au retour du réseau : gardez l&apos;app ouverte.</span>
      </span>
    </div>
  );
}
