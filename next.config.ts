import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  cacheComponents: true,
  partialPrefetching: true,
  experimental: {
    // Hors ligne : navigations et actions serveur (cases cochées) attendent le retour du réseau puis partent.
    useOffline: true,
  },
  async headers() {
    // Le service worker doit toujours être relu, sinon une nouvelle version ne serait jamais installée.
    return [
      {
        source: "/sw.js",
        headers: [
          { key: "Content-Type", value: "application/javascript; charset=utf-8" },
          { key: "Cache-Control", value: "no-cache, no-store, must-revalidate" },
          { key: "Content-Security-Policy", value: "default-src 'self'; script-src 'self'" },
        ],
      },
    ];
  },
  // PGlite charge ses fichiers WASM à l'exécution : il ne doit pas être bundlé.
  serverExternalPackages: ["@electric-sql/pglite", "postgres"],
  turbopack: {
    root: process.cwd(),
    rules: {
      "*.css": {
        loaders: ["@tailwindcss/turbopack"],
        as: "*.css",
      },
    },
  },
};

export default nextConfig;
