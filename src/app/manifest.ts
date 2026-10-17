import type { MetadataRoute } from "next";

/**
 * Manifeste de l'application installable (PWA) : « Ajouter à l'écran d'accueil » sur iPhone (Safari)
 * ou « Installer l'application » sur Android (Chrome), sans passer par un store.
 */
export default function manifest(): MetadataRoute.Manifest {
  return {
    id: "/",
    name: "PokéFolio — Collection Pokémon TCG",
    short_name: "PokéFolio",
    description: "Cochez vos cartes extension par extension, suivez votre avancement et la cote de votre collection.",
    lang: "fr",
    start_url: "/",
    scope: "/",
    display: "standalone",
    orientation: "portrait",
    background_color: "#14161f",
    theme_color: "#14161f",
    categories: ["entertainment", "lifestyle"],
    icons: [
      { src: "/icon-192.png", sizes: "192x192", type: "image/png", purpose: "any" },
      { src: "/icon-512.png", sizes: "512x512", type: "image/png", purpose: "any" },
      // Poké Ball dans la zone sûre centrale : Android peut la recadrer en cercle ou en goutte.
      { src: "/icon-512.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
    ],
    shortcuts: [
      { name: "Extensions", url: "/sets", icons: [{ src: "/icon-192.png", sizes: "192x192" }] },
      { name: "Rechercher une carte", url: "/recherche", icons: [{ src: "/icon-192.png", sizes: "192x192" }] },
    ],
  };
}
